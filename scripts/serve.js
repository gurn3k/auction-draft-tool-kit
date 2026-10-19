// Minimal server for previewing site/ locally, plus /api/ask run the way Vercel
// runs it (OPENROUTER_API_KEY from .env.local). Not used in production.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = 'site';
const PORT = Number(process.env.PORT) || 8080;
const vercel = JSON.parse(await readFile('vercel.json', 'utf8'));
const HEADERS = Object.fromEntries(vercel.headers.flatMap((h) => h.headers.map(({ key, value }) => [key, value])));
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

// Loopback only: this preview is for the machine it runs on, not the local network.
// It applies the same headers as Vercel (vercel.json), so the CSP is tested locally.
createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/ask') {
    const { POST } = await import('../api/ask.js');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = { ...req.headers, 'x-forwarded-for': req.socket.remoteAddress };
    const r = await POST(new Request(`http://${req.headers.host}/api/ask`, { method: 'POST', headers, body: Buffer.concat(chunks) }));
    res.writeHead(r.status, { ...HEADERS, ...Object.fromEntries(r.headers) }).end(await r.text());
    return;
  }
  try {
    // Inside the try: a malformed escape like %E0%A4%A makes decodeURIComponent throw.
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, path.endsWith('/') ? `${path}index.html` : path);
    const body = await readFile(file);
    res.writeHead(200, { ...HEADERS, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, HEADERS).end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Serving ${ROOT}/ at http://localhost:${PORT}`));
