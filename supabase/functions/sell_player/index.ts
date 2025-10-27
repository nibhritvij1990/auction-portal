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

    const { data: bid } = await s
      .from('bids')
      .select('team_id, amount')
      .eq('auction_id', auction_id)
      .eq('player_id', pid)
      .order('amount', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!bid) return json({ error: 'no bids to sell' }, 400);

    const { error: insErr } = await s.from('assignments').insert({ auction_id, player_id: pid, team_id: bid.team_id, price: bid.amount });
    if (insErr) return json({ error: insErr.message }, 400);

    await s.from('auction_players').update({ status: 'sold' }).eq('id', pid);
    // Enrich payload with names for activity log
    const [{ data: pl }, { data: tm }] = await Promise.all([
      s.from('auction_players').select('name').eq('id', pid).maybeSingle(),
      s.from('teams').select('name').eq('id', bid.team_id).maybeSingle()
    ]);
    await s.from('auction_events').insert({ auction_id, type: 'player_sold', payload: { player_id: pid, player_name: (pl as any)?.name || null, team_id: bid.team_id, team_name: (tm as any)?.name || null, amount: bid.amount } });
    // Clear current player so UIs reset until next player is explicitly loaded
    await s.from('auctions').update({ current_player_id: null }).eq('id', auction_id);
    return json({ ok: true });
  } catch (e) { return json({ error: e.message || String(e) }, 500); }
}); 