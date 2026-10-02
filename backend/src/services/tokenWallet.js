class InsufficientTokensError extends Error {
  constructor(balance, price) {
    super('insufficient_tokens');
    this.balance = balance;
    this.price = price;
  }
}

// Debits inside the caller's transaction. The balance check and the debit are one
// UPDATE, so two purchases at once can never take the balance below zero.
async function spendTokens(client, { studentId, amount, reason }) {
  const { rows } = await client.query(
    `UPDATE local_students SET tokens_balance = tokens_balance - $2
     WHERE id = $1 AND tokens_balance >= $2
     RETURNING tokens_balance`,
    [studentId, amount]
  );
  if (!rows.length) {
    const { rows: current } = await client.query('SELECT tokens_balance FROM local_students WHERE id = $1', [studentId]);
    throw new InsufficientTokensError(current[0]?.tokens_balance ?? 0, amount);
  }
  await client.query(
    'INSERT INTO token_ledger (student_id, amount, reason) VALUES ($1, $2, $3)',
    [studentId, -amount, reason]
  );
  return rows[0].tokens_balance;
}

function insufficientTokens(res, err) {
  return res.status(400).json({
    error: `Te faltan tokens: cuesta ${err.price} y tienes ${err.balance}.`,
    code: 'insufficient_tokens',
  });
}

module.exports = { spendTokens, InsufficientTokensError, insufficientTokens };
