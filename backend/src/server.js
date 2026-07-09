const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const logger = require('./logger');
const runMigrations = require('./db/migrate');
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const questionRoutes = require('./routes/questionRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const { setupGameSocket } = require('./sockets/gameSocket');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:4101',
  process.env.FRONTEND_URL,
  'https://games.laravas.com',
].filter(Boolean);

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: allowedOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }));
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, 'request');
  next();
});

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'academia-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/sessions', sessionRoutes);

setupGameSocket(io);

app.use((err, req, res, _next) => {
  logger.error({ err, url: req.url }, 'unhandled error');
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4100;

async function start() {
  try {
    await runMigrations();
    logger.info('Migrations OK');
    server.listen(PORT, () => logger.info(`AcademIA backend running on :${PORT}`));
  } catch (err) {
    logger.error({ err }, 'Startup error');
    process.exit(1);
  }
}

start();
