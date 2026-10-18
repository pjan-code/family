// Lokal förhandsvisning: serverar web/ + site/data.enc.json på http://localhost:8080
// Kör först:  FAMILY_KEY=<nyckel> npm run sync:local
// Öppna:      http://localhost:8080/#k=<nyckel>
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('web');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = p.startsWith('/data') ? path.resolve('site', '.' + p) : path.join(root, p);
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
}).listen(8080, () => console.log('http://localhost:8080'));
