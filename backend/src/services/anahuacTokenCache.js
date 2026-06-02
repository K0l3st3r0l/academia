const cache = new Map();
const TTL_MS = 12 * 60 * 60 * 1000;

function set(userId, token) {
  cache.set(userId, { token, expiresAt: Date.now() + TTL_MS });
}

function get(userId) {
  const entry = cache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(userId);
    return null;
  }
  return entry.token;
}

function clear(userId) {
  cache.delete(userId);
}

module.exports = { set, get, clear };
