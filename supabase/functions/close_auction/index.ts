// @ts-nocheck
import { getServiceClient } from "../_shared/client.ts";
import { json, preflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const { auction_id } = await req.json();
    if (!auction_id) return json({ error: 'auction_id required' }, 400);
    const s = getServiceClient();
    const { error } = await s.from('auctions').update({ status: 'completed' }).eq('id', auction_id);
    if (error) return json({ error: error.message }, 400);
    await s.from('auction_events').insert({ auction_id, type: 'auction_closed', payload: {} });
    return json({ ok: true });
  } catch (e) { return json({ error: e.message || String(e) }, 500); }
}); 