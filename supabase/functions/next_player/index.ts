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
      // Honor queue_scope
      const { data: a } = await s.from('auctions').select('current_set_id, queue_scope').eq('id', auction_id).maybeSingle();
      const scope = (a as any)?.queue_scope || 'default';
      if (scope === 'unsold') {
        const { data: ap } = await s
          .from('auction_players')
          .select('id')
          .eq('auction_id', auction_id)
          .eq('status', 'unsold')
          .order('created_at', { ascending: true })
          .limit(1);
        pid = ap && ap.length > 0 ? ap[0].id : null;
      } else if (scope === 'set') {
        if (!(a as any)?.current_set_id) {
          return json({ error: 'set not selected' }, 400);
        }
        const { data: apSet } = await s
          .from('auction_players')
          .select('id')
          .eq('auction_id', auction_id)
          .eq('status', 'available')
          .eq('set_id', (a as any).current_set_id)
          .order('created_at', { ascending: true })
          .limit(1);
        pid = apSet && apSet.length > 0 ? apSet[0].id : null;
      } else {
        const { data: ap } = await s
          .from('auction_players')
          .select('id')
          .eq('auction_id', auction_id)
          .eq('status', 'available')
          .order('created_at', { ascending: true })
          .limit(1);
        pid = ap && ap.length > 0 ? ap[0].id : null;
      }
    }
    if (!pid) return json({ error: 'no available player' }, 400);

    await s.from('auctions').update({ current_player_id: pid }).eq('id', auction_id);
    // Get player name for richer event payload
    const { data: pl } = await s.from('auction_players').select('name').eq('id', pid).maybeSingle();
    await s.from('auction_events').insert({ auction_id, type: 'current_player_set', payload: { player_id: pid, player_name: (pl as any)?.name || null } });
    return json({ ok: true, player_id: pid });
  } catch (e) { return json({ error: e.message || String(e) }, 500); }
}); 