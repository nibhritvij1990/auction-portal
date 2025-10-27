// @ts-nocheck
import { getServiceClient } from "../_shared/client.ts";
import { json, preflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  try {
    const { auction_id, team_id, player_id, amount, by_user, idempotency_key } = await req.json();
    if (!auction_id || !team_id || amount === undefined || amount === null) return json({ error: 'auction_id, team_id, amount required' }, 400);
    const s = getServiceClient();

    const { data: a } = await s.from('auctions').select('status, base_price').eq('id', auction_id).maybeSingle();
    if (!a || a.status !== 'live') return json({ error: 'auction not live' }, 400);
    const auctionBase = Number(a.base_price ?? 0);

    const { data: t } = await s.from('teams').select('id').eq('id', team_id).eq('auction_id', auction_id).maybeSingle();
    if (!t) return json({ error: 'team not in auction' }, 400);

    const tenSecAgo = new Date(Date.now() - 10_000).toISOString();
    const { data: dup } = await s
      .from('bids')
      .select('id')
      .eq('auction_id', auction_id)
      .eq('team_id', team_id)
      .eq('player_id', player_id ?? null)
      .eq('amount', amount)
      .gte('created_at', tenSecAgo)
      .maybeSingle();
    if (dup) return json({ ok: true, deduped: true });

    let current = 0;
    let hasPrev = false;
    if (player_id) {
      const { data: hi } = await s
        .from('bids')
        .select('amount')
        .eq('auction_id', auction_id)
        .eq('player_id', player_id)
        .order('amount', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (hi?.amount !== undefined && hi?.amount !== null) { current = Number(hi.amount); hasPrev = true; }
      else {
        const { data: base } = await s.from('auction_players').select('base_price').eq('id', player_id).maybeSingle();
        current = Number(base?.base_price ?? auctionBase);
      }
    } else {
      current = auctionBase;
    }

    // First bid must equal current (base), subsequent must be current + step
    let requiredNext = 0;
    if (!hasPrev) {
      requiredNext = current; // equals base
      if (Number(amount) !== requiredNext) return json({ error: 'invalid amount', details: { expected: requiredNext } }, 400);
    } else {
      // determine step from increment rules
      const { data: rulesAsc } = await s
        .from('increment_rules')
        .select('threshold, increment')
        .eq('auction_id', auction_id)
        .order('threshold', { ascending: true });
      let step = 1;
      if (rulesAsc && rulesAsc.length > 0) {
        const found = rulesAsc.find((r: any) => Number(current) <= Number(r.threshold));
        step = found ? Number(found.increment) : Number(rulesAsc[rulesAsc.length - 1].increment);
      }
      requiredNext = Number(current) + Number(step);
      if (Number(amount) !== requiredNext) return json({ error: 'invalid amount', details: { current, step, requiredNext } }, 400);
    }

    const { error } = await s.from('bids').insert({ auction_id, team_id, player_id: player_id ?? null, amount: requiredNext, by_user: by_user ?? null });
    if (error) return json({ error: error.message }, 400);

    // Enrich payload with team name for clearer activity log
    const { data: teamRow } = await s.from('teams').select('name').eq('id', team_id).maybeSingle();
    await s.from('auction_events').insert({ auction_id, type: 'bid_placed', payload: { team_id, team_name: (teamRow as any)?.name || null, player_id: player_id ?? null, amount: requiredNext } });
    return json({ ok: true, amount: requiredNext });
  } catch (e) { return json({ error: e.message || String(e) }, 500); }
}); 