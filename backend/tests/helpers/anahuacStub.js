import http from 'node:http';

// Stands in for the real Anahuac API in tests. `vi.mock` can't reach the
// service module here because it's required through a plain CJS require()
// chain (app.js -> routes -> anahuacService.js), which bypasses Vite's
// module graph entirely — so we fake the external HTTP boundary instead.
export function createAnahuacStub() {
  let handlers = {};
  const server = http.createServer((req, res) => {
    const key = `${req.method} ${req.url.split('?')[0]}`;
    const handler = handlers[key];
    if (!handler) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `no stub handler for ${key}` }));
      return;
    }
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : undefined;
      const result = handler({ headers: req.headers, body });
      res.writeHead(result.status ?? 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.body ?? {}));
    });
  });

  return {
    set(methodAndPath, handlerFn) {
      handlers[methodAndPath] = handlerFn;
    },
    reset() {
      handlers = {};
    },
    start() {
      return new Promise((resolve) => {
        server.listen(0, () => resolve(`http://localhost:${server.address().port}`));
      });
    },
    stop() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
