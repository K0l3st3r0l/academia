import http from 'node:http';
import { Server } from 'socket.io';

export async function startTestServer() {
  const { app } = await import('../../src/app.js');
  const { setupGameSocket, closeRoomForTeacher } = await import('../../src/sockets/gameSocket.js');
  const { setupAcademySocket } = await import('../../src/sockets/academySocket.js');

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });
  app.set('io', io);
  app.set('closeRoomForTeacher', closeRoomForTeacher);
  setupGameSocket(io);
  const academy = setupAcademySocket(io);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  return {
    server,
    io,
    url: `http://localhost:${port}`,
    academy,
    close: () => new Promise((resolve) => { academy.stop(); io.close(); server.close(resolve); }),
  };
}
