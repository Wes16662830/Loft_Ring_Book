// Cloudflare Pages Function: every /api/* request. Logic lives in ../_lib/api.ts.
import { handleApi, type Db } from '../_lib/api.ts';

interface Env {
  DB: Db;
}

export const onRequest = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  const url = new URL(request.url);
  let body: unknown = null;
  if (request.method === 'POST' || request.method === 'PATCH') {
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Body must be JSON.' }, { status: 400 });
    }
  }
  const res = await handleApi(env.DB, request.method, url.pathname, body);
  return Response.json(res.body, { status: res.status, headers: { 'Cache-Control': 'no-store' } });
};
