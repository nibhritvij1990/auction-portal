'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import LiquidGlassCard from '../../../../components/LiquidGlassCard';

export default function SummaryPage() {
  const params = useParams();
  const auctionId = params?.id as string;

  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [bgVideoId, setBgVideoId] = useState<string>('bg-lines.mp4');
  const [bgPlaybackRate, setBgPlaybackRate] = useState<number>(1);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const [mounted, setMounted] = useState(false);

  // removed redundant initial load effect; we now use lazy initializers above
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem('summary_dark', darkMode ? '1' : '0');
    } catch {}
  }, [darkMode]);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem('summary_bg_video', bgVideoId);
    } catch {}
  }, [bgVideoId]);
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem('summary_bg_speed', String(bgPlaybackRate));
    } catch {}
  }, [bgPlaybackRate]);

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (!mounted) return;
    try {
      const dm = localStorage.getItem('summary_dark') === '1';
      const vid = localStorage.getItem('summary_bg_video') || 'bg-lines.mp4';
      const sp = localStorage.getItem('summary_bg_speed');
      const n = sp ? Number(sp) : 1;
      setDarkMode(dm);
      setBgVideoId(vid);
      setBgPlaybackRate(Number.isFinite(n) && n > 0 ? n : 1);
    } catch {}
  }, [mounted]);

  useEffect(() => {
    if (!darkMode || !mounted) return;
    const v = bgVideoRef.current;
    if (!v) return;
    try {
      v.load();
      v.playbackRate = bgPlaybackRate;
      v.play().catch(() => {});
    } catch {}
  }, [bgVideoId, darkMode, bgPlaybackRate, mounted]);

  const [summary, setSummary] = useState<{ teams_count: number; total_spend: number; remaining_purse: number; sold_count: number; unsold_count: number } | null>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [teamAggs, setTeamAggs] = useState<Record<string, { purse_remaining: number; spent_total: number; players_count: number }>>({});
  const [current, setCurrent] = useState<{ player_name: string | null; player_category: string | null; bid: number | null; team_name: string | null; team_id: string | null; player_photo_url: string | null; team_logo_url: string | null } | null>(null);
  const [auctionInfo, setAuctionInfo] = useState<{ name: string; logo_url?: string | null; base_price: number; max_players_per_team: number | null } | null>(null);
  const [sponsors, setSponsors] = useState<any[]>([]);
  const [setsMap, setSetsMap] = useState<Record<string, string>>({});
  const [incRules, setIncRules] = useState<{ threshold: number; increment: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshTimerRef = useRef<number | null>(null);
  function scheduleRefresh(delayMs = 120) {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    refreshTimerRef.current = window.setTimeout(async () => { await fetchAll(); await fetchPoolData(); }, delayMs);
  }

  async function fetchAll() {
    setLoading(true);
    const [{ data: sum }, { data: q }, { data: ts }, { data: ag }, { data: a }, { data: sp }, { data: sets }, { data: ir } ] = await Promise.all([
      supabase.from('v_auction_summary').select('teams_count,total_spend,remaining_purse,sold_count,unsold_count').eq('auction_id', auctionId).maybeSingle(),
      supabase.from('v_auction_queue').select('next_player_name').eq('auction_id', auctionId).maybeSingle(),
      supabase.from('teams').select('id,name,max_players,logo_path,logo_url').eq('auction_id', auctionId).order('name', { ascending: true }),
      supabase.from('v_team_aggregates').select('team_id,players_count,spent_total,purse_remaining').eq('auction_id', auctionId),
      supabase.from('auctions').select('name,logo_path,logo_url,base_price,max_players_per_team,current_player_id').eq('id', auctionId).maybeSingle(),
      supabase.from('auction_sponsors').select('id,name,sponsor_type,logo_path,logo_url,ord').eq('auction_id', auctionId).order('sponsor_type', { ascending: true }).order('ord', { ascending: true }),
      supabase.from('auction_sets').select('id,name').eq('auction_id', auctionId),
      supabase.from('increment_rules').select('threshold,increment').eq('auction_id', auctionId).order('threshold', { ascending: true })
    ]);
    setSummary((sum as any) ?? null);
    setTeams((ts as any[]) ?? []);
    const mapAgg: Record<string, { purse_remaining: number; spent_total: number; players_count: number }>= {};
    (ag as any[])?.forEach((r: any) => { mapAgg[r.team_id] = { purse_remaining: Number(r.purse_remaining ?? 0), spent_total: Number(r.spent_total ?? 0), players_count: Number(r.players_count ?? 0) }; });
    setTeamAggs(mapAgg);
    setIncRules(((ir as any[]) ?? []).map((r: any) => ({ threshold: Number(r.threshold ?? 0), increment: Number(r.increment ?? 1) })));
    // auction info
    let logo: string | null = null;
    if ((a as any)?.logo_path) {
      logo = supabase.storage.from('auction-logos').getPublicUrl((a as any).logo_path).data.publicUrl;
    } else if ((a as any)?.logo_url) {
      logo = (a as any).logo_url;
    }
    setAuctionInfo({ name: (a as any)?.name || 'Auction', logo_url: logo, base_price: Number((a as any)?.base_price ?? 0), max_players_per_team: (a as any)?.max_players_per_team ?? null });
    setSponsors(((sp as any[]) ?? []).slice().sort((x, y) => {
      const xt = x?.sponsor_type === 'title' ? 0 : 1;
      const yt = y?.sponsor_type === 'title' ? 0 : 1;
      if (xt !== yt) return xt - yt;
      return (x?.ord ?? 0) - (y?.ord ?? 0);
    }));
    const smap: Record<string, string> = {};
    (sets as any[])?.forEach((s: any) => { smap[s.id] = s.name; });
    setSetsMap(smap);
    setSetsList(((sets as any[]) ?? []).map((s: any) => ({ id: s.id, name: s.name })));
    // current bid & highest bidder
    let playerName: string | null = null;
    let playerCategory: string | null = null;
    let playerPhotoUrl: string | null = null;
    let playerId: string | null = (a as any)?.current_player_id ?? null;
    if (playerId) {
      const { data: pl } = await supabase
        .from('auction_players')
        .select('id,name,category,photo_path,photo_url')
        .eq('id', playerId)
        .maybeSingle();
      playerName = (pl as any)?.name ?? null;
      playerCategory = (pl as any)?.category ?? null;
      if ((pl as any)?.photo_path) playerPhotoUrl = supabase.storage.from('player-photos').getPublicUrl((pl as any).photo_path).data.publicUrl;
      else playerPhotoUrl = (pl as any)?.photo_url ?? null;
    } else {
      // No current player set: leave current player fields empty
      playerName = null;
      playerCategory = null;
      playerPhotoUrl = null;
      playerId = null;
    }
    let bid: number | null = null;
    let teamName: string | null = null;
    let teamId: string | null = null;
    let teamLogoUrl: string | null = null;
    if (playerId) {
      const { data: b } = await supabase
        .from('bids')
        .select('team_id, amount, teams(name,logo_path,logo_url)')
        .eq('auction_id', auctionId)
        .eq('player_id', playerId)
        .order('amount', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (b) {
        bid = Number((b as any)?.amount ?? null);
        // @ts-ignore
        teamName = (b as any)?.teams?.name ?? null;
        // @ts-ignore
        teamId = (b as any)?.team_id ?? null;
        // @ts-ignore
        const tLogoPath = (b as any)?.teams?.logo_path || null;
        // @ts-ignore
        const tLogoUrl = (b as any)?.teams?.logo_url || null;
        teamLogoUrl = tLogoPath ? supabase.storage.from('team-logos').getPublicUrl(tLogoPath).data.publicUrl : (tLogoUrl || null);
      }
    }
    setCurrent({ player_name: playerName, player_category: playerCategory, bid, team_name: teamName, team_id: teamId, player_photo_url: playerPhotoUrl, team_logo_url: teamLogoUrl });
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;
    (async () => { if (!mounted) return; await fetchAll(); await fetchPoolData(); })();
    return () => { mounted = false; if (refreshTimerRef.current) { clearTimeout(refreshTimerRef.current); refreshTimerRef.current = null; } };
  }, [auctionId]);

  useEffect(() => {
    let cancelled = false;
    let channel = subscribe();

    function subscribe() {
      const ch = supabase
        .channel(`summary-${auctionId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions', filter: `id=eq.${auctionId}` }, () => scheduleRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_players', filter: `auction_id=eq.${auctionId}` }, () => scheduleRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bids', filter: `auction_id=eq.${auctionId}` }, () => scheduleRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `auction_id=eq.${auctionId}` }, () => scheduleRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_events', filter: `auction_id=eq.${auctionId}` }, () => scheduleRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_sponsors', filter: `auction_id=eq.${auctionId}` }, () => scheduleRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `auction_id=eq.${auctionId}` }, () => scheduleRefresh())
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') return;
          if (cancelled) return;
          if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
            try { supabase.removeChannel(ch); } catch {}
            setTimeout(() => {
              if (!cancelled) channel = subscribe();
            }, 1200);
          }
        });
      return ch;
    }

    return () => {
      cancelled = true;
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [auctionId]);

  const sortedTeams = useMemo(() => {
    return teams.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [teams]);

  const titleSponsorName = useMemo(() => {
    const ts = sponsors.find((s: any) => String(s?.sponsor_type) === 'title');
    return ts?.name ? String(ts.name) : '';
  }, [sponsors]);

  const auctionDisplayName = useMemo(() => {
    const base = auctionInfo?.name || 'Auction';
    return titleSponsorName ? `${titleSponsorName} ${base}` : base;
  }, [titleSponsorName, auctionInfo?.name]);

  const [tab, setTab] = useState<'available' | 'sold' | 'unsold'>('available');
  const [pool, setPool] = useState<any[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [setFilter, setSetFilter] = useState<string>('');
  const [teamFilter, setTeamFilter] = useState<string>('');
  const [poolSearch, setPoolSearch] = useState<string>('');
  const [setsList, setSetsList] = useState<{ id: string; name: string }[]>([]);
  const [sortKey, setSortKey] = useState<'player' | 'category' | 'team' | 'price' | 'set'>('player');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  function toggleSort(key: typeof sortKey) {
    setSortKey(prev => key);
    setSortDir(prev => (sortKey === key ? (prev === 'asc' ? 'desc' : 'asc') : 'asc'));
  }

  async function fetchPoolData() {
    const status = tab === 'available' ? 'available' : tab === 'sold' ? 'sold' : 'unsold';
    if (status === 'sold') {
      const { data } = await supabase
        .from('assignments')
        .select('price, players:auction_players(name, category, set_id, photo_path, photo_url), team:teams(name)')
        .eq('auction_id', auctionId)
        .order('created_at', { ascending: false })
        .limit(500);
      setPool((data as any[]) ?? []);
    } else {
      const q = supabase
        .from('auction_players')
        .select('name, category, status, set_id, photo_path, photo_url')
        .eq('auction_id', auctionId)
        .eq('status', status)
        .order('name', { ascending: true })
        .limit(1000);
      if (categoryFilter) q.eq('category', categoryFilter);
      if (setFilter) q.eq('set_id', setFilter);
      const { data } = await q;
      setPool((data as any[]) ?? []);
    }
  }

  // Hydrate preferences from localStorage
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(`summary_prefs_${auctionId}`) : null;
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (prefs && typeof prefs === 'object') {
        if (prefs.tab && ['available','sold','unsold'].includes(prefs.tab)) setTab(prefs.tab);
        if (typeof prefs.categoryFilter === 'string') setCategoryFilter(prefs.categoryFilter);
        if (typeof prefs.setFilter === 'string') setSetFilter(prefs.setFilter);
        if (typeof prefs.teamFilter === 'string') setTeamFilter(prefs.teamFilter);
        if (typeof prefs.poolSearch === 'string') setPoolSearch(prefs.poolSearch);
        if (prefs.sortKey) setSortKey(prefs.sortKey);
        if (prefs.sortDir) setSortDir(prefs.sortDir);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId]);

  // Persist preferences
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const prefs = { tab, categoryFilter, setFilter, teamFilter, poolSearch, sortKey, sortDir };
      localStorage.setItem(`summary_prefs_${auctionId}`, JSON.stringify(prefs));
    } catch {}
  }, [auctionId, tab, categoryFilter, setFilter, teamFilter, poolSearch, sortKey, sortDir]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const status = tab === 'available' ? 'available' : tab === 'sold' ? 'sold' : 'unsold';
      if (status === 'sold') {
        const { data } = await supabase
          .from('assignments')
          .select('price, players:auction_players(name, category, set_id, photo_path, photo_url), team:teams(name)')
          .eq('auction_id', auctionId)
          .order('created_at', { ascending: false })
          .limit(500);
        if (!mounted) return;
        setPool((data as any[]) ?? []);
      } else {
        const q = supabase
          .from('auction_players')
          .select('name, category, status, set_id, photo_path, photo_url')
          .eq('auction_id', auctionId)
          .eq('status', status)
          .order('name', { ascending: true })
          .limit(1000);
        if (categoryFilter) q.eq('category', categoryFilter);
        if (setFilter) q.eq('set_id', setFilter);
        const { data } = await q;
        if (!mounted) return;
        setPool((data as any[]) ?? []);
      }
    })();
    return () => { mounted = false; };
  }, [auctionId, tab, categoryFilter, setFilter]);

  const displayPool = useMemo(() => {
    let arr = [...pool];
    // Apply filters client-side for sold (assignments join)
    if (tab === 'sold') {
      if (categoryFilter) arr = arr.filter(r => (r.players?.category || '') === categoryFilter);
      if (teamFilter) arr = arr.filter(r => (r.team?.name || '') === (teams.find(t => t.id === teamFilter)?.name || ''));
    }
    // Apply search
    if (poolSearch) {
      const q = poolSearch.trim().toLowerCase();
      if (tab === 'sold') arr = arr.filter(r => String(r.players?.name || '').toLowerCase().includes(q));
      else arr = arr.filter((p: any) => String(p.name || '').toLowerCase().includes(q));
    }
    const cmp = (a: any, b: any, va: any, vb: any) => {
      if (va == null && vb != null) return sortDir === 'asc' ? -1 : 1;
      if (va != null && vb == null) return sortDir === 'asc' ? 1 : -1;
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      const sa = String(va || '').toLowerCase();
      const sb = String(vb || '').toLowerCase();
      if (sa < sb) return sortDir === 'asc' ? -1 : 1;
      if (sa > sb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    };
    arr.sort((a, b) => {
      if (tab === 'sold') {
        if (sortKey === 'player') return cmp(a, b, a.players?.name, b.players?.name);
        if (sortKey === 'category') return cmp(a, b, a.players?.category, b.players?.category);
        if (sortKey === 'team') return cmp(a, b, a.team?.name, b.team?.name);
        if (sortKey === 'price') return cmp(a, b, Number(a.price || 0), Number(b.price || 0));
        // set sort not shown for sold
        return 0;
      } else {
        if (sortKey === 'player') return cmp(a, b, a.name, b.name);
        if (sortKey === 'category') return cmp(a, b, a.category, b.category);
        if (sortKey === 'set') return cmp(a, b, a.set_id ? setsMap[a.set_id] : '', b.set_id ? setsMap[b.set_id] : '');
        return 0;
      }
    });
    return arr;
  }, [pool, tab, categoryFilter, setFilter, sortKey, sortDir, setsMap]);

  function computeNextBidAmount() {
    const base = Number(auctionInfo?.base_price ?? 0);
    const curr = current?.bid != null ? Number(current.bid) : null;
    if (curr === null) return base;
    let step = 1;
    if (incRules.length > 0) {
      const found = incRules.find(r => curr < Number(r.threshold));
      step = found ? Number(found.increment) : Number(incRules[incRules.length - 1].increment);
    }
    return Number(curr) + Number(step);
  }

  // Clear live status cards when there is no current player (after sold/unsold)
  const currentPlayerName = current?.player_name || '—';
  const currentTeamName = current?.team_name || '—';

  function computeMaxAllowedForTeam(teamId: string) {
    const ag = teamAggs[teamId] || { players_count: 0, spent_total: 0, purse_remaining: 0 };
    const team = teams.find(t => t.id === teamId);
    if (!team) return 0;
    const maxPlayersRaw = (team.max_players ?? null) !== null ? team.max_players : (auctionInfo?.max_players_per_team ?? null);
    const maxPlayers = Number(maxPlayersRaw ?? 0);
    const acquired = Number(ag.players_count ?? 0);
    const remainingSlots = Math.max(maxPlayers - acquired, 0);
    const base = Number(auctionInfo?.base_price ?? 0);
    const requiredReserve = Math.max(remainingSlots - 1, 0) * base;
    return Math.max(Number(ag.purse_remaining ?? 0) - requiredReserve, 0);
  }

  // CSV export helpers
  function csvEscape(value: any) {
    if (value === null || value === undefined) return '';
    const s = String(value).replace(/\r?\n|\r/g, ' ').replace(/"/g, '""');
    return '"' + s + '"';
  }
  function downloadCsv(filename: string, rows: Array<Record<string, any>>) {
    if (!rows || rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')].concat(
      rows.map(r => headers.map(h => csvEscape(r[h])).join(','))
    );
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportTeamPursesCsv() {
    const rows = sortedTeams.map((t: any) => {
      const ag = teamAggs[t.id] || { purse_remaining: 0, spent_total: 0, players_count: 0 };
      const maxPlayersRaw = (t.max_players ?? null) !== null ? t.max_players : (auctionInfo?.max_players_per_team ?? null);
      const maxPlayers = Number(maxPlayersRaw ?? 0);
      const acquired = Number(ag.players_count ?? 0);
      const remainingSlots = Math.max(maxPlayers - acquired, 0);
      const base = Number(auctionInfo?.base_price ?? 0);
      const requiredReserve = Math.max(remainingSlots - 1, 0) * base;
      const maxNextBid = Math.max(Number(ag.purse_remaining ?? 0) - requiredReserve, 0);
      return {
        team: t.name,
        acquired: (maxPlayersRaw ?? null) === null ? `${acquired}` : `${acquired}/${maxPlayers}`,
        spent: ag.spent_total,
        remaining: ag.purse_remaining,
        max_next_bid: maxNextBid
      };
    });
    if (rows.length > 0) downloadCsv(`team_purses_${auctionId}.csv`, rows);
  }

  async function exportPlayerPoolCsv() {
    // Fetch sold from assignments with joins
    const [{ data: sold }, { data: available }, { data: unsold }] = await Promise.all([
      supabase
        .from('assignments')
        .select('price, players:auction_players(name, category, set_id), team:teams(name)')
        .eq('auction_id', auctionId),
      supabase
        .from('auction_players')
        .select('name, category, status, set_id')
        .eq('auction_id', auctionId)
        .eq('status', 'available'),
      supabase
        .from('auction_players')
        .select('name, category, status, set_id')
        .eq('auction_id', auctionId)
        .eq('status', 'unsold')
    ]);

    const soldRows = ((sold as any[]) || []).map((r: any) => ({
      player: r.players?.name || '',
      set: r.players?.set_id ? (setsMap[r.players.set_id] || '') : '',
      category: r.players?.category || '',
      status: 'sold',
      team: r.team?.name || '',
      price: r.price ?? ''
    }));
    const availRows = ((available as any[]) || []).map((r: any) => ({
      player: r.name || '',
      set: r.set_id ? (setsMap[r.set_id] || '') : '',
      category: r.category || '',
      status: 'available',
      team: '',
      price: ''
    }));
    const unsoldRows = ((unsold as any[]) || []).map((r: any) => ({
      player: r.name || '',
      set: r.set_id ? (setsMap[r.set_id] || '') : '',
      category: r.category || '',
      status: 'unsold',
      team: '',
      price: ''
    }));
    const rows = [...soldRows, ...availRows, ...unsoldRows];
    if (rows.length > 0) downloadCsv(`player_pool_all_${auctionId}.csv`, rows);
  }

  async function exportTeamCompositionsCsv() {
    const { data } = await supabase
      .from('assignments')
      .select('price, players:auction_players(name, category, set_id), team:teams(name)')
      .eq('auction_id', auctionId)
      .order('team_id', { ascending: true })
      .order('created_at', { ascending: true });
    const rows = ((data as any[]) || []).map((r: any) => ({
      team: r.team?.name || '',
      player: r.players?.name || '',
      category: r.players?.category || '',
      set: r.players?.set_id ? (setsMap[r.players.set_id] || '') : '',
      price: r.price ?? ''
    }));
    if (rows.length > 0) downloadCsv(`team_compositions_${auctionId}.csv`, rows);
  }

  return (
    <div className={`${darkMode ? 'text-gray-100' : 'text-white'}`} style={{ fontFamily: 'Spline Sans, Noto Sans, sans-serif', backgroundColor: darkMode ? '#0b0a16' : '#110f22', height: '100vh' }} suppressHydrationWarning>
      {darkMode && mounted && (
        <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
          <video
            ref={bgVideoRef}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-cover"
            style={{ width: '100vw', height: '100vh' }}
            muted
            loop
            autoPlay
            playsInline
            preload="auto"
            key={bgVideoId}
          >
            <source src={`/videos/bg/${bgVideoId}`} type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/20" />
        </div>
      )}
      <div className="flex h-full overflow-hidden flex-col">
        {darkMode ? (
          <header>
            <LiquidGlassCard className="rounded-none" style={{ borderRadius: 0 , padding: '4px 0px'}} size="cozy">
              <div className="flex items-center justify-between px-10 py-4">
                <div className="flex items-center gap-4 text-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="Auction Central" className="h-10 w-10 rounded-full object-cover ring-1 ring-white/20 bg-white" src="/images/auction-central-3d-03.jpg" />
                  <div className="leading-tight">
                    <h1 className="text-2xl font-bold tracking-tight drop-shadow-[0_0_6px_rgba(236,72,153,0.5)]">Auction Central</h1>
                    <div className="-mt-0.5 text-xs text-gray-300">Sponsored by UCL</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <select
                    className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-gray-100"
                    value={bgVideoId}
                    onChange={(e) => {
                      const sel = e.target as HTMLSelectElement;
                      const speedPct = sel.selectedOptions?.[0]?.getAttribute('data-speed');
                      const rate = speedPct ? Number(speedPct) / 100 : 1;
                      setBgVideoId(sel.value);
                      setBgPlaybackRate(rate);
                    }}
                    title="Background video"
                  >
                    <option value="bg-lines.mp4" data-speed="20">Lines</option>
                    <option value="bg-prism.mp4" data-speed="25">Prism</option>
                    <option value="bg-gif.mp4" data-speed="25">GIF</option>
                  </select>
                  <button
                    role="switch"
                    aria-checked={darkMode}
                    onClick={() => setDarkMode(s => !s)}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-all bg-gradient-to-r from-fuchsia-500/30 via-purple-500/30 to-sky-500/30 ring-1 ring-white/20 shadow`}
                    title="Toggle theme"
                    aria-disabled="true"
                    disabled
                  >
                    <span className={`absolute left-1 top-1 inline-flex h-6 w-6 transform items-center justify-center rounded-full bg-white transition-all translate-x-6 shadow-[0_0_10px_rgba(236,72,153,0.6)]`}>
                      <span className="material-symbols-outlined text-sm text-gray-600">light_mode</span>
                    </span>
                    <span className="absolute inset-0 rounded-full blur-md bg-gradient-to-r from-fuchsia-500/20 via-purple-500/20 to-sky-500/20" />
                  </button>
                </div>
              </div>
            </LiquidGlassCard>
          </header>
        ) : (
          <header className="flex items-center justify-between border-b px-10 py-4 border-black bg-black relative">
            <div className="absolute -right-[100px] top-[0px] h-[400px] w-[600px] blur-[10px] will-change-[filter] [transform:translateZ(0)]"
            style={{background:"radial-gradient(circle, rgb(134 0 255 / 1) 0%, transparent 100%)", zIndex: 1}}>
            <div className="h-[100%] w-[100%] bg-brand-700"></div>
          </div>
            <div className="flex items-center gap-4 text-gray-800" style={{zIndex: 2}}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Auction Central" className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200 bg-white" src="/images/auction-central-3d-03.jpg" />
              <div className="leading-tight">
                <h1 className="text-2xl font-bold text-white tracking-tight">Auction Central</h1>
                <div className="-mt-0.5 text-xs text-gray-300">Sponsored by UCL</div>
              </div>
            </div>
            <div className="flex items-center gap-3" style={{zIndex: 2}}>
              <button
                role="switch"
                aria-checked={darkMode}
                onClick={() => setDarkMode(s => !s)}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-all bg-gray-200 shadow`}
                title="Toggle theme"
                aria-disabled="true"
                disabled
              >
                <span className={`absolute left-1 top-1 inline-flex h-6 w-6 transform items-center justify-center rounded-full bg-white transition-all translate-x-0`}>
                  <span className="material-symbols-outlined text-sm text-gray-600">dark_mode</span>
                </span>
              </button>
            </div>
          </header>
        )}
        <main className="flex-1 m-2 overflow-hidden min-h-0" style={{ borderRadius: '16px', backgroundColor: darkMode ? 'transparent' : 'rgb(249 250 251 / var(--tw-bg-opacity, 1))', zIndex: 1 }}>
          <div className="mx-auto w-full max-w-full px-6 py-8 overflow-auto h-full">
          <div className="mb-6 flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {auctionInfo?.logo_url ? <img src={auctionInfo.logo_url} alt="auction logo" className="h-15 w-15 rounded-full object-contain ring-1 ring-gray-200 bg-white" style={{ width: '60px', height: '60px' }} /> : <div className="h-15 w-15 rounded-full bg-gray-100 ring-1 ring-gray-200" style={{ width: '60px', height: '60px' }} />}
              <div>
                <div className={`text-2xl font-bold ${darkMode ? 'text-gray-100 drop-shadow-[0_0_8px_rgba(139,92,246,0.6)]' : 'text-gray-900'}`}>{auctionDisplayName}</div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  {sponsors.map(s => (
                    <div key={s.id} className="relative inline-flex items-center">
                      {s.sponsor_type === 'title' && (
                        <span className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-400/20 animate-ping" />
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className={`h-6 ${s.sponsor_type === 'title' ? 'rounded-full ring-2 ring-yellow-500 drop-shadow-[0_0_6px_rgba(234,179,8,0.55)]' : ''}`} src={s.logo_path ? supabase.storage.from('sponsor-logos').getPublicUrl(s.logo_path).data.publicUrl : s.logo_url} alt={s.name} title={s.name} />
                    </div>
                  ))}
                  {sponsors.length === 0 && <span className="text-sm text-gray-500">No sponsors</span>}
                </div>
              </div>
            </div>
            {summary && (
              <div className="grid grid-cols-5 gap-4">
                <SummaryStat label="Teams" value={String(summary.teams_count)} dark={darkMode} />
                <SummaryStat label="Total Spend" value={fmtCurrency(summary.total_spend)} dark={darkMode} />
                <SummaryStat label="Remaining Purse" value={fmtCurrency(summary.remaining_purse)} dark={darkMode} />
                <SummaryStat label="Sold" value={String(summary.sold_count)} dark={darkMode} />
                <SummaryStat label="Unsold" value={String(summary.unsold_count)} dark={darkMode} />
              </div>
            )}
          </div>

          {/* Removed top export toolbar. Section-level export buttons below */}

          <section className="mb-8">
            <h2 className={`mb-4 text-2xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>Current Auction</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-[1.2fr_0.6fr_1.2fr]">
              {darkMode ? (
                <LiquidGlassCard  size="roomy">
                  <p className="text-sm font-medium text-gray-300">Current Player</p>
                  <div className="mt-2 flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {current?.player_photo_url ? (
                      <img src={current.player_photo_url} alt={current?.player_name || ''} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-gray-400 text-2xl">person</span>
                    )}
                    <p className="text-3xl font-bold text-gray-100">{current?.player_name ?? '—'}</p>
                    <span className="px-3 py-1 text-xs font-semibold inline-flex items-center gap-2 rounded-full ml-auto bg-white/20 text-purple-200 ">
                      {current?.player_category ?? '-'}
                    </span>
                  </div>
                </LiquidGlassCard>
              ) : (
                <div className="flex flex-col gap-2 rounded-xl p-6 border border-gray-200 bg-white shadow-sm">
                  <p className="text-sm font-medium text-gray-500">Current Player</p>
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {current?.player_photo_url ? (
                      <img src={current.player_photo_url} alt={current?.player_name || ''} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-gray-400 text-2xl">person</span>
                    )}
                    <p className="text-3xl font-bold text-gray-900">{current?.player_name ?? '—'}</p>
                    <span className="px-3 py-1 text-xs font-semibold inline-flex items-center gap-2 rounded-full ml-auto bg-white text-black border border-black">
                      {current?.player_category ?? '-'}
                    </span>
                  </div>
                </div>
              )}
              {darkMode ? (
                <LiquidGlassCard  size="roomy">
                  <p className="text-sm font-medium text-gray-300">Current Bid</p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-3xl font-bold text-[var(--ucl-purple)] drop-shadow-[0_0_8px_rgba(139,92,246,0.5)]" style={{ WebkitTextStroke: '0.6px rgba(255,255,255,0.5)' }}>{fmtCurrency(current?.bid)}</p>
                  </div>
                </LiquidGlassCard>
              ) : (
                <div className="flex flex-col gap-2 rounded-xl p-6 border border-gray-200 bg-white shadow-sm">
                  <p className="text-sm font-medium text-gray-500">Current Bid</p>
                  <div className="flex items-center justify-between">
                    <p className="text-3xl font-bold text-[var(--ucl-purple)] drop-shadow-[0_0_8px_rgba(139,92,246,0.5)]" style={{ WebkitTextStroke: '0.5px rgba(234,179,8,0.45)' }}>{fmtCurrency(current?.bid)}</p>
                  </div>
                </div>
              )}
              {darkMode ? (
                <LiquidGlassCard  size="roomy">
                  <p className="text-sm font-medium text-gray-300">Highest Bidder</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {current?.team_logo_url ? (
                        <img src={current.team_logo_url} alt={current?.team_name || ''} className="h-10 w-10 rounded-full object-contain ring-1 ring-gray-200 bg_white" />
                      ) : (
                        <span className="material-symbols-outlined text-gray-400 text-2xl">groups</span>
                      )}
                      <p className="text-3xl font-bold text-[var(--ucl-pink)] drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]">{current?.team_name ?? '—'}</p>
                    </div>
                  </div>
                </LiquidGlassCard>
              ) : (
                <div className="flex flex-col gap-2 rounded-xl p-6 border border-gray-200 bg-white shadow-sm">
                  <p className="text-sm font-medium text-gray-500">Highest Bidder</p>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {current?.team_logo_url ? (
                        <img src={current.team_logo_url} alt={current?.team_name || ''} className="h-10 w-10 rounded-full object-contain ring-1 ring-gray-200 bg_white" />
                      ) : (
                        <span className="material-symbols-outlined text-gray-400 text-2xl">groups</span>
                      )}
                      <p className="text-3xl font-bold text-[var(--ucl-pink)] drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]">{current?.team_name ?? '—'}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>Team Purses</h2>
              <button onClick={exportTeamPursesCsv} className={`${darkMode ? 'border-white/20 bg-white/10 text-gray-100 hover:bg-white/15' : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'} rounded-md border px-3 py-1.5 text-sm`}>
                Export CSV
              </button>
            </div>
            {darkMode ? (
              <LiquidGlassCard className="overflow-hidden" size="roomy" style={{ padding: 0 }}>
                <table className="min-w-full divide-y divide-white/10">
                  <thead className={`bg-white/10`}>
                    <tr>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-200`}>Team</th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-200`}>Acquired</th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-200`}>Spent</th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-200`}>Pending</th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-200`}>Max Next Bid</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y divide-white/10 bg-white/5`}>
            {sortedTeams.map((t: any) => {
              const ag = teamAggs[t.id] || { purse_remaining: 0, spent_total: 0, players_count: 0 };
              const maxPlayersRaw = (t.max_players ?? null) !== null ? t.max_players : (auctionInfo?.max_players_per_team ?? null);
              const maxPlayers = Number(maxPlayersRaw ?? 0);
              const acquired = Number(ag.players_count ?? 0);
              const remainingSlots = Math.max(maxPlayers - acquired, 0);
              const base = Number(auctionInfo?.base_price ?? 0);
              const requiredReserve = Math.max(remainingSlots - 1, 0) * base;
              const maxNextBid = Math.max(Number(ag.purse_remaining ?? 0) - requiredReserve, 0);
              const acquiredDisplay = `${acquired}/${(maxPlayersRaw ?? null) === null ? '—' : maxPlayers}`;
              const teamLogo = t.logo_path ? supabase.storage.from('team-logos').getPublicUrl(t.logo_path).data.publicUrl : (t.logo_url || '');
              return (
                <tr key={t.id}>
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-gray-100">
                    <span className="inline-flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {teamLogo ? <img src={teamLogo} alt={t.name} className="h-6 w-6 rounded-full object-contain ring-1 ring-gray-200 bg-white" /> : <span className="material-symbols-outlined text-gray-400 text-base">groups</span>}
                      <span className="text-gray-100">{t.name}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-100">{acquiredDisplay}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-rose-300">{fmtCurrency(ag.spent_total)}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-emerald-300">{fmtCurrency(ag.purse_remaining)}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-100">{fmtCurrency(maxNextBid)}</td>
                </tr>
              );
            })}
                  </tbody>
                </table>
              </LiquidGlassCard>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className={`${darkMode ? 'bg-white/10' : 'bg-gray-50'}`}>
                    <tr>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-200' : 'text-gray-500'}`}>Team</th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-200' : 'text-gray-500'}`}>Acquired</th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-200' : 'text-gray-500'}`}>Spent</th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-200' : 'text-gray-500'}`}>Pending</th>
                      <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-200' : 'text-gray-500'}`}>Max Next Bid</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? 'divide-white/10 bg-white/5' : 'divide-gray-200 bg-white'}`}>
                    {sortedTeams.map((t: any) => {
                      const ag = teamAggs[t.id] || { purse_remaining: 0, spent_total: 0, players_count: 0 };
                      const maxPlayersRaw = (t.max_players ?? null) !== null ? t.max_players : (auctionInfo?.max_players_per_team ?? null);
                      const maxPlayers = Number(maxPlayersRaw ?? 0);
                      const acquired = Number(ag.players_count ?? 0);
                      const remainingSlots = Math.max(maxPlayers - acquired, 0);
                      const base = Number(auctionInfo?.base_price ?? 0);
                      const requiredReserve = Math.max(remainingSlots - 1, 0) * base;
                      const maxNextBid = Math.max(Number(ag.purse_remaining ?? 0) - requiredReserve, 0);
                      const acquiredDisplay = `${acquired}/${(maxPlayersRaw ?? null) === null ? '—' : maxPlayers}`;
                      const teamLogo = t.logo_path ? supabase.storage.from('team-logos').getPublicUrl(t.logo_path).data.publicUrl : (t.logo_url || '');
                      return (
                        <tr key={t.id}>
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-bold text-gray-900">
                            <span className="inline-flex items-center gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {teamLogo ? <img src={teamLogo} alt={t.name} className="h-6 w-6 rounded-full object-contain ring-1 ring-gray-200 bg-white" /> : <span className="material-symbols-outlined text-gray-400 text-base">groups</span>}
                              <span className="text-gray-900">{t.name}</span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{acquiredDisplay}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-rose-600">{fmtCurrency(ag.spent_total)}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-emerald-600">{fmtCurrency(ag.purse_remaining)}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">{fmtCurrency(maxNextBid)}</td>
                        </tr>
                      );
                    })}
                    {sortedTeams.length === 0 && (
                      <tr><td className="px-6 py-6 text-sm text-gray-500" colSpan={5}>No teams.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>Team Compositions</h2>
              <button onClick={exportTeamCompositionsCsv} className={`${darkMode ? 'border-white/20 bg-white/10 text-gray-100 hover:bg-white/15' : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'} rounded-md border px-3 py-1.5 text-sm`}>
                Export CSV
              </button>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedTeams.map((t: any) => {
                const ag = teamAggs[t.id] || { purse_remaining: 0, spent_total: 0, players_count: 0 };
                const teamLogo = t.logo_path ? supabase.storage.from('team-logos').getPublicUrl(t.logo_path).data.publicUrl : (t.logo_url || '');
                return darkMode ? (
                  <LiquidGlassCard key={t.id}  size="cozy">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {teamLogo ? <img src={teamLogo} alt={t.name} className="h-6 w-6 rounded-full object-contain ring-1 ring-gray-200 bg-white" /> : <span className="material-symbols-outlined text-gray-400 text-base">groups</span>}
                        <h3 className="text-lg font-bold text-gray-100">{t.name}</h3>
                      </div>
                      <span className="text-xs font-medium text-gray-300">{fmtCurrency(ag.purse_remaining)} left</span>
                    </div>
                    <div className="mt-3">
                      <ul className="space-y-2">
                        <TeamPlayers auctionId={auctionId} teamId={t.id} dark={darkMode} />
                      </ul>
                    </div>
                  </LiquidGlassCard>
                ) : (
                  <div key={t.id} className="rounded-xl p-4 border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {teamLogo ? <img src={teamLogo} alt={t.name} className="h-6 w-6 rounded-full object-contain ring-1 ring-gray-200 bg-white" /> : <span className="material-symbols-outlined text-gray-400 text-base">groups</span>}
                        <h3 className="text-lg font-bold text-gray-900">{t.name}</h3>
                      </div>
                      <span className="text-xs font-medium text-gray-500">{fmtCurrency(ag.purse_remaining)} left</span>
                    </div>
                    <div className="mt-3">
                      <ul className="space-y-2">
                        <TeamPlayers auctionId={auctionId} teamId={t.id} dark={darkMode} />
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className={`text-2xl font-bold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>Player Pool Status</h2>
              <button onClick={exportPlayerPoolCsv} className={`${darkMode ? 'border-white/20 bg-white/10 text-gray-100 hover:bg-white/15' : 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50'} rounded-md border px-3 py-1.5 text-sm`}>
                Export CSV
              </button>
            </div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className={`inline-flex rounded-lg ${darkMode ? 'bg-white/10 border border-white/10' : 'bg-gray-100 border border-gray-200'}`}>
                <button onClick={() => setTab('available')} className={`px-3 py-1.5 text-sm rounded-l-lg ${tab === 'available' ? (darkMode ? 'bg-white/20 text-white' : 'bg-white text-gray-900') : (darkMode ? 'text-gray-300' : 'text-gray-700')}`}>Available</button>
                <button onClick={() => setTab('sold')} className={`px-3 py-1.5 text-sm ${tab === 'sold' ? (darkMode ? 'bg-white/20 text-white' : 'bg-white text-gray-900') : (darkMode ? 'text-gray-300' : 'text-gray-700')}`}>Sold</button>
                <button onClick={() => setTab('unsold')} className={`px-3 py-1.5 text-sm rounded-r-lg ${tab === 'unsold' ? (darkMode ? 'bg-white/20 text-white' : 'bg-white text-gray-900') : (darkMode ? 'text-gray-300' : 'text-gray-700')}`}>Unsold</button>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <input
                  className={`${darkMode ? 'border-white/20 bg-white/10 text-gray-100 placeholder:text-gray-400' : 'border-gray-300 bg-white text-gray-900 placeholder:text-gray-500'} rounded-md border px-3 py-1.5 text-sm`}
                  placeholder="Search player"
                  value={poolSearch}
                  onChange={(e) => setPoolSearch(e.target.value)}
                  title="Search player"
                />
                {tab !== 'sold' ? (
                  <>
                    <select
                      className={`${darkMode ? 'border-white/20 bg-white/10 text-gray-100' : 'border-gray-300 bg-white text-gray-900'} rounded-md border px-3 py-1.5 text-sm`}
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      title="Category filter"
                    >
                      <option value="">All Categories</option>
                      {[...new Set(pool.map((r: any) => (r.category || '')).filter(Boolean))].sort().map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <select
                      className={`${darkMode ? 'border-white/20 bg-white/10 text-gray-100' : 'border-gray-300 bg-white text-gray-900'} rounded-md border px-3 py-1.5 text-sm`}
                      value={setFilter}
                      onChange={(e) => setSetFilter(e.target.value)}
                      title="Set filter"
                    >
                      <option value="">All Sets</option>
                      {setsList.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <select
                      className={`${darkMode ? 'border-white/20 bg-white/10 text-gray-100' : 'border-gray-300 bg-white text-gray-900'} rounded-md border px-3 py-1.5 text-sm`}
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                      title="Category filter"
                    >
                      <option value="">All Categories</option>
                      {[...new Set(pool.map((r: any) => (r.players?.category || '')).filter(Boolean))].sort().map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <select
                      className={`${darkMode ? 'border-white/20 bg-white/10 text-gray-100' : 'border-gray-300 bg-white text-gray-900'} rounded-md border px-3 py-1.5 text-sm`}
                      value={teamFilter}
                      onChange={(e) => setTeamFilter(e.target.value)}
                      title="Team filter"
                    >
                      <option value="">All Teams</option>
                      {sortedTeams.map((t: any) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>
            {darkMode ? (
              <LiquidGlassCard className="rounded-xl  overflow-hidden" size="roomy" style={{ padding: '0px'}}>
                <table className="min-w-full divide-y divide-white/10">
                  <thead className={`bg-white/10`}>
                    <tr>
                      <th onClick={() => toggleSort('player')} className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-200`}>
                        <div className="flex items-center gap-1">
                          <span>Player</span>
                          <span className="material-symbols-outlined text-xs">{sortKey === 'player' ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}</span>
                        </div>
                      </th>
                      <th onClick={() => toggleSort('category')} className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-200`}>
                        <div className="flex items-center gap-1">
                          <span>Category</span>
                          <span className="material-symbols-outlined text-xs">{sortKey === 'category' ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}</span>
                        </div>
                      </th>
                      {tab === 'sold' ? (
                        <>
                          <th onClick={() => toggleSort('team')} className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-200`}>
                            <div className="flex items-center gap-1">
                              <span>Team</span>
                              <span className="material-symbols-outlined text-xs">{sortKey === 'team' ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}</span>
                            </div>
                          </th>
                          <th onClick={() => toggleSort('price')} className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-200`}>
                            <div className="flex items-center gap-1">
                              <span>Price</span>
                              <span className="material-symbols-outlined text-xs">{sortKey === 'price' ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}</span>
                            </div>
                          </th>
                        </>
                      ) : (
                        <th onClick={() => toggleSort('set')} className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-200`}>
                          <div className="flex items-center gap-1">
                            <span>Set</span>
                            <span className="material-symbols-outlined text-xs">{sortKey === 'set' ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}</span>
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className={`divide-y divide-white/10 bg-white/5`}>
                    {tab === 'sold' ? (
                      displayPool.map((r: any, idx: number) => {
                        const avatar = r.players?.photo_path ? supabase.storage.from('player-photos').getPublicUrl(r.players.photo_path).data.publicUrl : (r.players?.photo_url || '');
                        return (
                          <tr key={idx}>
                            <td className={`whitespace-nowrap px-6 py-4 text-sm font-medium text-white`}>
                              <span className="inline-flex items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {avatar ? <img src={avatar} alt={r.players?.name} className="h-6 w-6 rounded-full object-cover" /> : <span className="material-symbols-outlined text-gray-400 text-base">person</span>}
                                <span>{r.players?.name}</span>
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{r.players?.category}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{r.team?.name || '—'}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{fmtCurrency(r.price)}</td>
                          </tr>
                        );
                      })
                    ) : (
                      displayPool.map((p: any, idx: number) => {
                        const avatar = p.photo_path ? supabase.storage.from('player-photos').getPublicUrl(p.photo_path).data.publicUrl : (p.photo_url || '');
                        return (
                          <tr key={idx}>
                            <td className={`whitespace-nowrap px-6 py-4 text-sm font-medium text-white`}>
                              <span className="inline-flex items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {avatar ? <img src={avatar} alt={p.name} className="h-6 w-6 rounded-full object-cover" /> : <span className="material-symbols-outlined text-gray-400 text-base">person</span>}
                                <span>{p.name}</span>
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{p.category}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">{p.set_id ? (setsMap[p.set_id] || '—') : '—'}</td>
                          </tr>
                        );
                      })
                    )}
                    {pool.length === 0 && (
                      <tr><td className="px-6 py-6 text-sm text-gray-300" colSpan={tab === 'sold' ? 4 : 3}>No players.</td></tr>
                    )}
                  </tbody>
                </table>
              </LiquidGlassCard>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className={`${darkMode ? 'bg-white/10' : 'bg-gray-50'}`}>
                    <tr>
                      <th onClick={() => toggleSort('player')} className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-200' : 'text-gray-500'}`}>
                        <div className="flex items-center gap-1">
                          <span>Player</span>
                          <span className="material-symbols-outlined text-xs">{sortKey === 'player' ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}</span>
                        </div>
                      </th>
                      <th onClick={() => toggleSort('category')} className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-200' : 'text-gray-500'}`}>
                        <div className="flex items-center gap-1">
                          <span>Category</span>
                          <span className="material-symbols-outlined text-xs">{sortKey === 'category' ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}</span>
                        </div>
                      </th>
                      {tab === 'sold' ? (
                        <>
                          <th onClick={() => toggleSort('team')} className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-200' : 'text-gray-500'}`}>
                            <div className="flex items-center gap-1">
                              <span>Team</span>
                              <span className="material-symbols-outlined text-xs">{sortKey === 'team' ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}</span>
                            </div>
                          </th>
                          <th onClick={() => toggleSort('price')} className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-200' : 'text-gray-500'}`}>
                            <div className="flex items-center gap-1">
                              <span>Price</span>
                              <span className="material-symbols-outlined text-xs">{sortKey === 'price' ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}</span>
                            </div>
                          </th>
                        </>
                      ) : (
                        <th onClick={() => toggleSort('set')} className={`cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-200' : 'text-gray-500'}`}>
                          <div className="flex items-center gap-1">
                            <span>Set</span>
                            <span className="material-symbols-outlined text-xs">{sortKey === 'set' ? (sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}</span>
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? 'divide-white/10 bg-white/5' : 'divide-gray-200 bg-white'}`}>
                    {tab === 'sold' ? (
                      displayPool.map((r: any, idx: number) => {
                        const avatar = r.players?.photo_path ? supabase.storage.from('player-photos').getPublicUrl(r.players.photo_path).data.publicUrl : (r.players?.photo_url || '');
                        return (
                          <tr key={idx}>
                            <td className={`whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900`}>
                              <span className="inline-flex items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {avatar ? <img src={avatar} alt={r.players?.name} className="h-6 w-6 rounded-full object-cover" /> : <span className="material-symbols-outlined text-gray-400 text-base">person</span>}
                                <span>{r.players?.name}</span>
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{r.players?.category}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{r.team?.name || '—'}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{fmtCurrency(r.price)}</td>
                          </tr>
                        );
                      })
                    ) : (
                      displayPool.map((p: any, idx: number) => {
                        const avatar = p.photo_path ? supabase.storage.from('player-photos').getPublicUrl(p.photo_path).data.publicUrl : (p.photo_url || '');
                        return (
                          <tr key={idx}>
                            <td className={`whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900`}>
                              <span className="inline-flex items-center gap-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {avatar ? <img src={avatar} alt={p.name} className="h-6 w-6 rounded-full object-cover" /> : <span className="material-symbols-outlined text-gray-400 text-base">person</span>}
                                <span>{p.name}</span>
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{p.category}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-700">{p.set_id ? (setsMap[p.set_id] || '—') : '—'}</td>
                          </tr>
                        );
                      })
                    )}
                    {pool.length === 0 && (
                      <tr><td className="px-6 py-6 text-sm text-gray-500" colSpan={tab === 'sold' ? 4 : 3}>No players.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          </div>
        </main>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  if (dark) {
    return (
      <LiquidGlassCard className="" size="compact">
        <div className="text-center">
          <div className="text-xs text-gray-300">{label}</div>
          <div className="text-lg font-bold text-gray-100">{value}</div>
        </div>
      </LiquidGlassCard>
    );
  }
  return (
    <div className={`rounded-lg px-4 py-3 text-center border border-gray-200 bg-white/80 shadow-sm`}>
      <div className={`text-xs text-gray-500`}>{label}</div>
      <div className={`text-lg font-bold text-gray-900`}>{value}</div>
    </div>
  );
}

function TeamPlayers({ auctionId, teamId, dark }: { auctionId: string; teamId: string; dark?: boolean }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from('assignments')
        .select('price, players:auction_players(name, category)')
        .eq('auction_id', auctionId)
        .eq('team_id', teamId)
        .order('created_at', { ascending: true });
      if (!mounted) return;
      setRows((data as any[]) ?? []);
    })();
    return () => { mounted = false; };
  }, [auctionId, teamId]);
  function renderCategoryIcon(cat?: string) {
    const c = String(cat || '').toLowerCase();
    const size = 16;
    const imgStyle = dark ? { filter: 'invert(1)' } as React.CSSProperties : undefined;
    const imgClass = dark ? 'opacity-90' : undefined;
    // Allrounders
    if (c.includes('all') && (c.includes('round') || c.includes('ar'))) {
      if (c.includes('bowl')) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src="/images/icon-all-ball.svg" alt="Bowling Allrounder" width={size} height={size} style={imgStyle} className={imgClass} />;
      }
      if (c.includes('bat')) {
        // eslint-disable-next-line @next/next/no-img-element
        return <img src="/images/icon-all-bat.svg" alt="Batting Allrounder" width={size} height={size} style={imgStyle} className={imgClass} />;
      }
      // default allrounder: pick batting icon
      // eslint-disable-next-line @next/next/no-img-element
      return <img src="/images/icon-all-bat.svg" alt="Allrounder" width={size} height={size} style={imgStyle} className={imgClass} />;
    }
    // Wicketkeeper
    if (c.includes('wicket') || c.includes('keeper') || c === 'wk') {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src="/images/icon-wk.svg" alt="Wicketkeeper" width={size} height={size} style={imgStyle} className={imgClass} />;
    }
    // Bowler
    if (c.includes('bowler') || c === 'bowl') {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src="/images/icon-ball.svg" alt="Bowler" width={size} height={size} style={imgStyle} className={imgClass} />;
    }
    // Batsman
    if (c.includes('bats') || c.includes('bat')) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src="/images/icon-bat.svg" alt="Batsman" width={size} height={size} style={imgStyle} className={imgClass} />;
    }
    // Fallback
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/images/icon-bat.svg" alt="Player" width={size} height={size} style={imgStyle} className={imgClass} />;
  }
  return (
    <>
      {rows.map((r, idx) => (
        <li key={idx} className={`flex items-center justify-between rounded-lg p-3 ${dark ? 'border border-white/10 bg-white/10 backdrop-blur-lg text-gray-100' : 'bg-gray-50'}`}>
          <span className={`font-medium ${dark ? 'text-gray-100' : 'text-gray-800'}`}>{r.players?.name}</span>
          <span className="flex items-center gap-2">
            <span title={r.players?.category || ''} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${dark ? 'bg-white/10 text-gray-100 border border-white/15' : 'bg-white text-gray-700 border border-gray-200'}`}>
              {renderCategoryIcon(r.players?.category)}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${dark ? 'bg-white/10 text-emerald-200 border border-white/15' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
              {fmtCurrency(r.price)}
            </span>
          </span>
        </li>
      ))}
      {rows.length === 0 && <li className={`rounded-lg p-3 text-sm ${dark ? 'border border-white/10 bg-white/10 backdrop-blur-lg text-gray-300' : 'bg-gray-50 text-gray-500'}`}>No players yet.</li>}
    </>
  );
}

function fmtCurrency(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
} 