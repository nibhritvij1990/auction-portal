// @ts-nocheck
import { getServiceClient } from "../_shared/client.ts";
import { json, preflight } from "../_shared/cors.ts";
Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const { auction_id, player_id } = await req.json();
    if (!auction_id) return json({ error: 'auction_id required' }, 400);
    const s = getServiceClient();

    let pid = player_id as string | null;
    if (!pid) {
      const { data: q } = await s.from('v_auction_queue').select('next_player_id').eq('auction_id', auction_id).maybeSingle();
      pid = q?.next_player_id ?? null;
    }
    if (!pid) return json({ error: 'no current player' }, 400);

    await s.from('auction_players').update({ status: 'unsold' }).eq('id', pid);
    const { data: pl } = await s.from('auction_players').select('name').eq('id', pid).maybeSingle();
    await s.from('auction_events').insert({ auction_id, type: 'player_unsold', payload: { player_id: pid, player_name: (pl as any)?.name || null } });
    // Clear current player so UIs reset until next player is explicitly loaded
    await s.from('auctions').update({ current_player_id: null }).eq('id', auction_id);
    return json({ ok: true });
  } catch (e) { return json({ error: e.message || String(e) }, 500); }
}); 