'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import OverlayFrame from '../../../../components/OverlayFrame';
import LiquidGlassCard from '../../../../components/LiquidGlassCard';

export default function PlayerOverlayPage() {
  const params = useParams();
  const search = useSearchParams();
  const auctionId = params?.id as string;

  const chroma = search?.get('chroma') === '1';
  const safeArea = Number(search?.get('safe') || 24);

  const [current, setCurrent] = useState<{
    player_name: string | null;
    player_category: string | null;
    player_photo_url: string | null;
    bid: number | null;
    team_name: string | null;
    team_logo_url: string | null;
    bat_style?: string | null;
    bowl_style?: string | null;
    matches?: number | null;
    overs?: number | null;
    runs?: number | null;
    wickets?: number | null;
    average?: number | null;
    strike_rate?: number | null;
    economy?: number | null;
  } | null>(null);
  const [auctionInfo, setAuctionInfo] = useState<{ name: string; logo_url?: string | null } | null>(null);
  const [scopeLabel, setScopeLabel] = useState<string>('');

  async function fetchCurrent() {
    const { data: a } = await supabase.from('auctions').select('name,logo_path,logo_url,current_player_id,queue_scope,current_set_id').eq('id', auctionId).maybeSingle();
    const infoName = (a as any)?.name || 'Auction';
    let logo: string | null = null;
    if ((a as any)?.logo_path) logo = supabase.storage.from('auction-logos').getPublicUrl((a as any).logo_path).data.publicUrl;
    else if ((a as any)?.logo_url) logo = (a as any).logo_url;
    setAuctionInfo({ name: infoName, logo_url: logo });
    // scope label
    try {
      const scope = (a as any)?.queue_scope || 'default';
      const setId = (a as any)?.current_set_id || null;
      let label = 'All (Default)';
      if (scope === 'unsold') label = 'Unsold';
      if (scope === 'set' && setId) {
        const { data: s } = await supabase.from('auction_sets').select('name').eq('id', setId).maybeSingle();
        label = (s as any)?.name || 'By Set';
      }
      setScopeLabel(label);
    } catch {}

    const playerId: string | null = (a as any)?.current_player_id ?? null;
    if (!playerId) { setCurrent(null); return; }

    const { data: pl } = await supabase
      .from('auction_players')
      .select('id,name,category,photo_path,photo_url,bat_style,bowl_style,matches,overs,runs,wickets,average,strike_rate,economy')
      .eq('id', playerId)
      .maybeSingle();
    const playerName = (pl as any)?.name ?? null;
    const playerCategory = (pl as any)?.category ?? null;
    const playerPhotoUrl = (pl as any)?.photo_path ? supabase.storage.from('player-photos').getPublicUrl((pl as any).photo_path).data.publicUrl : ((pl as any)?.photo_url || null);

    let bid: number | null = null;
    let teamName: string | null = null;
    let teamLogoUrl: string | null = null;
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
      const tLogoPath = (b as any)?.teams?.logo_path || null;
      // @ts-ignore
      const tLogoUrl = (b as any)?.teams?.logo_url || null;
      teamLogoUrl = tLogoPath ? supabase.storage.from('team-logos').getPublicUrl(tLogoPath).data.publicUrl : (tLogoUrl || null);
    }

    setCurrent({
      player_name: playerName,
      player_category: playerCategory,
      player_photo_url: playerPhotoUrl,
      bid,
      team_name: teamName,
      team_logo_url: teamLogoUrl,
      bat_style: (pl as any)?.bat_style ?? null,
      bowl_style: (pl as any)?.bowl_style ?? null,
      matches: toNum((pl as any)?.matches),
      overs: toNum((pl as any)?.overs),
      runs: toNum((pl as any)?.runs),
      wickets: toNum((pl as any)?.wickets),
      average: toNum((pl as any)?.average),
      strike_rate: toNum((pl as any)?.strike_rate),
      economy: toNum((pl as any)?.economy),
    });
  }

  useEffect(() => {
    let mounted = true;
    (async () => { if (!mounted) return; await fetchCurrent(); })();
    return () => { mounted = false; };
  }, [auctionId]);

  useEffect(() => {
    let cancelled = false;
    let channel = subscribe();

    function subscribe() {
      const ch = supabase
        .channel(`overlay-player-${auctionId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions', filter: `id=eq.${auctionId}` }, () => fetchCurrent())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bids', filter: `auction_id=eq.${auctionId}` }, () => fetchCurrent())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `auction_id=eq.${auctionId}` }, () => fetchCurrent())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_players', filter: `auction_id=eq.${auctionId}` }, () => fetchCurrent())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `auction_id=eq.${auctionId}` }, () => fetchCurrent())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_events', filter: `auction_id=eq.${auctionId}` }, () => fetchCurrent())
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            fetchCurrent();
            return;
          }
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

  return (
    <OverlayFrame chroma={chroma} safeArea={safeArea} className="w-screen h-screen">
      <div className="relative h-full w-full">
        <div className="absolute inset-0 -z-10" />
        <div className="flex h-full w-full flex-col gap-6">
          <main className="flex-1 flex items-center justify-center">
            <div className="w-full max-w-4xl">
              <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden border-2 border-white">
                <div className="grid grid-cols-3">
                  <div className="col-span-1 bg-[#F8F7FA] p-6 flex flex-col items-center justify-center relative">
                    <div className="absolute left-4 top-4 flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/images/auction-central-3d-03.jpg" alt="Auction Central" className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200 bg-white" />
                      <div className="leading-tight">
                        <div className="text-lg font-bold text-gray-800 tracking-tight">Auction Central</div>
                        <div className="-mt-0.5 text-[11px] text-gray-500">Sponsored by UCL</div>
                      </div>
                    </div>
                    <div className="relative mt-10">
                      <div className="w-64 h-64 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 p-1.5 shadow-lg">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {current?.player_photo_url ? (
                          <img src={current.player_photo_url} alt={current?.player_name || ''} className="w-full h-full rounded-full object-cover border-4 border-white" />
                        ) : (
                          <div className="w-full h-full rounded-full bg-white border-4 border-white flex items-center justify-center">
                            <span className="material-symbols-outlined text-5xl text-gray-400">person</span>
                          </div>
                        )}
                      </div>
                      <span className="absolute bottom-4 right-4 bg-white rounded-full p-2 shadow-md">
                        {renderCategoryIcon(current?.player_category || undefined, 32)}
                      </span>
                    </div>
                    <h2 className="mt-4 text-4xl font-extrabold text-gray-800 tracking-tight text-center">{current?.player_name ?? '—'}</h2>
                    <p className="text-xl font-semibold text-pink-600 mt-1">{current?.player_category ?? '—'}</p>
                  </div>
                  <div className="col-span-2 p-6 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Currently Bidding</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="material-symbols-outlined text-purple-600 text-4xl animate-pulse">gavel</span>
                            <p className="mt-0 text-lg font-semibold text-gray-700">{scopeLabel}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Highest Bid</p>
                          <p className="text-5xl font-black bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 bg-[length:200%_200%] bg-clip-text text-transparent">{fmtCurrency(current?.bid)}</p>
                          <p className="text-xl font-bold text-purple-600">{current?.team_name ? `${current.team_name}` : ''}</p>
                        </div>
                      </div>
                      <div className="space-y-4 mt-8">
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-bold text-gray-500 text-xs uppercase tracking-wider mb-3">Player Info</h4>
                          <div className="flex flex-col items-start gap-6">
                            <div className="flex items-center gap-2">
                              <img src="/images/icon-bat.svg" alt="Batting" width={16} height={16} />
                              <p className="text-gray-800 font-medium">Batting: {current?.bat_style || '—'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <img src="/images/icon-ball.svg" alt="Bowling" width={16} height={16} />
                              <p className="text-gray-800 font-medium">Bowling: {current?.bowl_style || '—'}</p>
                            </div>
                          </div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-4 mt-8">
                          <h4 className="font-bold text-gray-500 text-xs uppercase tracking-wider mb-3">Career Statistics</h4>
                          <div className="space-y-3">
                            {/* Row 1: Matches, Runs, Average, S/R */}
                            <div className="grid grid-cols-4 gap-3 text-center">
                              <div className="bg-white p-3 rounded-md shadow-sm border border-gray-100">
                                <p className="text-2xl font-bold text-gray-800">{fmtNumber(current?.matches)}</p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Matches</p>
                              </div>
                              <div className="bg-white p-3 rounded-md shadow-sm border border-gray-100">
                                <p className="text-2xl font-bold text-gray-800">{fmtNumber(current?.runs)}</p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Runs</p>
                              </div>
                              <div className="bg-white p-3 rounded-md shadow-sm border border-gray-100">
                                <p className="text-2xl font-bold text-gray-800">{fmtNumber(current?.average, 2)}</p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Average</p>
                              </div>
                              <div className="bg-white p-3 rounded-md shadow-sm border border-gray-100">
                                <p className="text-2xl font-bold text-gray-800">{fmtNumber(current?.strike_rate, 2)}</p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider">S/R</p>
                              </div>
                            </div>
                            {/* Row 2: Overs, Wickets, Economy (match widths with row 1 and left align) */}
                            <div className="grid grid-cols-4 gap-3 text-center">
                              <div className="bg-white p-3 rounded-md shadow-sm border border-gray-100">
                                <p className="text-2xl font-bold text-gray-800">{fmtNumber(current?.overs, 1)}</p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Overs</p>
                              </div>
                              <div className="bg-white p-3 rounded-md shadow-sm border border-gray-100">
                                <p className="text-2xl font-bold text-gray-800">{fmtNumber(current?.wickets)}</p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Wickets</p>
                              </div>
                              <div className="bg-white p-3 rounded-md shadow-sm border border-gray-100">
                                <p className="text-2xl font-bold text-gray-800">{fmtNumber(current?.economy, 2)}</p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider">Economy</p>
                              </div>
                              <div />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </OverlayFrame>
  );
}

function fmtCurrency(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtNumber(v: any, digits = 0) {
  if (v == null) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toFixed(digits);
}

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function renderCategoryIcon(cat?: string, size = 24) {
  const c = String(cat || '').toLowerCase();
  if (c.includes('all') && (c.includes('round') || c.includes('ar'))) {
    if (c.includes('bowl')) return (<img src="/images/icon-all-ball.svg" alt="Bowling Allrounder" width={size} height={size} />);
    if (c.includes('bat')) return (<img src="/images/icon-all-bat.svg" alt="Batting Allrounder" width={size} height={size} />);
    return (<img src="/images/icon-all-bat.svg" alt="Allrounder" width={size} height={size} />);
  }
  if (c.includes('wicket') || c.includes('keeper') || c === 'wk') return (<img src="/images/icon-wk.svg" alt="Wicketkeeper" width={size} height={size} />);
  if (c.includes('bowler') || c === 'bowl') return (<img src="/images/icon-ball.svg" alt="Bowler" width={size} height={size} />);
  if (c.includes('bats') || c.includes('bat')) return (<img src="/images/icon-bat.svg" alt="Batsman" width={size} height={size} />);
  return (<img src="/images/icon-bat.svg" alt="Player" width={size} height={size} />);
}


