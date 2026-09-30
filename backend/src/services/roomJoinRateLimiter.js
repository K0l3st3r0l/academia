const { createRateLimiter } = require('./rateLimiter');

// Keyed by room code, not IP: a whole class shares the school's public IP.
// A class mistyping RUTs stays well under the cap; a script walking the RUT
// range of a course to learn who is in it does not.
module.exports = createRateLimiter({ windowMs: 15 * 60 * 1000, maxAttempts: 40 });
