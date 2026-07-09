const logger = require('../logger');
const pool = require('../db');

function trackEvent({ actorType, actorId = null, eventType, roomId = null, sessionId = null, payload = {} }) {
  pool.query(`
    INSERT INTO events (actor_type, actor_id, event_type, room_id, session_id, payload)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [actorType, actorId, eventType, roomId, sessionId, JSON.stringify(payload)])
    .catch(err => logger.error({ err }, `trackEvent failed: ${eventType}`));
}

module.exports = { trackEvent };