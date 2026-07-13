const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

let attempts = new Map();

function isRateLimited(key) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAttemptAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function registerFailure(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAttemptAt > WINDOW_MS) {
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

module.exports = { isRateLimited, registerFailure, registerSuccess, _reset };
