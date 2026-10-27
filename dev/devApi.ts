import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { handle } from '../server/handlers';
import { MemoryStore } from '../server/memoryStore';

// Local development backend: serves /api/* from an in-memory store and streams state and
// presence over Server-Sent Events, so the whole game runs with `npm run dev` and no Supabase.

interface Client {
  res: ServerResponse;
  presence: { id: string; role: string; name?: string };
}

export function devApi(): Plugin {
  const store = new MemoryStore();
  const rooms = new Map<string, Set<Client>>();

  const send = (res: ServerResponse, event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const broadcastPresence = (code: string) => {
    const room = rooms.get(code);
    if (!room) return;
    const list = [...room].map((c) => c.presence);
    room.forEach((c) => send(c.res, 'presence', list));
  };

  const readBody = (req: IncomingMessage) =>
    new Promise<Record<string, unknown>>((resolve) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve({});
        }
      });
    });

  return {
    name: 'trivial-trials-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        const route = url.pathname.slice('/api/'.length);

        if (route === 'events') {
          const code = (url.searchParams.get('code') ?? '').toUpperCase();
          const game = await store.load(code);
          if (!game) {
            res.statusCode = 404;
            return res.end();
          }
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });
          const client: Client = {
            res,
            presence: {
              id: url.searchParams.get('id') ?? 'anon',
              role: url.searchParams.get('role') ?? 'player',
            },
          };
          if (!rooms.has(code)) rooms.set(code, new Set());
          rooms.get(code)!.add(client);
          send(res, 'state', { state: game.state, version: game.version });
          const unsubscribe = store.subscribe(code, (g) => send(res, 'state', { state: g.state, version: g.version }));
          broadcastPresence(code);
          const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
          req.on('close', () => {
            clearInterval(ping);
            unsubscribe();
            rooms.get(code)?.delete(client);
            broadcastPresence(code);
          });
          return;
        }

        if (req.method !== 'POST') return next();
        const result = await handle(store, route, await readBody(req));
        res.statusCode = result.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result.body));
      });
    },
  };
}
