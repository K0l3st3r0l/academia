const express = require('express');
const cors = require('cors');

const logger = require('./logger');
const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const questionRoutes = require('./routes/questionRoutes');
const sessionRoutes = require('./routes/sessionRoutes');

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

app.get('/health', (_, res) => res.json({ status: 'ok', service: 'academia-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/sessions', sessionRoutes);

app.use((err, req, res, _next) => {
  logger.error({ err, url: req.url }, 'unhandled error');
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = { app, allowedOrigins };
