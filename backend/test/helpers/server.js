const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

// Starts the real Express app on a random port with its OWN data directory and config file, so a test can never
// touch the owner's config.json or ~/.config/mirrorial.
//
// The app reads its settings from the environment when index.js is first required, so call this once per test
// file (node --test runs every file in its own process) and before anything requires index.js.
//
//   const server = await startServer({ trustLocal: false });
//   const res = await server.request('GET', '/api/config', { token: server.token });
//   await server.close();
const TOKEN = 'test-token-0123456789abcdef';

const startServer = async ({ trustLocal = true, allowedOrigins = '' } = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirrorial-http-'));
  process.env.MIRRORIAL_DATA_DIR = path.join(dir, 'data');
  process.env.MIRRORIAL_CONFIG_PATH = path.join(dir, 'config.json');
  process.env.MIRRORIAL_ACCESS_TOKEN = TOKEN;
  process.env.MIRRORIAL_TRUST_LOCAL = trustLocal ? 'true' : 'false';
  process.env.MIRRORIAL_ALLOWED_ORIGINS = allowedOrigins;

  // eslint-disable-next-line global-require
  const { app } = require('../../index');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  // http.request instead of fetch: fetch does not let a test choose the Host header, which is exactly what the
  // DNS-rebinding checks need to vary.
  const request = (method, urlPath, { token = '', headers = {}, body = undefined } = {}) => new Promise((resolve, reject) => {
    const payload = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: urlPath,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(payload !== null ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (error) { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload !== null) {
      req.write(payload);
    }
    req.end();
  });

  const close = async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  };

  return {
    port,
    token: TOKEN,
    dir,
    request,
    close,
    readFile: (relative) => fs.readFileSync(path.join(dir, relative), 'utf8'),
    dataFile: (relative) => path.join(dir, 'data', relative),
  };
};

module.exports = { startServer, TOKEN };
