'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import OverlayFrame from '../../../../components/OverlayFrame';

type TeamRow = { id: string; name: string; logo_path?: string | null; logo_url?: string | null; max_players?: number | null };
type AggRow = { team_id: string; purse_remaining: number; players_count: number };
type CompItem = { team_id: string; player_name: string; player_category: string | null; price: number };

export default function TeamsOverlayPage() {
  const params = useParams();
  const auctionId = params?.id as string;

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [aggMap, setAggMap] = useState<Record<string, AggRow>>({});
  const [compMap, setCompMap] = useState<Record<string, CompItem[]>>({});
  const [auctionMaxPlayers, setAuctionMaxPlayers] = useState<number | null>(null);

  async function loadAll() {
    const [{ data: t }, { data: ag }, { data: a }, { data: asg }, { data: sets }] = await Promise.all([
      supabase.from('teams').select('id,name,max_players,logo_path,logo_url').eq('auction_id', auctionId).order('name', { ascending: true }),
      supabase.from('v_team_aggregates').select('team_id,purse_remaining,players_count').eq('auction_id', auctionId),
      supabase.from('auctions').select('max_players_per_team').eq('id', auctionId).maybeSingle(),
      supabase
        .from('assignments')
        .select('team_id, price, players:auction_players(name, category)')
        .eq('auction_id', auctionId)
        .order('created_at', { ascending: true }),
      supabase.from('auction_sets').select('id,name').eq('auction_id', auctionId), // placeholder if needed later
    ]);
    setTeams((t as any[]) || []);
    const map: Record<string, AggRow> = {};
    (ag as any[])?.forEach((r: any) => { map[r.team_id] = { team_id: r.team_id, purse_remaining: Number(r.purse_remaining || 0), players_count: Number(r.players_count || 0) }; });
    setAggMap(map);
    setAuctionMaxPlayers((a as any)?.max_players_per_team ?? null);
    const cMap: Record<string, CompItem[]> = {};
    (asg as any[])?.forEach((r: any) => {
      const tid = String(r.team_id);
      if (!cMap[tid]) cMap[tid] = [];
      cMap[tid].push({ team_id: tid, player_name: r.players?.name || '', player_category: r.players?.category || null, price: Number(r.price || 0) });
    });
    setCompMap(cMap);
  }

  useEffect(() => { loadAll(); }, [auctionId]);
  useEffect(() => {
    let cancelled = false;
    let channel = subscribe();

    function subscribe() {
      const ch = supabase
        .channel(`overlay-teams-${auctionId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `auction_id=eq.${auctionId}` }, () => loadAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `auction_id=eq.${auctionId}` }, () => loadAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions', filter: `id=eq.${auctionId}` }, () => loadAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_players', filter: `auction_id=eq.${auctionId}` }, () => loadAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'bids', filter: `auction_id=eq.${auctionId}` }, () => loadAll())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_events', filter: `auction_id=eq.${auctionId}` }, () => loadAll())
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            loadAll();
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
    <OverlayFrame safeArea={24} chroma className="">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 p-2">
        {teams.map((t) => (
          <TeamCard
            key={t.id}
            team={t}
            agg={aggMap[t.id] || { team_id: t.id, purse_remaining: 0, players_count: 0 }}
            comp={compMap[t.id] || []}
            auctionMaxPlayers={auctionMaxPlayers}
          />
        ))}
      </div>
    </OverlayFrame>
  );
}

function TeamCard({ team, agg, comp, auctionMaxPlayers }: { team: TeamRow; agg: AggRow; comp: CompItem[]; auctionMaxPlayers: number | null }) {
  const logoUrl = useMemo(() => {
    if (team.logo_path) return supabase.storage.from('team-logos').getPublicUrl(team.logo_path).data.publicUrl;
    return team.logo_url || '';
  }, [team.logo_path, team.logo_url]);

  const maxPlayers = (team.max_players ?? null) !== null ? Number(team.max_players) : (auctionMaxPlayers ?? null);
  const acquired = Number(agg.players_count || 0);
  const slots: ('player' | 'empty')[] = useMemo(() => {
    const res: ('player' | 'empty')[] = [];
    for (let i = 0; i < acquired; i++) res.push('player');
    if (maxPlayers !== null) {
      for (let i = acquired; i < maxPlayers; i++) res.push('empty');
    }
    return res;
  }, [acquired, maxPlayers]);

  return (
    <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-2xl p-6 border-t-4 border-pink-500 w-full max-w-md mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl ? <img src={logoUrl} alt={team.name} className="h-10 w-10 rounded-full object-contain ring-1 ring-gray-200 bg-white" /> : <span className="material-symbols-outlined text-gray-400">groups</span>}
          <h2 className="text-2xl font-bold text-gray-800">{team.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/auction-central-3d-03.jpg" alt="Auction Central" className="h-7 w-7 rounded-full object-cover ring-1 ring-gray-200 bg-white" />
          <div className="leading-tight text-right">
            <div className="text-xs font-bold text-gray-800">Auction Central</div>
            <div className="-mt-0.5 text-[10px] text-gray-500">Sponsored by UCL</div>
          </div>
        </div>
      </div>
      <div className="mb-6">
        <p className="text-sm text-gray-500 uppercase tracking-wider">Remaining Purse</p>
        <p className="text-5xl font-extrabold text-purple-600 tracking-tight">{fmtCurrency(agg.purse_remaining)}</p>
      </div>
      <div>
        <div className="space-y-3">
          {comp.map((r, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
              <div className="flex items-center space-x-3">
                {renderCategoryIcon(r.player_category, 18)}
                <span className="font-medium text-gray-800">{r.player_name}</span>
              </div>
              <span className="text-lg font-semibold text-gray-600">{fmtCurrency(r.price)}</span>
            </div>
          ))}
          {slots.slice(acquired).map((_, i) => (
            <div key={`empty-${i}`} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
              <div className="flex items-center space-x-3">
                <span className="material-symbols-outlined text-gray-400">person</span>
                <span className="font-medium text-gray-400 italic">Slot Available</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function renderCategoryIcon(cat?: string | null, size = 16) {
  const c = String(cat || '').toLowerCase();
  if (c.includes('all') && (c.includes('round') || c.includes('ar'))) {
    if (c.includes('bowl')) return (<img src="/images/icon-all-ball.svg" alt="AR" width={size} height={size} />);
    if (c.includes('bat')) return (<img src="/images/icon-all-bat.svg" alt="AR" width={size} height={size} />);
    return (<img src="/images/icon-all-bat.svg" alt="AR" width={size} height={size} />);
  }
  if (c.includes('wicket') || c.includes('keeper') || c === 'wk') return (<img src="/images/icon-wk.svg" alt="WK" width={size} height={size} />);
  if (c.includes('bowler') || c === 'bowl') return (<img src="/images/icon-ball.svg" alt="Bowl" width={size} height={size} />);
  if (c.includes('bats') || c.includes('bat')) return (<img src="/images/icon-bat.svg" alt="Bat" width={size} height={size} />);
  return (<img src="/images/icon-bat.svg" alt="Player" width={size} height={size} />);
}

function fmtCurrency(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}


