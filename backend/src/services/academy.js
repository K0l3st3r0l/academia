const fs = require('fs');
const path = require('path');
const { spendTokens, InsufficientTokensError } = require('./tokenWallet');
const { giveCopihues, spendCopihues, InsufficientCopihuesError } = require('./copihues');

// Written by art/academia/lobby/build.py from the same data the game shows.
const CANDIDATE_PATHS = [
  path.join(__dirname, '../../../shared/academy/economia.json'),
  path.join(__dirname, '../../shared/academy/economia.json'),
];
const economyPath = CANDIDATE_PATHS.find(p => fs.existsSync(p));
if (!economyPath) throw new Error('No se encontró shared/academy/economia.json');
const ECONOMY = JSON.parse(fs.readFileSync(economyPath, 'utf8'));
// Whether every student sees the Academy, or only test accounts while it is being tried out.
// Read on every request, so opening it is editing shared/academy/config.json, no restart.
const configPath = economyPath.replace('economia.json', 'config.json');
function academyOpen() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')).abierta === true;
  } catch {
    return false;
  }
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const INTEREST_RATE = 0.05;
const INTEREST_CAP = 10;
const MAX_STATE_BYTES = 64 * 1024;
// Enough to buy a keepsake or two on the first visit and learn how the shop works.
const WELCOME_GIFT = 30;
// The wallet lives in columns and tables; the game's copy of it is never trusted.
const SERVER_KEYS = ['tokens', 'copihues', 'items', 'chests', 'bank'];

class AcademyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const catalogItem = id => ECONOMY.catalog.find(i => i.id === id);
const chestById = id => ECONOMY.chests.find(c => c.id === id);
const currencyOf = item => (item.currency === 'copihues' ? 'copihues' : 'tokens');

// Same rule as accrueInterest in the lobby: 5 % of the savings per whole week, at most 10.
function accrue(balance, lastWeek, now) {
  if (now <= lastWeek) return { balance, lastWeek, earned: 0 };
  const weeks = Math.floor((now - lastWeek) / WEEK_MS);
  let earned = 0;
  for (let i = 0; i < weeks; i += 1) {
    const gain = Math.min(INTEREST_CAP, Math.floor(balance * INTEREST_RATE));
    if (gain === INTEREST_CAP || gain === 0) {
      earned += gain * (weeks - i);
      balance += gain * (weeks - i);
      break;
    }
    balance += gain;
    earned += gain;
  }
  return { balance, lastWeek: lastWeek + weeks * WEEK_MS, earned };
}

function itemDetails(id) {
  const fromShop = catalogItem(id);
  if (fromShop) return { id, name: fromShop.name, text: fromShop.text || '' };
  const chest = ECONOMY.chests.find(c => c.reward?.item?.id === id);
  return chest ? { id, name: chest.reward.item.name, text: chest.reward.item.text || '' } : null;
}

// Locks the student's progress row for the rest of the transaction, creating it on first use,
// and pays any interest owed.
async function lockProgress(client, studentId, now = Date.now()) {
  await client.query('INSERT INTO academy_progress (student_id) VALUES ($1) ON CONFLICT DO NOTHING', [studentId]);
  const { rows: [row] } = await client.query(
    'SELECT state, bank_balance, bank_last_week, intro_seen_at, welcome_gift_at FROM academy_progress WHERE student_id = $1 FOR UPDATE',
    [studentId]
  );
  const bank = accrue(row.bank_balance, row.bank_last_week.getTime(), now);
  if (bank.earned > 0 || bank.lastWeek !== row.bank_last_week.getTime()) {
    await client.query(
      'UPDATE academy_progress SET bank_balance = $2, bank_last_week = $3, updated_at = NOW() WHERE student_id = $1',
      [studentId, bank.balance, new Date(bank.lastWeek)]
    );
    if (bank.earned > 0) {
      await client.query(
        "INSERT INTO academy_bank_ledger (student_id, amount, kind) VALUES ($1, $2, 'interest')",
        [studentId, bank.earned]
      );
    }
  }
  return {
    state: row.state, bank: { balance: bank.balance, lastWeek: bank.lastWeek }, introSeenAt: row.intro_seen_at,
    welcomeGift: row.welcome_gift_at ? WELCOME_GIFT : 0, interest: bank.earned,
  };
}

