import http from 'node:http';
import { Server } from 'socket.io';

export async function startTestServer() {
  const { app } = await import('../../src/app.js');
  const { setupGameSocket } = await import('../../src/sockets/gameSocket.js');

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  setupGameSocket(io);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  return {
    server,
    io,
    url: `http://localhost:${port}`,
    close: () => new Promise((resolve) => { io.close(); server.close(resolve); }),
  };
}
