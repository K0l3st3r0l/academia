const { createRateLimiter } = require('./rateLimiter');

module.exports = createRateLimiter({ windowMs: 15 * 60 * 1000, maxAttempts: 5 });