async function practiceRewardsToday(client, studentId) {
  const { rows: [row] } = await client.query(
    `SELECT COUNT(*)::int AS n FROM token_ledger
     WHERE student_id = $1 AND reason = 'academy_practice'
       AND (created_at AT TIME ZONE 'America/Santiago')::date = (NOW() AT TIME ZONE 'America/Santiago')::date`,
    [studentId]
  );
  return row.n;
}

// Everything the game needs to start, or to correct itself after an action.
async function snapshot(client, studentId, progress) {
  const [{ rows: [student] }, { rows: items }, { rows: chests }, practiceToday] = await Promise.all([
    client.query('SELECT first_name, tokens_balance, copihues_balance, is_test FROM local_students WHERE id = $1', [studentId]),
    client.query('SELECT item_id FROM academy_items WHERE student_id = $1 ORDER BY acquired_at, item_id', [studentId]),
    client.query('SELECT chest_id FROM academy_chests WHERE student_id = $1 ORDER BY opened_at', [studentId]),
    practiceRewardsToday(client, studentId),
  ]);
  return {
    open: academyOpen() || student.is_test === true,
    firstName: student.first_name.split(' ')[0],
    tokens: student.tokens_balance ?? 0,
    copihues: student.copihues_balance ?? 0,
    items: items.map(r => itemDetails(r.item_id)).filter(Boolean),
    chests: chests.map(r => r.chest_id),
    bank: progress.bank,
    interest: progress.interest,
    practiceLeft: Math.max(0, (ECONOMY.practice.dailyRewards ?? 3) - practiceToday),
    state: progress.state,
    introSeenAt: progress.introSeenAt,
    welcomeGift: progress.welcomeGift,
  };
}

function cleanState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw new AcademyError('La partida no es válida.');
  const clean = { ...state };
  for (const key of SERVER_KEYS) delete clean[key];
  if (Buffer.byteLength(JSON.stringify(clean)) > MAX_STATE_BYTES) throw new AcademyError('La partida es demasiado grande.', 413);
  return clean;
}

async function saveState(client, studentId, state) {
  await lockProgress(client, studentId);
  await client.query('UPDATE academy_progress SET state = $2, updated_at = NOW() WHERE student_id = $1', [studentId, cleanState(state)]);
}

// The first time the film ends, the student also gets the welcome gift.
async function markIntroSeen(client, studentId) {
  await lockProgress(client, studentId);
  const { rows } = await client.query(
    `UPDATE academy_progress SET intro_seen_at = COALESCE(intro_seen_at, NOW()),
       welcome_gift_at = COALESCE(welcome_gift_at, NOW()), updated_at = NOW()
     WHERE student_id = $1 AND welcome_gift_at IS NULL RETURNING student_id`,
    [studentId]
  );
  if (rows.length) await credit(client, studentId, WELCOME_GIFT, 'academy_welcome');
}

async function credit(client, studentId, amount, reason) {
  if (amount <= 0) return;
  await client.query('UPDATE local_students SET tokens_balance = tokens_balance + $2 WHERE id = $1', [studentId, amount]);
  await client.query('INSERT INTO token_ledger (student_id, amount, reason) VALUES ($1, $2, $3)', [studentId, amount, reason]);
}

async function buy(client, studentId, itemId) {
  const item = catalogItem(itemId);
  if (!item) throw new AcademyError('Ese objeto no está en la tienda.', 404);
  await lockProgress(client, studentId);
  const { rowCount } = await client.query(
    "INSERT INTO academy_items (student_id, item_id, source) VALUES ($1, $2, 'shop') ON CONFLICT DO NOTHING",
    [studentId, itemId]
  );
  if (!rowCount) throw new AcademyError('Ya lo tienes en tu mochila.', 409);
  if (currencyOf(item) === 'copihues') {
    try {
      await spendCopihues(client, { studentId, amount: item.price, reason: 'academy_shop', detail: item.name });
    } catch (err) {
      if (err instanceof InsufficientCopihuesError) throw new AcademyError('Te faltan copihues para este recuerdo.');
      throw err;
    }
  } else {
    try {
      await spendTokens(client, { studentId, amount: item.price, reason: 'academy_shop' });
    } catch (err) {
      if (err instanceof InsufficientTokensError) throw new AcademyError('Necesitas más tokens para este recuerdo.');
      throw err;
    }
  }
  return item;
}

