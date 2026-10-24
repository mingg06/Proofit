import { serveConsole } from './console-static.ts';
import { Investigator } from '../investigator/runner.ts';
import { jsonBody, send } from './http-utils.ts';
import { OperationLedger } from './operations.ts';
import { Gateway } from './gateway.ts';
import { createServer, type IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { z, ZodError } from 'zod';
import { Foundation } from './foundation.ts';
import { HttpError } from './auth.ts';

function cookieToken(req: IncomingMessage): string | undefined {
  const values = (req.headers.cookie ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith('proofit_session='));
  if (values.length !== 1) return undefined;
  return values[0]?.slice('proofit_session='.length);
}
const querySchema = z.strictObject({ version: z.coerce.number().int().positive().default(1) });
export function createApi(foundation: Foundation, origin: string) {
  const gateway = new Gateway(foundation.store, { now: foundation.now });
  const investigator = new Investigator(gateway);
  const ledger = new OperationLedger(gateway);
  const secure = new URL(origin).protocol === 'https:';
  const cookie = (value: string, maxAge: number) => 'proofit_session=' + value + '; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + maxAge + (secure ? '; Secure' : '');
  // Local development protection. Distributed/deployed auth needs a shared rate limiter.
  const logins = new Map<string, { count: number; resetsAt: number }>();
  const server = createServer(async (req, res) => {
    try {
      const method = req.method ?? 'GET';
      const url = new URL(req.url ?? '/', origin);
      const path = url.pathname;
      if (req.headers.origin && req.headers.origin !== origin) throw new HttpError(403, 'Origin rejected');
      if(await serveConsole(req,res))return;
      if (method === 'GET' && path === '/health') return send(res, 200, { status: 'ok', stage: 'PERSISTENT_FOUNDATION', executionEnabled: false });
      if (method === 'POST' && req.headers.origin !== origin) throw new HttpError(403, 'Origin required');
      if (method === 'POST' && path === '/api/login') {
        const key = req.socket.remoteAddress ?? 'unknown';
        const previous = logins.get(key);
        const window = previous && previous.resetsAt > Date.now() ? previous : { count: 0, resetsAt: Date.now() + 60000 };
        if (++window.count > 20) throw new HttpError(429, 'Too many login attempts');
        if (logins.size > 10000) logins.clear();
        logins.set(key, window);
        const login = await foundation.auth.login(await jsonBody(req));
        res.setHeader('Set-Cookie', cookie(login.token, 8 * 60 * 60));
        return send(res, 200, { csrfToken: login.csrfToken, expiresAt: login.expiresAt });
      }
      const token = cookieToken(req);
      const session = foundation.auth.session(token);
      if (method === 'POST') {
        const csrf = req.headers['x-csrf-token'];
        if (typeof csrf !== 'string' || Buffer.byteLength(csrf) !== Buffer.byteLength(session.csrfToken) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrfToken))) {
          throw new HttpError(403, 'CSRF token required');
        }
      }
      if (method === 'GET' && path === '/api/session') return send(res, 200, { actor: session.actor, csrfToken: session.csrfToken });
      if (method === 'POST' && path === '/api/logout') {
        foundation.auth.logout(token!); res.setHeader('Set-Cookie', cookie('', 0)); return send(res, 200, { loggedOut: true });
      }
      if (method === 'POST' && path === '/api/investigations') return send(res,201,await investigator.start(token!,await jsonBody(req)));
      const investigationMatch=/^\/api\/investigations\/([^/]+)$/.exec(path);
      if(method==='GET'&&investigationMatch?.[1]) return send(res,200,investigator.get(token!,decodeURIComponent(investigationMatch[1])));
      if (method === 'POST' && path === '/api/validations') return send(res, 201, await gateway.validate(token!, await jsonBody(req)));
      const validationMatch = /^\/api\/validations\/([^/]+)$/.exec(path);
      if (method === 'GET' && validationMatch?.[1]) return send(res, 200, gateway.getValidation(token!, decodeURIComponent(validationMatch[1])));
      const operationMatch = /^\/api\/operations\/([^/]+)$/.exec(path);
      if (method === 'GET' && operationMatch?.[1]) return send(res,200,ledger.get(token!,decodeURIComponent(operationMatch[1])));
      if (method === 'GET' && path === '/api/resources') return send(res,200,foundation.listResources(token!));
      if (method === 'GET' && path === '/api/requests') return send(res, 200, foundation.listRequests(token!));
      if (method === 'POST' && path === '/api/requests') return send(res, 201, foundation.createRequest(token!, await jsonBody(req)));
      const match = /^\/api\/requests\/([^/]+)$/.exec(path);
      if (method === 'GET' && match?.[1]) {
        const query = querySchema.parse(Object.fromEntries(url.searchParams));
        return send(res, 200, foundation.getCase(token!, decodeURIComponent(match[1]), query.version));
      }
      const amendment = /^\/api\/requests\/([^/]+)\/versions$/.exec(path);
      if (method === 'POST' && amendment?.[1]) return send(res, 201, foundation.amendRequest(token!, decodeURIComponent(amendment[1]), await jsonBody(req)));
      if (method === 'POST' && path === '/api/confirm') return send(res, 200, foundation.confirm(token!, await jsonBody(req)));
      if (method === 'POST' && path === '/api/approvals') return send(res, 200, foundation.approve(token!, await jsonBody(req)));
      if (method === 'POST' && path === '/api/proposals') return send(res, 201, foundation.propose(token!, await jsonBody(req)));
      throw new HttpError(404, 'Route not found');
    } catch (error) {
      if (error instanceof HttpError) return send(res, error.status, { error: error.message });
      if (error instanceof ZodError || error instanceof URIError) return send(res, 400, { error: 'Invalid request' });
      // No raw database errors, credentials, proposals or evidence in logs/responses.
      send(res, 500, { error: 'Internal server error' });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.maxHeadersCount = 64;
  return server;
}
