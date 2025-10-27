// @ts-nocheck
export const CORS_HEADERS = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-max-age": "86400",
  "vary": "Origin"
};

export function preflight(req: Request, methods: string = "POST,OPTIONS") {
  if (req.method === 'OPTIONS') {
    const headers = { ...CORS_HEADERS, "access-control-allow-methods": methods };
    return new Response(null, { status: 204, headers });
  }
  return null;
}

export function json(body: unknown, status: number = 200, methods: string = "POST,OPTIONS") {
  const headers = { ...CORS_HEADERS, "access-control-allow-methods": methods };
  return new Response(JSON.stringify(body), { status, headers });
} 