const express = require('express');
const logger = require('../logger');
const { authenticateToken, requireStudent } = require('../middleware/auth');
const { inTransaction } = require('../db/transaction');
const { trackEvent } = require('../services/eventTracker');
const academy = require('../services/academy');

const router = express.Router();
router.use(authenticateToken, requireStudent);

// Every action answers with the full snapshot, so the game replaces its copy of the wallet with
// the server's instead of trusting its own arithmetic.
function action(label, fn) {
  return async (req, res) => {
    try {
      const body = await inTransaction(async client => {
        const result = await fn(client, req);
        const progress = await academy.lockProgress(client, req.user.id);
        return { ...result, snapshot: await academy.snapshot(client, req.user.id, progress) };
      });
      res.json(body);
    } catch (err) {
      if (err instanceof academy.AcademyError) return res.status(err.status).json({ error: err.message });
      logger.error({ err }, `academy ${label} error`);
      res.status(500).json({ error: 'No pudimos guardar en la Academia. Intenta de nuevo.' });
    }
  };
}

router.get('/me', action('me', async () => ({})));

router.put('/me/state', action('state', async (client, req) => {
  await academy.saveState(client, req.user.id, req.body?.state);
  return {};
}));

router.post('/me/intro-seen', action('intro', async (client, req) => {
  await academy.markIntroSeen(client, req.user.id);
  trackEvent({ actorType: 'student', actorId: req.user.id, eventType: 'academy_intro_seen' });
  return {};
}));

router.post('/shop/buy', action('buy', async (client, req) => {
  const item = await academy.buy(client, req.user.id, String(req.body?.itemId || ''));
  trackEvent({ actorType: 'student', actorId: req.user.id, eventType: 'academy_buy', payload: { item: item.id, price: item.price } });
  return { item: item.id };
}));

router.post('/shop/sell', action('sell', async (client, req) => ({
  refund: await academy.sell(client, req.user.id, String(req.body?.itemId || '')),
})));

router.post('/bank', action('bank', async (client, req) => {
  await academy.bankTransfer(client, req.user.id, Number(req.body?.amount), req.body?.withdraw === true);
  return {};
}));

router.post('/chests/:id/open', action('chest', async (client, req) => ({
  reward: await academy.openChest(client, req.user.id, req.params.id, req.body?.sparks),
})));

router.post('/practice', action('practice', async (client, req) => ({
  awarded: await academy.practiceReward(client, req.user.id),
})));

module.exports = router;
