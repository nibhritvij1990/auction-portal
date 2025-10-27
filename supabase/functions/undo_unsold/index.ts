// @ts-nocheck
import { getServiceClient } from "../_shared/client.ts";
import { json, preflight } from "../_shared/cors.ts";
Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const { auction_id, player_id } = await req.json();
    if (!auction_id || !player_id) return json({ error: 'auction_id and player_id required' }, 400);
    const s = getServiceClient();

    const { data: ap } = await s.from('auction_players').select('status').eq('id', player_id).maybeSingle();
    if (!ap || ap.status !== 'unsold') return json({ error: 'not unsold' }, 400);

    await s.from('auction_players').update({ status: 'available' }).eq('id', player_id);
    await s.from('auction_events').insert({ auction_id, type: 'player_unsold_reverted', payload: { player_id } });
    return json({ ok: true });
  } catch (e) { return json({ error: e.message || String(e) }, 500); }
}); 