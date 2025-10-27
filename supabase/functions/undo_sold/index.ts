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

    const { data: asg } = await s.from('assignments').select('id, team_id, price').eq('auction_id', auction_id).eq('player_id', player_id).maybeSingle();
    if (!asg) return json({ error: 'no sale to undo' }, 400);

    const { error: delErr } = await s.from('assignments').delete().eq('id', asg.id);
    if (delErr) return json({ error: delErr.message }, 400);

    await s.from('auction_players').update({ status: 'available' }).eq('id', player_id);
    await s.from('auction_events').insert({ auction_id, type: 'player_sold_reverted', payload: { player_id, team_id: asg.team_id, amount: asg.price } });
    return json({ ok: true });
  } catch (e) { return json({ error: e.message || String(e) }, 500); }
}); 