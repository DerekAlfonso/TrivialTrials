import type { Config, Context } from '@netlify/functions';
import { handle } from '../../server/handlers';
import { supabaseStoreFromEnv } from '../../server/supabaseStore';

const store = supabaseStoreFromEnv();

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 });
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { status, body: result } = await handle(store, context.params.route, body);
  return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
};

export const config: Config = {
  path: '/api/:route',
};
