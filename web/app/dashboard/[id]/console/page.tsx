'use client'; 

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../lib/useAuthReady';

const PLAYER_SILHOUETTE_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 420'>\n  <defs>\n    <linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>\n      <stop offset='0%' stop-color='#f3f4f6'/>\n      <stop offset='100%' stop-color='#e5e7eb'/>\n    </linearGradient>\n  </defs>\n  <rect width='100%' height='100%' fill='url(#g)'/>\n  <g fill='#cbd5e1'>\n    <circle cx='160' cy='120' r='56'/>\n    <path d='M56 300c0-56 48-96 104-96s104 40 104 96v60H56z'/>\n  </g>\n</svg>"
)}`;

export default function AuctionConsolePage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const { ready, session } = useAuthReady();

  const [role, setRole] = useState<string>('viewer');
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<{ next_player_id: string | null; next_player_name: string | null; remaining_available: number } | null>(null);
  const [player, setPlayer] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [sets, setSets] = useState<{ id: string; name: string }[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string>('');
  const [selectedScope, setSelectedScope] = useState<'default' | 'set' | 'unsold'>('default');
  const [auction, setAuction] = useState<{ name: string; status?: string; current_set_id?: string | null } | null>(null);
  const [currentBid, setCurrentBid] = useState<number | null>(null);
  const [highestBidderName, setHighestBidderName] = useState<string | null>(null);
  const [highestBidderTeamId, setHighestBidderTeamId] = useState<string | null>(null);
  const [incRules, setIncRules] = useState<{ threshold: number; increment: number }[]>([]);
  const [teamAggs, setTeamAggs] = useState<Record<string, { players_count: number; spent_total: number; purse_remaining: number }>>({});
  const [events, setEvents] = useState<any[]>([]);
  const [showEventLog, setShowEventLog] = useState<boolean>(true);
  const [compactMode, setCompactMode] = useState<boolean>(false);
  const [eventFilter, setEventFilter] = useState<'all' | 'bids' | 'status'>('all');
  const [sponsors, setSponsors] = useState<any[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState<boolean>(false);
  const [hasPlayersInScope, setHasPlayersInScope] = useState<boolean>(true);
  const channelRef = (typeof window !== 'undefined') ? (window as any).__consoleChannelRef ?? { current: null } : { current: null };
  if (typeof window !== 'undefined' && !(window as any).__consoleChannelRef) (window as any).__consoleChannelRef = channelRef;

  // Hydrate event payloads with names so the log never shows raw IDs
  const teamNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    teams.forEach((t: any) => { if (t?.id) map[String(t.id)] = t?.name || ''; });
    return map;
  }, [teams]);
  const [playerNameCache, setPlayerNameCache] = useState<Record<string, string>>({});
  useEffect(() => {
    // Find player_ids present without player_name
    const missing = new Set<string>();
    for (const e of (events as any[])) {
      const pid = e?.payload?.player_id;
      const hasName = Boolean(e?.payload?.player_name);
      if (pid && !hasName && !playerNameCache[String(pid)]) missing.add(String(pid));
    }
    const ids = Array.from(missing);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('auction_players').select('id,name').in('id', ids);
      if (cancelled) return;
      if (Array.isArray(data)) {
        setPlayerNameCache(prev => {
          const next = { ...prev } as Record<string, string>;
          (data as any[]).forEach((r: any) => { if (r?.id) next[String(r.id)] = r?.name || ''; });
          return next;
        });
      }
    })();
    return () => { cancelled = true; };
  }, [events, playerNameCache]);
  const eventsHydrated = useMemo(() => {
    return (events as any[]).map((e) => {
      const p = { ...(e?.payload || {}) } as any;
      if (!p.team_name && p.team_id && teamNameMap[String(p.team_id)]) p.team_name = teamNameMap[String(p.team_id)];
      if (!p.player_name && p.player_id && playerNameCache[String(p.player_id)]) p.player_name = playerNameCache[String(p.player_id)];
      return { ...e, payload: p };
    });
  }, [events, teamNameMap, playerNameCache]);

  // Realtime throttling + optimistic bid state
  const bidsRefreshTimerRef = useRef<number | null>(null);
  const pendingBidRef = useRef<{ playerId: string; teamId: string; amount: number } | null>(null);
  function scheduleBidRefresh(fn: () => void, delay = 80) {
    if (bidsRefreshTimerRef.current) { clearTimeout(bidsRefreshTimerRef.current); bidsRefreshTimerRef.current = null; }
    bidsRefreshTimerRef.current = window.setTimeout(fn, delay);
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (mounted && p?.role) setRole(p.role);
      setLoading(true);
      const [{ data: q }, { data: t }, { data: s }, { data: a }, { data: r }, { data: ag }, { data: sp }] = await Promise.all([
        supabase.from('v_auction_queue').select('next_player_id,next_player_name,remaining_available').eq('auction_id', auctionId).maybeSingle(),
        supabase.from('teams').select('id,name,max_players,logo_path,logo_url').eq('auction_id', auctionId).order('created_at', { ascending: true }),
        supabase.from('auction_sets').select('id,name').eq('auction_id', auctionId).order('ord', { ascending: true }),
        supabase.from('auctions').select('name,status,base_price,current_set_id,current_player_id,queue_scope').eq('id', auctionId).maybeSingle(),
        supabase.from('increment_rules').select('threshold,increment').eq('auction_id', auctionId).order('threshold', { ascending: true }),
        supabase.from('v_team_aggregates').select('team_id,players_count,spent_total,purse_remaining').eq('auction_id', auctionId),
        supabase.from('auction_sponsors').select('id,name,sponsor_type,logo_path,logo_url,ord').eq('auction_id', auctionId).order('ord', { ascending: true })
      ]);
      if (!mounted) return;
      setQueue(q ? { next_player_id: q.next_player_id, next_player_name: q.next_player_name, remaining_available: q.remaining_available ?? 0 } : { next_player_id: null, next_player_name: null, remaining_available: 0 });
      setTeams(t ?? []);
      setSets((s as any[]) ?? []);
      setAuction(a ?? null);
      const dbSetId = (a as any)?.current_set_id ?? null;
      const dbScope = (a as any)?.queue_scope ?? null;
      if (dbSetId) setSelectedSetId(dbSetId);
      if (dbScope) setSelectedScope((dbScope as any) ?? 'default');
      // hydrate saved prefs only when DB has no values
      try {
        const raw = localStorage.getItem(`console_prefs_${auctionId}`);
        if (raw) {
          const prefs = JSON.parse(raw);
          if (!dbScope && prefs.selectedScope) setSelectedScope(prefs.selectedScope);
          if (!dbSetId && prefs.selectedSetId) setSelectedSetId(prefs.selectedSetId);
          if (typeof prefs.searchTerm === 'string') setSearchTerm(prefs.searchTerm);
        }
      } catch {}
      setIncRules(((r as any[]) ?? []).map(x => ({ threshold: Number(x.threshold ?? 0), increment: Number(x.increment ?? 1) })));
      const agMap: Record<string, { players_count: number; spent_total: number; purse_remaining: number }> = {};
      (ag as any[])?.forEach((row: any) => { agMap[row.team_id] = { players_count: Number(row.players_count ?? 0), spent_total: Number(row.spent_total ?? 0), purse_remaining: Number(row.purse_remaining ?? 0) }; });
      setTeamAggs(agMap);
      setSponsors((sp as any[] | null)?.slice().sort((a, b) => {
        const at = a?.sponsor_type === 'title' ? 0 : 1;
        const bt = b?.sponsor_type === 'title' ? 0 : 1;
        if (at !== bt) return at - bt;
        return (a?.ord ?? 0) - (b?.ord ?? 0);
      }) ?? []);
      // Initial recent events
      const { data: ev } = await supabase
        .from('auction_events')
        .select('id,created_at,type,payload')
        .eq('auction_id', auctionId)
        .order('created_at', { ascending: false })
        .limit(20);
      setEvents((ev as any[]) ?? []);

      // Load per-user console preferences
      if (session?.user?.id) {
        const { data: prefRow } = await supabase
          .from('console_prefs')
          .select('prefs')
          .eq('user_id', session.user.id)
          .eq('auction_id', auctionId)
          .maybeSingle();
        if (prefRow?.prefs) {
          setShowEventLog(Boolean(prefRow.prefs.showEventLog ?? true));
          setCompactMode(Boolean(prefRow.prefs.compactMode ?? false));
          if (prefRow.prefs.eventFilter) setEventFilter(prefRow.prefs.eventFilter);
        }
      }
      const playerToLoad = (a as any)?.current_player_id ?? null;
      if (playerToLoad) {
        const { data: pl } = await supabase
          .from('auction_players')
          .select('id,name,base_price,category,status,photo_path,photo_url,meta,bat_style,bowl_style,matches,runs,average,strike_rate,overs,wickets,economy,notes')
          .eq('id', playerToLoad)
          .maybeSingle();
        if (pl) setPlayer(pl);
      } else {
        setPlayer(null);
      }
      await refreshBidState(playerToLoad || undefined);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [ready, session, auctionId, router]);

  // Sync compact mode when toggled from header
  useEffect(() => {
    function onCompactChanged(e: any) {
      if (e?.detail && typeof e.detail.compactMode === 'boolean') setCompactMode(e.detail.compactMode);
    }
    window.addEventListener('console-compact-changed', onCompactChanged as any);
    return () => window.removeEventListener('console-compact-changed', onCompactChanged as any);
  }, []);

  // Persist scope/search
  useEffect(() => {
    try {
      localStorage.setItem(`console_prefs_${auctionId}`, JSON.stringify({ selectedScope, selectedSetId, searchTerm }));
    } catch {}
  }, [auctionId, selectedScope, selectedSetId, searchTerm]);

  const playerPhoto = useMemo(() => {
    if (!player) return '';
    if (player.photo_path) {
      const { data } = supabase.storage.from('player-photos').getPublicUrl(player.photo_path);
      return data.publicUrl;
    }
    return player.photo_url || '';
  }, [player]);

  const [playerFirstWord, playerRestWords] = useMemo(() => {
    const n = (player?.name || '').trim();
    if (!n) return ['', ''];
    const parts = n.split(/\s+/);
    const fw = parts.shift() || '';
    return [fw, parts.join(' ')];
  }, [player?.name]);

  const titleSponsorName = useMemo(() => {
    const ts = sponsors.find((s: any) => String(s?.sponsor_type) === 'title');
    return ts?.name ? String(ts.name) : '';
  }, [sponsors]);

  const auctionDisplayName = useMemo(() => {
    const base = auction?.name ?? 'Tournament';
    return titleSponsorName ? `${titleSponsorName} ${base}` : base;
  }, [titleSponsorName, auction?.name]);

  const auctionStatus = useMemo(() => String(auction?.status || 'draft').toLowerCase(), [auction?.status]);
  const { statusLabel, statusClasses, statusInner } = useMemo(() => {
    const s = String(auction?.status || 'draft').toLowerCase();
    if (s === 'live') {
      return {
        statusLabel: 'Live',
        statusClasses: 'bg-red-50 text-red-700 border border-red-200',
        statusInner: (
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping"></span>
            <span className="relative inline-flex size-2 rounded-full bg-red-600"></span>
          </span>
        ),
      } as const;
    }
    if (s === 'paused') {
      return {
        statusLabel: 'Paused',
        statusClasses: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
        statusInner: <span className="material-symbols-outlined text-[16px] leading-none" style={{ fontSize: '16px' }}>pause</span>,
      } as const;
    }
    if (s === 'closed') {
      return {
        statusLabel: 'Ended',
        statusClasses: 'bg-gray-100 text-gray-700 border border-gray-200',
        statusInner: <span className="material-symbols-outlined text-[16px] leading-none" style={{ fontSize: '16px' }}>stop_circle</span>,
      } as const;
    }
    // draft or anything else
    return {
      statusLabel: 'Not Started',
      statusClasses: 'bg-gray-100 text-gray-700 border border-gray-200',
      statusInner: <span className="material-symbols-outlined text-[16px] leading-none" style={{ fontSize: '16px' }}>schedule</span>,
    } as const;
  }, [auction?.status]);

  async function applySetSelection() {
    let payload: any = {};
    if (selectedScope === 'default') {
      payload = { queue_scope: 'default', current_set_id: null };
    } else if (selectedScope === 'unsold') {
      payload = { queue_scope: 'unsold', current_set_id: null };
    } else {
      if (!selectedSetId) { setToast({ type: 'error', message: 'Please select a set when using By Set' }); setTimeout(() => setToast(null), 1800); return; }
      payload = { queue_scope: 'set', current_set_id: selectedSetId };
    }
    const { error } = await supabase.from('auctions').update(payload).eq('id', auctionId);
    if (error) { setToast({ type: 'error', message: error.message }); setTimeout(() => setToast(null), 1800); }
    else { setToast({ type: 'success', message: 'Applied' }); setTimeout(() => setToast(null), 1200); }
    setAuction(prev => prev ? { ...prev, ...payload } : prev);
    // keep local UX state in sync immediately
    if (!error) {
      setSelectedScope(payload.queue_scope);
      setSelectedSetId(payload.current_set_id || '');
    }
    // Refetch queue and player for the applied set
    await refreshQueueAndPlayer();
  }

  async function jumpToPlayerByName(query: string) {
    const scope = (auction as any)?.queue_scope || 'default';
    let q = supabase.from('auction_players').select('id,name,status,set_id').eq('auction_id', auctionId);
    if (scope === 'unsold') q = q.eq('status', 'unsold');
    if (scope === 'set' && (auction as any)?.current_set_id) q = q.eq('set_id', (auction as any).current_set_id);
    const { data } = await q.ilike('name', `%${query}%`).order('created_at', { ascending: true }).limit(1);
    const first = (data as any[])?.[0];
    if (first?.id) {
      await supabase.from('auctions').update({ current_player_id: first.id }).eq('id', auctionId);
      await refreshQueueAndPlayer();
    }
  }

  async function searchPlayersByName(query: string) {
    if (!query || query.length < 2) { setSearchResults([]); return; }
    const scope = (auction as any)?.queue_scope || 'default';
    let q = supabase.from('auction_players').select('id,name,status,set_id,photo_path,photo_url').eq('auction_id', auctionId).eq('status', 'available');
    // Force available-only regardless of scope; still allow narrowing by set when scope is set
    if (scope === 'set' && (auction as any)?.current_set_id) q = q.eq('set_id', (auction as any).current_set_id);
    const { data } = await q.ilike('name', `%${query}%`).order('name', { ascending: true }).limit(20);
    setSearchResults((data as any[]) ?? []);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowSearchResults(false);
    }
    function onDocClick(e: MouseEvent) {
      const el = e.target as HTMLElement;
      if (!el.closest('.player-search')) setShowSearchResults(false);
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onDocClick);
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('click', onDocClick); };
  }, []);

  async function handlePickPlayer(id: string) {
    await supabase.from('auctions').update({ current_player_id: id }).eq('id', auctionId);
    setShowSearchResults(false);
    setSearchTerm('');
    setSearchResults([]);
    await refreshQueueAndPlayer();
  }

  async function refreshQueueAndPlayer() {
    const { data: q } = await supabase
      .from('v_auction_queue')
      .select('next_player_id,next_player_name,remaining_available')
      .eq('auction_id', auctionId)
      .maybeSingle();
    setQueue(q ? { next_player_id: q.next_player_id, next_player_name: q.next_player_name, remaining_available: q.remaining_available ?? 0 } : { next_player_id: null, next_player_name: null, remaining_available: 0 });
    // Only show player if explicitly set as current in the auction
    const { data: a } = await supabase
      .from('auctions')
      .select('current_player_id')
      .eq('id', auctionId)
      .maybeSingle();
    const currentId = (a as any)?.current_player_id || null;
    if (currentId) {
      const { data: pl } = await supabase
        .from('auction_players')
        .select('id,name,base_price,category,status,photo_path,photo_url,meta,bat_style,bowl_style,matches,runs,average,strike_rate,overs,wickets,economy,notes')
        .eq('id', currentId)
        .maybeSingle();
      setPlayer(pl ?? null);
      await refreshBidState(currentId);
    } else {
      setPlayer(null);
      await refreshBidState(undefined);
    }
    await computeHasPlayersInScope();
  }

  async function computeHasPlayersInScope() {
    const scope = (auction as any)?.queue_scope || 'default';
    let q = supabase
      .from('auction_players')
      .select('id')
      .eq('auction_id', auctionId);
    if (scope === 'unsold') q = q.eq('status', 'unsold');
    else q = q.eq('status', 'available');
    if (scope === 'set' && (auction as any)?.current_set_id) q = q.eq('set_id', (auction as any).current_set_id);
    const { data } = await q.limit(1);
    setHasPlayersInScope(((data as any[]) ?? []).length > 0);
  }

  async function refreshBidState(playerId?: string) {
    const pid = playerId || player?.id;
    if (!pid) { setCurrentBid(null); setHighestBidderName(null); setHighestBidderTeamId(null); return; }
    const { data: b } = await supabase
      .from('bids')
      .select('amount, team_id, teams(name)')
      .eq('auction_id', auctionId)
      .eq('player_id', pid)
      .order('amount', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (b) {
      setCurrentBid(b.amount ?? null);
      // @ts-ignore
      setHighestBidderName((b as any)?.teams?.name ?? null);
      // @ts-ignore
      setHighestBidderTeamId((b as any)?.team_id ?? null);
    } else {
      setCurrentBid(null);
      setHighestBidderName(null);
      setHighestBidderTeamId(null);
    }
  }

  useEffect(() => {
    if (!ready || !session?.user) return;
    if (channelRef.current) { try { supabase.removeChannel(channelRef.current); } catch {} }
    const channel = supabase
      .channel(`auction-${auctionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions', filter: `id=eq.${auctionId}` }, async () => {
        const { data: a } = await supabase.from('auctions').select('name,status,base_price,current_set_id,current_player_id,queue_scope').eq('id', auctionId).maybeSingle();
        if (a) setAuction(a as any);
        // Keep local scope/set selection in sync with DB changes
        if ((a as any)) {
          setSelectedScope(((a as any).queue_scope as any) || 'default');
          setSelectedSetId(((a as any).current_set_id as any) || '');
        }
        // If current_player_id changed, load that player now; otherwise skip heavy refresh
        if ((a as any)?.current_player_id) {
          const { data: pl } = await supabase
            .from('auction_players')
            .select('id,name,base_price,category,status,photo_path,photo_url,meta,bat_style,bowl_style,matches,runs,average,strike_rate,overs,wickets,economy,notes')
            .eq('id', (a as any).current_player_id)
            .maybeSingle();
          setPlayer(pl ?? null);
          await refreshBidState((a as any).current_player_id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_players', filter: `auction_id=eq.${auctionId}` }, () => { scheduleBidRefresh(() => refreshQueueAndPlayer(), 90); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bids', filter: `auction_id=eq.${auctionId}` }, () => {
        // Clear optimistic if server has responded
        pendingBidRef.current = null;
        scheduleBidRefresh(() => refreshBidState(), 50);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `auction_id=eq.${auctionId}` }, async () => {
        const { data: ag } = await supabase.from('v_team_aggregates').select('team_id,players_count,spent_total,purse_remaining').eq('auction_id', auctionId);
        const agMap: Record<string, { players_count: number; spent_total: number; purse_remaining: number }> = {};
        (ag as any[])?.forEach((row: any) => { agMap[row.team_id] = { players_count: Number(row.players_count ?? 0), spent_total: Number(row.spent_total ?? 0), purse_remaining: Number(row.purse_remaining ?? 0) }; });
        setTeamAggs(agMap);
        scheduleBidRefresh(() => refreshBidState(), 60);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'auction_events', filter: `auction_id=eq.${auctionId}` }, async () => {
        const { data: ev } = await supabase
          .from('auction_events')
          .select('id,created_at,type,payload')
          .eq('auction_id', auctionId)
          .order('created_at', { ascending: false })
          .limit(20);
        setEvents((ev as any[]) ?? []);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_sponsors', filter: `auction_id=eq.${auctionId}` }, async () => {
        const { data: sp } = await supabase.from('auction_sponsors').select('id,name,sponsor_type,logo_path,logo_url,ord').eq('auction_id', auctionId).order('ord', { ascending: true });
        setSponsors((sp as any[] | null)?.slice().sort((a, b) => {
          const at = a?.sponsor_type === 'title' ? 0 : 1;
          const bt = b?.sponsor_type === 'title' ? 0 : 1;
          if (at !== bt) return at - bt;
          return (a?.ord ?? 0) - (b?.ord ?? 0);
        }) ?? []);
      })
      .subscribe();
    channelRef.current = channel;
    return () => { try { supabase.removeChannel(channel); } catch {} if (channelRef.current === channel) channelRef.current = null; if (bidsRefreshTimerRef.current) { clearTimeout(bidsRefreshTimerRef.current); bidsRefreshTimerRef.current = null; } };
  }, [ready, session, auctionId]);

  const currentSetName = useMemo(() => {
    if (!auction?.current_set_id) return null;
    const s = sets.find(x => x.id === auction.current_set_id);
    return s?.name ?? null;
  }, [auction, sets]);

  const scopeLabel = useMemo(() => {
    const scope = (auction as any)?.queue_scope || 'default';
    if (scope === 'default') return 'All (Default)';
    if (scope === 'unsold') return 'Unsold';
    if (scope === 'set') return currentSetName || 'By Set';
    return null;
  }, [auction, currentSetName]);

  async function invoke(name: string, payload: any) {
    const { data, error } = await supabase.functions.invoke(name, { body: payload });
    if (error) {
      setToast({ type: 'error', message: error.message });
      setTimeout(() => setToast(null), 1800);
      return { data: null, error } as const;
    }
    setToast({ type: 'success', message: 'Done' });
    setTimeout(() => setToast(null), 1200);
    return { data, error: null } as const;
  }

  async function handleNext() {
    if (selectedScope === 'set' && !selectedSetId) {
      setToast({ type: 'error', message: 'Please select a set when using By Set' });
      setTimeout(() => setToast(null), 1800);
      return;
    }
    const { data, error } = await invoke('next_player', { auction_id: auctionId });
    if (!error && (data as any)?.player_id) {
      const pid = (data as any).player_id as string;
      const { data: pl } = await supabase
        .from('auction_players')
        .select('id,name,base_price,category,status,photo_path,photo_url,meta,bat_style,bowl_style,matches,runs,average,strike_rate,overs,wickets,economy,notes')
        .eq('id', pid)
        .maybeSingle();
      setPlayer(pl ?? null);
      await refreshBidState(pid);
    } else {
      await refreshQueueAndPlayer();
    }
  }

  async function handleSold() {
    await invoke('sell_player', { auction_id: auctionId, player_id: player?.id });
    // Clear local player immediately; rely on realtime to repopulate queue/state
    setPlayer(null);
    setCurrentBid(null);
    setHighestBidderName(null);
    setHighestBidderTeamId(null);
    scheduleBidRefresh(() => refreshQueueAndPlayer(), 80);
  }

  async function handleUnsold() {
    await invoke('mark_unsold', { auction_id: auctionId, player_id: player?.id });
    setPlayer(null);
    setCurrentBid(null);
    setHighestBidderName(null);
    setHighestBidderTeamId(null);
    scheduleBidRefresh(() => refreshQueueAndPlayer(), 80);
  }

  async function handlePlaceBid(teamId: string) {
    const nextAmount = computeNextBidAmount();
    const team = teams.find(t => t.id === teamId);
    // optimistic UI
    pendingBidRef.current = { playerId: player?.id, teamId, amount: nextAmount };
    setCurrentBid(nextAmount);
    setHighestBidderTeamId(teamId);
    setHighestBidderName(team?.name ?? highestBidderName);
    const { error } = (await invoke('place_bid', { auction_id: auctionId, team_id: teamId, player_id: player?.id, amount: nextAmount }));
    if (error) {
      // revert optimistic on error
      pendingBidRef.current = null;
      await refreshBidState();
      return;
    }
    // fallback in case realtime event is delayed
    scheduleBidRefresh(() => refreshBidState(), 200);
  }

  async function handleUndoBid() {
    await invoke('undo_bid', { auction_id: auctionId, player_id: player?.id });
    scheduleBidRefresh(() => refreshBidState(), 120);
  }

  async function handleUndoSold() {
    await invoke('undo_sold', { auction_id: auctionId, player_id: player?.id });
    scheduleBidRefresh(() => refreshQueueAndPlayer(), 120);
  }

  async function handleUndoUnsold() {
    await invoke('undo_unsold', { auction_id: auctionId, player_id: player?.id });
    scheduleBidRefresh(() => refreshQueueAndPlayer(), 120);
  }

  async function handleLoadRandomAvailable() {
    const scope = (auction as any)?.queue_scope || 'default';
    let q = supabase
      .from('auction_players')
      .select('id')
      .eq('auction_id', auctionId)
      .eq('status', 'available');
    if (scope === 'set' && (auction as any)?.current_set_id) q = q.eq('set_id', (auction as any).current_set_id);
    const { data } = await q.limit(1000);
    const rows = (data as any[]) ?? [];
    if (rows.length === 0) { setToast({ type: 'error', message: 'No available players to load' }); setTimeout(() => setToast(null), 1500); return; }
    const rand = rows[Math.floor(Math.random() * rows.length)];
    await supabase.from('auctions').update({ current_player_id: rand.id }).eq('id', auctionId);
    await refreshQueueAndPlayer();
  }

  function computeNextBidAmount() {
    const base = player?.base_price ? Number(player.base_price) : Number((auction as any)?.base_price ?? 0);
    const current = currentBid !== null ? Number(currentBid) : null;
    if (current === null) return base;
    // find step by threshold
    let step = 1;
    if (incRules.length > 0) {
      const found = incRules.find(r => Number(current) <= Number(r.threshold));
      step = found ? Number(found.increment) : Number(incRules[incRules.length - 1].increment);
    }
    return Number(current) + Number(step);
  }

  function isTeamEligible(team: any) {
    if (!player?.id) return { ok: false, reason: 'No player loaded' };
    if ((auction?.status || '').toLowerCase() !== 'live') return { ok: false, reason: 'Auction not live' };
    const ag = teamAggs[team.id] || { players_count: 0, purse_remaining: 0, spent_total: 0 };
    const maxPlayers = Number(team.max_players ?? 0);
    const remainingSlots = Math.max(maxPlayers - ag.players_count, 0);
    if (remainingSlots <= 0) return { ok: false, reason: 'Roster full' };
    const base = player?.base_price ? Number(player.base_price) : Number((auction as any)?.base_price ?? 0);
    const nextAmount = computeNextBidAmount();
    const requiredReserve = Math.max(remainingSlots - 1, 0) * base;
    const allowed = ag.purse_remaining - nextAmount - requiredReserve;
    if (allowed < 0) return { ok: false, reason: 'Insufficient purse' };
    return { ok: true };
  }

  function computeMaxAllowedForTeam(teamId: string) {
    const ag = teamAggs[teamId] || { players_count: 0, spent_total: 0, purse_remaining: 0 };
    const team = teams.find(t => t.id === teamId);
    if (!team) return 0;
    const maxPlayers = Number(team.max_players ?? 0);
    const remainingSlots = Math.max(maxPlayers - (ag.players_count || 0), 0);
    const base = Number((auction as any)?.base_price ?? 0);
    const requiredReserve = Math.max(remainingSlots - 1, 0) * base;
    const maxNextBid = Math.max(Number(ag.purse_remaining ?? 0) - requiredReserve, 0);
    return maxNextBid;
  }

  async function handlePauseResume() {
    if ((auction?.status || '').toLowerCase() === 'live') {
      await invoke('pause_auction', { auction_id: auctionId });
    } else {
      await invoke('resume_auction', { auction_id: auctionId });
    }
  }

  async function handleCloseAuction() {
    const ok = confirm('Close this auction? This action will end the auction.');
    if (!ok) return;
    await invoke('close_auction', { auction_id: auctionId });
  }

  async function handleOpenAuction() {
    await invoke('open_auction', { auction_id: auctionId });
  }

  async function savePrefs(next: Partial<{ showEventLog: boolean; compactMode: boolean; eventFilter: 'all' | 'bids' | 'status' }>) {
    const merged = {
      showEventLog,
      compactMode,
      eventFilter,
      ...next,
    };
    if (typeof next.showEventLog === 'boolean') setShowEventLog(next.showEventLog);
    if (typeof next.compactMode === 'boolean') setCompactMode(next.compactMode);
    if (next.eventFilter) setEventFilter(next.eventFilter);
    if (!session?.user?.id) return;
    await supabase
      .from('console_prefs')
      .upsert({ user_id: session.user.id, auction_id: auctionId, prefs: merged }, { onConflict: 'user_id,auction_id' });
  }

  async function saveEventLogPref(next: boolean) { await savePrefs({ showEventLog: next }); }
  async function saveEventFilterPref(next: 'all' | 'bids' | 'status') { await savePrefs({ eventFilter: next }); }

  const userEmail = session?.user?.email ?? '';
  const displayEmail = userEmail ? userEmail.split('@')[0] : '';

  const filteredEvents = useMemo(() => {
    if (eventFilter === 'all') return eventsHydrated;
    const bidTypes = new Set(['bid_placed', 'bid_reverted']);
    const statusTypes = new Set([
      'auction_opened', 'auction_paused', 'auction_resumed', 'auction_closed',
      'player_sold', 'player_unsold', 'player_sold_reverted', 'player_unsold_reverted',
      'current_player_set'
    ]);
    if (eventFilter === 'bids') return eventsHydrated.filter((e: any) => bidTypes.has(String(e?.type)));
    return eventsHydrated.filter((e: any) => statusTypes.has(String(e?.type)));
  }, [eventsHydrated, eventFilter]);

  return (
    <div className="text-white" style={{ fontFamily: 'Spline Sans, Noto Sans, sans-serif', backgroundColor: '#110f22', height: 'calc(100vh - 79px)' }}>
      <div className="flex h-full overflow-hidden">
        <main className="flex-1 m-2 overflow-hidden min-h-0" style={{ borderRadius: '16px', backgroundColor: 'rgb(249 250 251 / var(--tw-bg-opacity, 1))', zIndex: 1 }}>
          <div className="container mx-auto max-w-full w-full px-4 sm:px-6 lg:px-8 overflow-auto h-full p-6">
            <div className="grid max-w-full grid-cols-12 gap-6">
            <div className="col-span-12 xl:col-span-7">
              <div className={`rounded-2xl bg-white ${compactMode ? 'p-4' : 'p-6'} shadow-lg`}>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-2xl font-bold text-gray-900">{auctionDisplayName}</h2>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${statusClasses}`}>
                      {statusInner}
                      {statusLabel}
                    </span>
                  </div>
                </div>
                <div className={`mb-6 rounded-xl border border-purple-200 bg-purple-50 flex flex-row items-center gap-4 ${compactMode ? 'p-3' : 'p-4'}`}>
                  <h3 className="text-sm font_medium text-purple-800 inline-block">Current Auction Set</h3>
                  <div className="mt-0 flex flex_wrap items-center gap-2">
                    {(auction as any)?.queue_scope === 'default' && (
                      <span className="inline-flex items-center gap-2 rounded-full bg_white px-3 py-1 font-semibold text-purple-700 border border-purple-200">All (Default)</span>
                    )}
                    {(auction as any)?.queue_scope === 'unsold' && (
                      <span className="inline-flex items-center gap-2 rounded-full bg_white px-3 py-1 font-semibold text-purple-700 border border-purple-200">Unsold</span>
                    )}
                    {(auction as any)?.queue_scope === 'set' && (
                        <span className="inline-flex items-center gap-2 rounded-full bg_white px-3 py-1 font-semibold text-purple-700 border border-purple-200">{currentSetName || '—'}</span>
                    )}
                    {!((auction as any)?.queue_scope) && (
                      <span className="text_sm font-bold text-purple-700">No Set Selected</span>
                    )}
                  </div>
                </div>
                <div className="mb-2">
                  <h4 className={`${compactMode ? 'text-2xl' : 'text-3xl'} font-bold`}>
                    <span className="text-[var(--ucl-pink)]">{playerFirstWord || '-'}</span>
                    <span className="text-[var(--ucl-purple)]"> {playerRestWords || '-'}</span>
                  </h4>
                </div>
                <div className="flex flex-col gap-6 md:flex-row">
                  <div className="w_full md:w-[40%]">
                    <div className={`h-[358px] w-full overflow-hidden rounded-xl border border-gray-200 bg-cover bg-center bg-no-repeat shadow-md`} style={{ backgroundImage: `url("${playerPhoto || PLAYER_SILHOUETTE_SVG}")` }} />
                  </div>
                  <div className="flex-1">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="text-xs text-gray-500">Batting Style</div>
                        <div className="font-semibold text-gray-800">{player?.bat_style || '—'}</div>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="text-xs text-gray-500">Bowling Style</div>
                        <div className="font-semibold text-gray-800">{player?.bowl_style || '—'}</div>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="text-xs text-gray-500">Matches</div>
                        <div className="font-semibold text-gray-800">{player?.matches ?? '—'}</div>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="text-xs text-gray-500">Overs</div>
                        <div className="font-semibold text-gray-800">{fmtNumber(player?.overs, 1)}</div>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="text-xs text-gray-500">Runs</div>
                        <div className="font-semibold text-gray-800">{player?.runs ?? '—'}</div>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="text-xs text-gray-500">Wickets</div>
                        <div className="font-semibold text-gray-800">{player?.wickets ?? '—'}</div>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="text-xs text-gray-500">Average</div>
                        <div className="font-semibold text-gray-800">{fmtNumber(player?.average, 2)}</div>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="text-xs text-gray-500">Economy</div>
                        <div className="font-semibold text-gray-800">{fmtNumber(player?.economy, 2)}</div>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="text-xs text-gray-500">Strike Rate</div>
                        <div className="font-semibold text-gray-800">{fmtNumber(player?.strike_rate, 2)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className={`mt-6 rounded-2xl bg-white ${compactMode ? 'p-4' : 'p-6'} shadow-lg`}>
                <h3 className="mb-4 text-xl font-bold text-gray-800">Sponsors</h3>
                {sponsors.length === 0 ? (
                  <div className="text-sm text-gray-500">This tournament has no sponsors.</div>
                ) : (
                  <div className="flex flex-wrap items-center gap-6">
                    {sponsors.map(s => (
                      <div key={s.id} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className="h-24" src={s.logo_path ? supabase.storage.from('sponsor-logos').getPublicUrl(s.logo_path).data.publicUrl : s.logo_url} alt={s.name} title={s.name} />
                        {s.sponsor_type === 'title' && (
                          <span className="absolute left-0 top-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-yellow-100 text-yellow-700 shadow">
                            <span className="material-symbols-outlined text-[20px] leading-none" style={{ fontSize: '20px' }}>workspace_premium</span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={`mt-6 rounded-2xl bg-white ${compactMode ? 'p-4' : 'p-6'} shadow-lg`}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-800">Recent Activity</h3>
                  <div className="flex items-center gap-2">
                    <div className="hidden sm:flex items-center rounded-md border border-gray-300 p-0.5 text-xs text-gray-700">
                      {(['all','bids','status'] as const).map(f => (
                        <button key={f} onClick={() => saveEventFilterPref(f)} className={`px-2 py-1 rounded ${eventFilter === f ? 'bg-gray-200 font-semibold' : ''}`}>{f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
                      ))}
                    </div>
                    <button onClick={() => saveEventLogPref(!showEventLog)} className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      {showEventLog ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                {showEventLog && (
                  <ul className="max-h-64 space-y-2 overflow-auto text-sm">
                    {filteredEvents.map((e: any) => (
                      <li key={`${e.id}`} className="flex items-center justify-between gap-3">
                        <span className="font-medium text-gray-800">{formatEventLabel(e)}</span>
                        <span className="shrink-0 text-xs text-gray-400">{new Date(e.created_at).toLocaleTimeString()}</span>
                      </li>
                    ))}
                    {filteredEvents.length === 0 && <div className="text-sm text-gray-500">No recent activity.</div>}
                  </ul>
                )}
                {!showEventLog && <div className="text-sm text-gray-500">Recent Activity hidden</div>}
              </div>
            </div>
            <div className="col-span-12 xl:col-span-5">
              <div className="grid grid-cols-1 gap-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className={`rounded-2xl bg-white ${compactMode ? 'p-3' : 'p-4'} shadow-lg`}>
                    <div className="flex h-full flex-col justify-between rounded-xl border border-pink-200 bg-pink-50 p-4 text-center">
                      <p className="text-sm font-medium text-pink-800">Current Bid</p>
                      <p className="my-2 text-4xl font-bold text-pink-600">{currentBid !== null ? fmtCurrency(currentBid) : '—'}</p>
                      {player?.id && (
                        <div className="mt-2">
                          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-pink-700 border border-pink-200">
                            <span className="material-symbols-outlined text-sm">trending_up</span>
                            {fmtCurrency(computeNextBidAmount())}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={`rounded-2xl bg-white ${compactMode ? 'p-3' : 'p-4'} shadow-lg`}>
                    <div className="flex h-full flex-col justify_between rounded-xl border border-purple-200 bg-purple-50 p-4 text-center">
                      <p className="text-sm font-medium text-purple-800">Highest Bidder</p>
                      <p className="my-2 text-4xl font-bold text-purple-700">{highestBidderName || '—'}</p>
                        {highestBidderTeamId && (
                          <div className="mt-1">
                            <span className="m-1 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-purple-700 border border-purple-200">
                              <span className="material-symbols-outlined text-sm">savings</span>
                              {fmtCurrency(teamAggs[highestBidderTeamId]?.purse_remaining ?? 0)}
                            </span>
                            <span className="m-1 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-purple-700 border border-purple-200">
                              <span className="material-symbols-outlined text-sm">trending_up</span>
                              {fmtCurrency(computeMaxAllowedForTeam(highestBidderTeamId))}
                            </span>
                          </div>
                        )}
                      </div>
                  </div>
                </div>
              <div className={`rounded-2xl bg-white ${compactMode ? 'p-4' : 'p-6'} shadow-lg`}>
                  <h3 className="mb-4 text-xl font-bold text-gray-800">Bidding Actions</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 items-stretch">
                    {teams.slice(0, 8).map((t) => {
                      const elig = isTeamEligible(t);
                      const nextAmt = computeNextBidAmount();
                      const ag = teamAggs[t.id] || { players_count: 0, purse_remaining: 0, spent_total: 0 };
                      const maxPlayersRaw = (t.max_players ?? null);
                      const acquired = Number(ag.players_count ?? 0);
                      const acquiredDisplay = `${acquired}/${maxPlayersRaw !== null ? Number(maxPlayersRaw) : '—'}`;
                      const maxNextBid = computeMaxAllowedForTeam(t.id);
                      return (
                      <button key={t.id} onClick={() => handlePlaceBid(t.id)} disabled={!elig.ok} className={`relative flex h-full min-h-[100px] flex-col items-center justify-between rounded-lg p-2 text-white shadow-md transition-all ${elig.ok ? 'bg-[var(--ucl-pink)] hover:bg-opacity-90' : 'bg-gray-300 cursor-not-allowed'}`}>
                          {(() => {
                            const raw = String(t.name || '').trim();
                            const parts = raw.split(/\s+/);
                            const display = parts.length === 2 ? `${parts[0]}\n${parts[1]}` : raw;
                            return (
                              <span className="text-sm font-bold text-center leading-tight h-[2.5rem] whitespace-pre-line break-words overflow-hidden" title={raw}>{display}</span>
                            );
                          })()}
                          <div className="grid w-full grid-cols-2 gap-1 text-[10px]" style={{ background: 'transparent' }}>
                            <div className="flex items-center justify-start gap-1 text-left">
                              <span className="material-symbols-outlined text-white/80 inline-block align-middle" style={{ fontSize: '16px' }}>trending_up</span>
                              <span className="font-semibold align-middle">{fmtCurrency(nextAmt)}</span>
                            </div>
                            <div className="flex items-center justify-end gap-1 text-right">
                            <span className="font-semibold align-middle">{fmtCurrency(ag.purse_remaining)}</span>
                              <span className="material-symbols-outlined text-white/80 inline-block align-middle" style={{ fontSize: '16px' }}>savings</span>
                            </div>
                            <div className="flex items-center justify-start gap-1 text-left">
                            <span className="material-symbols-outlined text-white/80 inline-block align-middle" style={{ fontSize: '16px' }} >group</span>
                              <span className="font-semibold align-middle">{acquiredDisplay}</span>
                            </div>
                            <div className="flex items-center justify-end gap-1 text-right">
                              <span className="font-semibold align-middle">{fmtCurrency(maxNextBid)}</span>
                              <span className="material-symbols-outlined text-white/80 inline-block align-middle" style={{ fontSize: '16px' }}>north_east</span>
                            </div>
                          </div>
                          {!elig.ok && (
                            <span className="absolute right-1 top-1 text-xs" title={elig.reason}>
                              <span className="material-symbols-outlined text-red-500/90">info</span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {teams.length === 0 && <div className="col-span-full text-sm text-gray-500">No teams found.</div>}
                  </div>
                </div>
                <div className={`rounded-2xl bg-white ${compactMode ? 'p-4' : 'p-6'} shadow-lg`}>
                  <h3 className="mb-4 text-xl font-bold text-gray-800">Auctioneer Controls</h3>
                  <div className="grid grid-cols-3 gap-3">
                    {(role === 'admin' || role === 'auctioneer') ? (
                      <>
                        <button onClick={handleSold} className={`flex ${compactMode ? 'h-10' : 'h-11'} items-center justify-center gap-2 rounded-lg bg-green-500 px-4 text-sm font-bold text-white transition-colors hover:bg-green-600`}>
                          <span className="material-symbols-outlined text-base">gavel</span>
                          <span>Sold</span>
                        </button>
                        <button onClick={handleUnsold} className={`flex ${compactMode ? 'h-10' : 'h-11'} items-center justify-center gap-2 rounded-lg bg-red-500 px-4 text-sm font-bold text-white transition-colors hover:bg-red-600`}>
                          <span className="material-symbols-outlined text-base">do_not_disturb_on</span>
                          <span>Unsold</span>
                        </button>
                        {player?.status === 'sold' ? (
                          <button onClick={handleUndoSold} className={`flex ${compactMode ? 'h-10' : 'h-11'} items-center justify-center gap-2 rounded-lg bg-gray-400 px-4 text-sm font-bold text_white transition-colors hover:bg-gray-500`}>
                            <span className="material-symbols-outlined text-base">undo</span>
                            <span>Undo Sold</span>
                          </button>
                        ) : player?.status === 'unsold' ? (
                          <button onClick={handleUndoUnsold} className={`flex ${compactMode ? 'h-10' : 'h-11'} items-center justify-center gap-2 rounded-lg bg-gray-400 px-4 text-sm font-bold text_white transition-colors hover:bg-gray-500`}>
                            <span className="material-symbols-outlined text-base">undo</span>
                            <span>Undo Unsold</span>
                          </button>
                        ) : (
                          <button onClick={handleUndoBid} disabled={!currentBid} className={`flex ${compactMode ? 'h-10' : 'h-11'} items-center justify-center gap-2 rounded-lg bg-gray-400 px-4 text-sm font-bold text_white transition-colors hover:bg-gray-500 disabled:opacity-50`}>
                            <span className="material-symbols-outlined text-base">undo</span>
                            <span>Undo Bid</span>
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="col-span-3 text-sm text-gray-500">Read-only. Controls available to auctioneer.</div>
                    )}
                  </div>
                  {(role === 'admin' || role === 'auctioneer') && (
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {(auction?.status || '').toLowerCase() === 'draft' && (
                        <button onClick={handleOpenAuction} className={`flex ${compactMode ? 'h-10' : 'h-11'} items-center justify-center gap-2 rounded-lg bg-green-700 px-4 text-sm font-bold text-white transition-colors hover:bg-green-800`}>
                          <span className="material-symbols-outlined text-base">play_arrow</span>
                          <span>Start/Open</span>
                        </button>
                      )}
                      <button onClick={handlePauseResume} className={`flex ${compactMode ? 'h-10' : 'h-11'} items-center justify-center gap-2 rounded-lg bg-yellow-500 px-4 text-sm font-bold text-white transition-colors hover:bg-yellow-600`}>
                        <span className="material-symbols-outlined text-base">{(auction?.status || '').toLowerCase() === 'live' ? 'pause' : 'play_arrow'}</span>
                        <span>{(auction?.status || '').toLowerCase() === 'live' ? 'Pause' : 'Resume'}</span>
                      </button>
                      <button onClick={handleCloseAuction} className={`flex ${compactMode ? 'h-10' : 'h-11'} items-center justify-center gap-2 rounded-lg bg-gray-700 px-4 text-sm font-bold text-white transition-colors hover:bg-gray-800`}>
                        <span className="material-symbols-outlined text-base">stop_circle</span>
                        <span>Close</span>
                      </button>
                      <div />
                    </div>
                  )}
                </div>
                <div className={`rounded-2xl bg-white ${compactMode ? 'p-4' : 'p-6'} shadow-lg`}>
                  <h3 className="mb-4 text-xl font-bold text-gray-800">Player &amp; Set Selection</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <select className={`${compactMode ? 'h-10' : 'h-11'} w-full rounded-lg border border-gray-300 bg-white text-gray-700 px-4 text-sm shadow-sm transition-colors focus:border-pink-500 focus:ring-pink-500 hover:border-gray-400`} value={selectedScope} onChange={e => setSelectedScope(e.target.value as any)}>
                        <option value="default">All (Default)</option>
                        <option value="unsold">Unsold</option>
                        <option value="set">By Set</option>
                      </select>
                      <div className="space-y-1">
                        <select className={`${compactMode ? 'h-10' : 'h-11'} w-full rounded-lg border ${selectedScope === 'set' && !selectedSetId ? 'border-red-300' : 'border-gray-300'} bg-white px-4 text-sm text-gray-700 shadow-sm transition-colors focus:border-pink-500 focus:ring-pink-500 hover:border-gray-400 ${selectedScope === 'set' ? '' : 'opacity-50'}`} value={selectedSetId} onChange={e => setSelectedSetId(e.target.value)} disabled={selectedScope !== 'set'}>
                          <option value="">— Select Set —</option>
                          {sets.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <button className={`${compactMode ? 'h-10' : 'h-11'} whitespace-nowrap rounded-lg bg-gray-200 px-4 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-300`} onClick={applySetSelection}>
                        Apply
                      </button>
                    </div>
                    {selectedScope === 'set' && !selectedSetId && (
                      <div className="text-xs text-red-600">Select a set to use By Set</div>
                    )}
                    <div className="relative player-search">
                      <input
                        className={`${compactMode ? 'h-10' : 'h-11'} w-full rounded-lg border border-gray-300 bg-white text-gray-700 px-4 pr-10 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:border-pink-500 focus:ring-pink-500 hover:border-gray-400`}
                        placeholder="Search for a player"
                        type="text"
                        value={searchTerm}
                        onChange={async (e) => {
                          const val = e.target.value;
                          setSearchTerm(val);
                          setShowSearchResults(true);
                          await searchPlayersByName(val.trim());
                        }}
                        onFocus={() => { if (searchTerm.length >= 2) setShowSearchResults(true); }}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val) await jumpToPlayerByName(val);
                          }
                        }}
                      />
                      <button type="button" onClick={async () => {
                        if (showSearchResults) {
                          setShowSearchResults(false);
                          return;
                        }
                        setShowSearchResults(true);
                        setSearchTerm('');
                        // Load up to 200 players in current scope (available only when scope default/set; otherwise unsold scope returns unsold)
                        const scope = (auction as any)?.queue_scope || 'default';
                        let q = supabase.from('auction_players').select('id,name,status,set_id,photo_path,photo_url').eq('auction_id', auctionId);
                        if (scope === 'unsold') q = q.eq('status', 'unsold');
                        else q = q.eq('status', 'available');
                        if (scope === 'set' && (auction as any)?.current_set_id) q = q.eq('set_id', (auction as any).current_set_id);
                        const { data } = await q.order('name', { ascending: true }).limit(200);
                        setSearchResults((data as any[]) ?? []);
                      }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <span className="material-symbols-outlined">person_search</span>
                      </button>
                      {showSearchResults && (
                        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
                          {searchResults.length > 0 ? (
                            searchResults.map((row: any, idx: number) => {
                              const avatar = row.photo_path ? supabase.storage.from('player-photos').getPublicUrl(row.photo_path).data.publicUrl : (row.photo_url || '');
                              return (
                                <button key={row.id} onMouseDown={(e) => e.preventDefault()} onClick={() => handlePickPlayer(row.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50">
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-700 text-[10px] font-semibold border border-gray-200">{idx + 1}</span>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuB5Rt3w77zCG5sJKcIMwVhTmNzFovQ6x69tQVlpYkWEE06iBaC5sERYq4Oun5Y2TTHvud0_gg39APZqOEQmkxm5ccN6jrVpqrdEY5N3DxEmpU-uKEOATivEXW4wRn5ZRzETsAYX-z0UGtDKxZskB6k0UYUVM7XbWfKdbhhLWv1rD-wipAqEtWmLfJwMGbEDWIoSoi99hw2VRfFtUfGMFAXIzGCKU4KXKchUIONLFp_XoXTgblxGbBkFt09H4jdOYd4pwa6G4oFK48o'} alt="avatar" className="h-6 w-6 rounded-full object-cover" />
                                  <span className="flex-1">
                                    <span className="block text-sm font-medium text-gray-900">{row.name}</span>
                                  </span>
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-3 py-2 text-sm text-gray-600">
                              {((auction as any)?.queue_scope || 'default') === 'set' ?
                                'No more players available for auction in the current set.' :
                                'No more players available for auction in the current scope.'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  <div className="flex items-center justify-end">
                    <button
                      onClick={handleLoadRandomAvailable}
                      disabled={!hasPlayersInScope}
                      className={`mt-2 flex w-full ${compactMode ? 'h-10' : 'h-11'} items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors ${hasPlayersInScope ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                      title={hasPlayersInScope ? '' : ((auction as any)?.queue_scope || 'default') === 'set' ? 'No more players available for auction in the current set' : 'No more players available for auction in the current scope'}
                    >
                      <span className="material-symbols-outlined text-base">shuffle</span>
                      <span>Load Next Random Player</span>
                      {!hasPlayersInScope && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs" title={((auction as any)?.queue_scope || 'default') === 'set' ? 'No more players available for auction in the current set' : 'No more players available for auction in the current scope'}>
                          <span className="material-symbols-outlined text-red-500/90">info</span>
                        </span>
                      )}
                    </button>
                  </div>
                  </div>
                </div>
              </div>
              {/* right column end */}
            </div>
            </div>
          </div>
        </main>
      </div>
      {toast && (
        <div className={`fixed bottom-6 right-6 rounded-lg px-4 py-3 text-sm shadow-lg ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

function fmtNumber(v: any, digits = 0) {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

function fmtCurrency(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatEventLabel(e: any) {
  const t = String(e?.type || '');
  if (t === 'bid_placed') return `Bid placed: ${e?.payload?.amount} by ${e?.payload?.team_name || e?.payload?.team_id || '—'}`;
  if (t === 'bid_reverted') return `Bid reverted: ${e?.payload?.amount} by ${e?.payload?.team_name || e?.payload?.team_id || '—'}`;
  if (t === 'player_sold') return `Sold: ${e?.payload?.player_name} to ${e?.payload?.team_name}`;
  if (t === 'player_unsold') return `Unsold: ${e?.payload?.player_name}`;
  if (t === 'player_sold_reverted') return `Undo Sold: ${e?.payload?.player_name}`;
  if (t === 'player_unsold_reverted') return `Undo Unsold: ${e?.payload?.player_name}`;
  if (t === 'auction_opened') return 'Auction opened';
  if (t === 'auction_paused') return 'Auction paused';
  if (t === 'auction_resumed') return 'Auction resumed';
  if (t === 'auction_closed') return 'Auction closed';
  if (t === 'current_player_set') return `Player loaded: ${e?.payload?.player_name || e?.payload?.player_id || '—'}`;
  return t;
}
