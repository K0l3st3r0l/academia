// In-memory failure counter per key with a fixed window.
function createRateLimiter({ windowMs, maxAttempts }) {
  let attempts = new Map();

  function isRateLimited(key) {
    const entry = attempts.get(key);
    if (!entry) return false;
    if (Date.now() - entry.firstAttemptAt > windowMs) {
      attempts.delete(key);
      return false;
    }
    return entry.count >= maxAttempts;
  }

  function registerFailure(key) {
    const entry = attempts.get(key);
    if (!entry || Date.now() - entry.firstAttemptAt > windowMs) {
      attempts.set(key, { count: 1, firstAttemptAt: Date.now() });
    } else {
      entry.count += 1;
    }
  }

  function registerSuccess(key) {
    attempts.delete(key);
  }

  // Solo para tests: limpia el estado en memoria entre casos.
  function _reset() {
    attempts = new Map();
  }

  return { isRateLimited, registerFailure, registerSuccess, _reset };
}

module.exports = { createRateLimiter };
