const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Each purpose signs with its own key derived from JWT_SECRET, so a ticket is
// never accepted as a session token (authenticateToken, teacher:join), a
// session token is never accepted as a ticket, and a projector key is neither.
function derivedSecret(purpose) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(purpose).digest();
}

function issueRoomTicket({ studentId, roomCode, displayName }) {
  const ticketId = crypto.randomUUID();
  const ticket = jwt.sign(
    { sid: studentId, room: roomCode, name: displayName },
    derivedSecret('academia:room-ticket'),
    { expiresIn: '8h', jwtid: ticketId }
  );
  return { ticket, ticketId };
}

function verifyRoomTicket(ticket) {
  const payload = jwt.verify(ticket, derivedSecret('academia:room-ticket'));
  return { studentId: payload.sid, roomCode: payload.room, displayName: payload.name, ticketId: payload.jti };
}

// Lets a computer with no session show the projector: it can only watch this room.
function issueProjectorKey(roomCode) {
  return jwt.sign({ room: roomCode }, derivedSecret('academia:projector-key'), { expiresIn: '8h' });
}

function verifyProjectorKey(key) {
  return { roomCode: jwt.verify(key, derivedSecret('academia:projector-key')).room };
}

module.exports = { issueRoomTicket, verifyRoomTicket, issueProjectorKey, verifyProjectorKey };
