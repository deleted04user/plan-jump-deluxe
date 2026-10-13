import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const project = fileURLToPath(new URL('../', import.meta.url));
const root = args.includes('--production') ? resolve(project, 'dist') : project;
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 5173;
const hostIndex = args.indexOf('--host');
const host = hostIndex >= 0 ? args[hostIndex + 1] : '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webp': 'image/webp' };

const server = http.createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const testPage = !args.includes('--production') && pathname === '/tests/camera-model.html';
    if (pathname !== '/' && pathname !== '/index.html' && !/^\/(src|assets|public)\//.test(pathname) && !testPage) { response.writeHead(404); response.end('Not found'); return; }
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const local = relative(root, file);
    if (local.startsWith(`..${sep}`) || local === '..' || local.startsWith(sep)) { response.writeHead(403); response.end(); return; }
    if (!(await stat(file)).isFile()) { response.writeHead(404); response.end(); return; }
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Permissions-Policy': 'camera=(self)', 'Content-Length': data.length });
    response.end(request.method === 'HEAD' ? undefined : data);
  } catch { response.writeHead(404); response.end('Not found'); }
});
server.listen(port, host, () => console.log(`Plan-Jump Deluxe: http://${host}:${port}${args.includes('--production') ? ' (production build)' : ''}`));
server.on('error', error => { console.error(error.message); process.exit(1); });
