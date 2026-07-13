const express = require('express');
const cors = require('cors');

const logger = require('./logger');
const pool = require('./db');
const packageJson = require('../package.json');
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const questionRoutes = require('./routes/questionRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const studentRoutes = require('./routes/studentRoutes');
const { getActiveRoomsCount } = require('./sockets/gameSocket');

const DB_HEALTHCHECK_TIMEOUT_MS = 2000;

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:4101',
  process.env.FRONTEND_URL,
  'https://games.laravas.com',
].filter(Boolean);

const app = express();

app.use(cors({ origin: allowedOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }));
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, 'request');
  next();
});

async function checkDb() {
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB health check timeout')), DB_HEALTHCHECK_TIMEOUT_MS)),
    ]);
    return true;
  } catch {
    return false;
  }
}

app.get('/health', async (req, res) => {
  const dbOk = await checkDb();
  const io = req.app.get('io');

  res.status(dbOk ? 200 : 503).json({
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'ok' : 'error',
    activeRooms: getActiveRoomsCount(),
    connectedSockets: io ? io.engine.clientsCount : 0,
    uptimeSeconds: Math.round(process.uptime()),
    version: packageJson.version,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/students', studentRoutes);

app.use((err, req, res, _next) => {
  logger.error({ method: req.method, path: req.path, userId: req.user?.id, stack: err.stack }, err.message || 'unhandled error');
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = { app, allowedOrigins };
