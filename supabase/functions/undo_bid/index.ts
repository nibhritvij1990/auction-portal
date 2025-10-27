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

    const { data: last } = await s
      .from('bids')
      .select('id, team_id, amount')
      .eq('auction_id', auction_id)
      .eq('player_id', pid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) return json({ error: 'no bids to undo' }, 400);

    const { error: delErr } = await s.from('bids').delete().eq('id', last.id);
    if (delErr) return json({ error: delErr.message }, 400);

    const { data: teamRow } = await s.from('teams').select('name').eq('id', last.team_id).maybeSingle();
    await s.from('auction_events').insert({ auction_id, type: 'bid_reverted', payload: { player_id: pid, team_id: last.team_id, team_name: (teamRow as any)?.name || null, amount: last.amount } });
    return json({ ok: true });
  } catch (e) { return json({ error: e.message || String(e) }, 500); }
}); 