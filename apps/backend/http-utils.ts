import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from './auth.ts';
export async function jsonBody(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') throw new HttpError(415, 'JSON content type required');
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let bytes = 0; let failed = false;
    req.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 65536) { failed = true; chunks.length = 0; reject(new HttpError(413, 'Request body too large')); }
      if (!failed) chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', () => reject(new HttpError(400, 'Incomplete request')));
    req.on('aborted', () => reject(new HttpError(400, 'Incomplete request')));
  });
}
export function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' });
  res.end(JSON.stringify(body));
}
