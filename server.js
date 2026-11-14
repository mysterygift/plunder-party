// Plunda the Bunda server.
//
//   npm start            -> starts the server and opens the TV screen
//   http://<laptop>:3000 -> what guests open on their phones (same wifi)
//   /host                -> the big screen (AirPlay this browser window to the TV)
//
// Phones and the TV each keep one Server-Sent-Events connection open to receive
// their latest "view", and POST small JSON messages back when something is
// tapped. No websockets, no build step.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { Room } from './src/engine.js';
import { CONTENT_DIR } from './src/content.js';
import { Narrator } from './src/speech.js';

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
};

// ----- network addresses -----

function localAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter(Boolean);
}

/** The laptop's address on the wifi network (what phones need to type). */
function lanAddress() {
  const nets = os.networkInterfaces();
  const usable = (list = []) => list.find((n) => n.family === 'IPv4' && !n.internal)?.address;
  return usable(nets.en0) ?? Object.values(nets).map(usable).find(Boolean) ?? 'localhost';
}

function urls() {
  const suffix = PORT === 80 ? '' : `:${PORT}`;
  const host = os.hostname().toLowerCase();
  return {
    join: `http://${lanAddress()}${suffix}`,
    display: `${lanAddress()}${suffix}`,
    alt: host.endsWith('.local') ? `${host}${suffix}` : null,
  };
}

/** Only the laptop itself may control the game (start, skip, end, kick). */
function isFromThisMachine(req) {
  const remote = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
  return remote === '127.0.0.1' || remote === '::1' || localAddresses().some((n) => n.address === remote);
}

const narrator = new Narrator();
narrator.clearCache();
const room = new Room({ getUrls: urls, narrator });

// ----- helpers -----

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 300_000) req.destroy(); // a drawn flag can run to tens of kilobytes
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}') ?? {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function serveFile(req, res, baseDir, relativePath) {
  const file = path.normalize(path.join(baseDir, relativePath));
  if (!file.startsWith(baseDir + path.sep)) return sendJson(res, 403, { error: 'Nope.' });
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    const type = MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' };
    const compressible = /^(text|application\/json|image\/svg)/.test(type) && data.length > 2048;
    if (compressible && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
      headers['Content-Encoding'] = 'gzip';
      data = zlib.gzipSync(data);
    }
    res.writeHead(200, headers);
    res.end(data);
  });
}

// ----- the live connection each screen keeps open -----

function openEventStream(req, res, url) {
  const isHost = url.searchParams.get('role') === 'host';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
  });
  res.write('retry: 1500\n\n');

  const client = {
    role: isHost ? 'host' : 'player',
    player: isHost ? null : room.playerByToken(url.searchParams.get('token')) ?? null,
    send: (data) => res.write(`data: ${JSON.stringify(data)}\n\n`),
  };
  room.addClient(client);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    room.removeClient(client);
  });
}

// ----- routes -----

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = `${req.method} ${url.pathname}`;

  try {
    switch (route) {
      case 'GET /':
        return serveFile(req, res, PUBLIC_DIR, 'play.html');
      case 'GET /host':
        return serveFile(req, res, PUBLIC_DIR, 'host.html');
      case 'GET /api/events':
        return openEventStream(req, res, url);
      case 'GET /api/qr.svg': {
        const svg = await QRCode.toString(urls().join, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2b1b0f', light: '#00000000' } });
        res.writeHead(200, { 'Content-Type': MIME['.svg'], 'Cache-Control': 'no-store' });
        return res.end(svg);
      }
      case 'POST /api/join': {
        const body = await readBody(req);
        return sendJson(res, 200, room.join(body.name, body.token));
      }
      case 'POST /api/action': {
        const body = await readBody(req);
        const player = room.playerByToken(body.token);
        if (!player) return sendJson(res, 401, { error: 'Not aboard' });
        room.playerAction(player, body);
        return sendJson(res, 200, { ok: true });
      }
      case 'POST /api/host': {
        if (!isFromThisMachine(req)) return sendJson(res, 403, { error: 'Only the host laptop can do that.' });
        room.hostAction(await readBody(req));
        return sendJson(res, 200, { ok: true });
      }
    }

    // A narrator line, rendered to audio. The request waits until the audio is ready.
    const speech = req.method === 'GET' && /^\/api\/speech\/([a-f0-9]{16})\.wav$/.exec(url.pathname);
    if (speech) {
      const file = await narrator.file(speech[1]);
      const data = file && (await fs.promises.readFile(file).catch(() => null));
      if (!data) return sendJson(res, 404, { error: 'No audio for that line' });
      res.writeHead(200, { 'Content-Type': MIME['.wav'], 'Cache-Control': 'no-store' });
      return res.end(data);
    }

    // Something a game parked on the server for screens to fetch once (a drawn flag).
    const asset = req.method === 'GET' && /^\/api\/asset\/([a-f0-9]{16})$/.exec(url.pathname);
    if (asset) {
      const data = room.assets.get(asset[1]);
      if (!data) return sendJson(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'private, max-age=3600' });
      return res.end(JSON.stringify(data));
    }

    if (req.method === 'GET' && url.pathname.startsWith('/content/')) {
      // Only the theme and the images are public; prompt files stay private.
      const rel = decodeURIComponent(url.pathname.slice('/content/'.length));
      if (rel === 'theme.css' || rel.startsWith('images/')) return serveFile(req, res, CONTENT_DIR, rel);
      return sendJson(res, 404, { error: 'Not found' });
    }
    if (req.method === 'GET') return serveFile(req, res, PUBLIC_DIR, decodeURIComponent(url.pathname));
    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Server error' });
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Try:  PORT=3001 npm start\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '0.0.0.0', () => {
  const hostUrl = `http://localhost:${PORT}/host`;
  const u = urls();
  console.log(`
  🏴‍☠️  ${room.party.title ?? 'Plunda the Bunda'} is afloat!

     Big screen (this laptop):  ${hostUrl}
     Phones (same wifi):        ${u.join}${u.alt ? `\n                                http://${u.alt}` : ''}

     Narrator voice:            ${narrator.available ? narrator.pickVoice(room.party.narrator?.voice) ?? 'your Mac’s system voice' : 'the browser’s built-in voice'}

     Press Ctrl+C to stop.
`);
  if (process.argv.includes('--open')) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
    exec(`${opener} "${hostUrl}"`, () => {});
  }
});
