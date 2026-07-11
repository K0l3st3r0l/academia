const http = require('http');
const { Server } = require('socket.io');

const logger = require('./logger');
const runMigrations = require('./db/migrate');
const { app, allowedOrigins } = require('./app');
const { setupGameSocket, closeRoomForTeacher } = require('./sockets/gameSocket');

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
});

app.set('io', io);
app.set('closeRoomForTeacher', closeRoomForTeacher);
setupGameSocket(io);

process.on('unhandledRejection', (reason) => {
  logger.error({ stack: reason?.stack, reason: reason?.message || reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ stack: err?.stack }, 'Uncaught exception');
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
