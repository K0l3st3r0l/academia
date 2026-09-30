const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Signed with a key derived from JWT_SECRET so a ticket is never accepted as a
// session token (authenticateToken, teacher:join) and a session token is never
// accepted as a ticket.
function ticketSecret() {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update('academia:room-ticket').digest();
}

function issueRoomTicket({ studentId, roomCode, displayName }) {
  const ticketId = crypto.randomUUID();
  const ticket = jwt.sign(
    { sid: studentId, room: roomCode, name: displayName },
    ticketSecret(),
    { expiresIn: '8h', jwtid: ticketId }
  );
  return { ticket, ticketId };
}

function verifyRoomTicket(ticket) {
  const payload = jwt.verify(ticket, ticketSecret());
  return { studentId: payload.sid, roomCode: payload.room, displayName: payload.name, ticketId: payload.jti };
}

module.exports = { issueRoomTicket, verifyRoomTicket };
