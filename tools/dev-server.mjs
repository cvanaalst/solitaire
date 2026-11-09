import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PREFERRED = Number(process.env.PORT) || 8123;
const HOST = process.env.HOST || '127.0.0.1';

function lanAddresses() {
  const found = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) found.push(entry.address);
    }
  }
  return found;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(body);
}

function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  const target = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!target.startsWith(ROOT)) {
    send(res, 403, 'Forbidden');
    return;
  }

  readFile(target)
    .then((body) => send(res, 200, body, TYPES[extname(target)] || 'application/octet-stream'))
    .catch((error) => {
      if (error.code === 'ENOENT' || error.code === 'EISDIR') {
        send(res, 404, 'Not found: ' + pathname);
        return;
      }
      send(res, 500, 'Server error: ' + error.message);
    });
}

function start(port, attemptsLeft) {
  const server = createServer(handle);

  server.on('error', (error) => {
    server.close();
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.log('port ' + port + ' is busy, trying ' + (port + 1) + '...');
      start(port + 1, attemptsLeft - 1);
      return;
    }
    console.error('Could not start server: ' + error.message);
    process.exit(1);
  });

  server.listen(port, HOST, () => {
    const bound = server.address().port;
    const url = 'http://127.0.0.1:' + bound + '/';
    console.log('');
    console.log('  Solitaire is running at:  ' + url);
    const lan = lanAddresses();
    if (HOST === '0.0.0.0') {
      lan.forEach((address) => {
        console.log('  On your Wi-Fi network:   http://' + address + ':' + bound + '/');
      });
      console.log('  (open that address on the iPad, then Share > Add to Home Screen)');
    } else {
      console.log('  For the iPad run:        HOST=0.0.0.0 npm run dev');
    }
    console.log('  Serving:                 ' + ROOT);
    console.log('  Stop with Ctrl+C');
    console.log('');
    if (process.env.OPEN_BROWSER !== '0') {
      const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      spawn(command, [url], { stdio: 'ignore', detached: true }).unref();
    }
  });
}

start(PREFERRED, 20);