// Selling returns half the price, in the currency it was bought with. Chest rewards are keepsakes.
async function sell(client, studentId, itemId) {
  const item = catalogItem(itemId);
  if (!item) throw new AcademyError('Ese objeto no se puede vender.', 404);
  await lockProgress(client, studentId);
  const { rowCount } = await client.query('DELETE FROM academy_items WHERE student_id = $1 AND item_id = $2', [studentId, itemId]);
  if (!rowCount) throw new AcademyError('Todavía no tienes ese objeto.', 404);
  const refund = Math.floor(item.price / 2);
  if (currencyOf(item) === 'copihues') {
    if (refund > 0) await giveCopihues(client, { studentId, amount: refund, reason: 'academy_sell', detail: item.name });
  } else {
    await credit(client, studentId, refund, 'academy_sell');
  }
  return refund;
}

async function bankTransfer(client, studentId, amount, withdraw, now = Date.now()) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new AcademyError('Elige una cantidad entera mayor que cero.');
  const { bank } = await lockProgress(client, studentId, now);
  if (withdraw) {
    if (amount > bank.balance) throw new AcademyError('No tienes tantos tokens ahorrados.');
    await client.query('UPDATE academy_progress SET bank_balance = bank_balance - $2, updated_at = NOW() WHERE student_id = $1', [studentId, amount]);
    await credit(client, studentId, amount, 'academy_bank_withdraw');
  } else {
    try {
      await spendTokens(client, { studentId, amount, reason: 'academy_bank_deposit' });
    } catch (err) {
      if (err instanceof InsufficientTokensError) throw new AcademyError('No tienes tantos tokens en tu mochila.');
      throw err;
    }
    // An empty account starts its first whole savings week at its first deposit.
    await client.query(
      `UPDATE academy_progress SET bank_balance = bank_balance + $2,
         bank_last_week = CASE WHEN bank_balance = 0 THEN $3 ELSE bank_last_week END, updated_at = NOW()
       WHERE student_id = $1`,
      [studentId, amount, new Date(now)]
    );
  }
  await client.query(
    'INSERT INTO academy_bank_ledger (student_id, amount, kind) VALUES ($1, $2, $3)',
    [studentId, withdraw ? -amount : amount, withdraw ? 'withdraw' : 'deposit']
  );
}

// The sparks found come with the request: the chest may open right after the last one, before
// the game's periodic save reaches the server.
async function openChest(client, studentId, chestId, sparks = []) {
  const chest = chestById(chestId);
  if (!chest) throw new AcademyError('Ese cofre no existe.', 404);
  const { state } = await lockProgress(client, studentId);
  const known = new Set(ECONOMY.sparks);
  const found = new Set([...(Array.isArray(state.sparks) ? state.sparks : []), ...(Array.isArray(sparks) ? sparks : [])]
    .filter(id => known.has(id)));
  if (chest.requiresSparks && found.size < chest.requiresSparks) throw new AcademyError('El cofre sigue cerrado: faltan chispas.', 403);
  const { rowCount } = await client.query(
    'INSERT INTO academy_chests (student_id, chest_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [studentId, chestId]
  );
  if (!rowCount) throw new AcademyError('Ya abriste este cofre.', 409);
  await client.query(
    'UPDATE academy_progress SET state = jsonb_set(state, \'{sparks}\', $2::jsonb), updated_at = NOW() WHERE student_id = $1',
    [studentId, JSON.stringify([...found])]
  );
  const { tokens = 0, copihues = 0, item } = chest.reward || {};
  await credit(client, studentId, tokens, 'academy_chest');
  if (copihues > 0) {
    await giveCopihues(client, { studentId, amount: copihues, reason: 'academy_chest', detail: chest.id, sourceKey: `academy_chest:${chest.id}` });
  }
  if (item) {
    await client.query(
      'INSERT INTO academy_items (student_id, item_id, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [studentId, item.id, chest.id]
    );
  }
  return chest.reward || {};
}

// Lobby practice pays a little, a few times a day: its answers are checked in the browser.
async function practiceReward(client, studentId) {
  await lockProgress(client, studentId);
  const left = (ECONOMY.practice.dailyRewards ?? 3) - await practiceRewardsToday(client, studentId);
  if (left <= 0) return 0;
  const amount = ECONOMY.practice.tokensEach ?? 2;
  await credit(client, studentId, amount, 'academy_practice');
  return amount;
}

module.exports = {
  ECONOMY, WEEK_MS, WELCOME_GIFT, AcademyError, accrue, lockProgress, snapshot, saveState, markIntroSeen,
  buy, sell, bankTransfer, openChest, practiceReward,
};
