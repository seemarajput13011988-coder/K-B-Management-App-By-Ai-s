import { handleApi } from '../../functions/src/http-api';

type NetlifyEvent = {
  httpMethod: string;
  path: string;
  rawUrl?: string;
  headers: Record<string, string | undefined>;
  body: string | null;
  isBase64Encoded?: boolean;
};

export async function handler(event: NetlifyEvent) {
  const rawUrl = event.rawUrl || `https://netlify.local${event.path}`;
  const url = new URL(rawUrl);
  const functionPrefix = '/.netlify/functions/api';
  const path = url.pathname.startsWith(functionPrefix)
    ? url.pathname.slice(functionPrefix.length) || '/'
    : url.pathname;
  const headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value || ''])
  );
  let body: any = {};
  if (event.body) {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf8')
      : event.body;
    try { body = JSON.parse(rawBody); }
    catch { body = {}; }
  }
  const req = {
    method: event.httpMethod || 'GET',
    path,
    headers,
    body,
    query: Object.fromEntries(url.searchParams.entries()),
  };
  let statusCode = 200;
  const responseHeaders: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
  let responseBody = '';
  const res = {
    status(code: number) { statusCode = code; return this; },
    set(name: string, value: string) { responseHeaders[name.toLowerCase()] = value; return this; },
    json(value: unknown) { responseBody = JSON.stringify(value); return this; },
    send(value: unknown) { responseBody = typeof value === 'string' ? value : JSON.stringify(value ?? ''); return this; },
  };

  try {
    await handleApi(req, res);
  } catch (error) {
    console.error('K&B API function failed:', error);
    statusCode = 500;
    responseBody = JSON.stringify({ error: 'The K&B API could not complete this request. Please try again.' });
  }
  return { statusCode, headers: responseHeaders, body: responseBody };
}
