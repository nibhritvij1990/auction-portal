'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import OverlayFrame from '../../../../components/OverlayFrame';

type EventRow = { id: string; created_at: string; type: string; payload: any };

export default function TickerOverlayPage() {
  const params = useParams();
  const search = useSearchParams();
  const auctionId = params?.id as string;

  const speed = Math.max(5, Number(search?.get('speed') || 18)); // seconds per full cycle
  const maxItems = Math.min(50, Math.max(3, Number(search?.get('max') || 20)));

  const [events, setEvents] = useState<EventRow[]>([]);

  async function loadRecent() {
    const { data } = await supabase
      .from('auction_events')
      .select('id,created_at,type,payload')
      .eq('auction_id', auctionId)
      .order('created_at', { ascending: false })
      .limit(maxItems);
    const filtered = (((data as any[]) || []).filter((e: any) => e?.type === 'player_sold' || e?.type === 'player_unsold')) as any[];
    // Hydrate missing names if needed
    const needPlayerIds = new Set<string>();
    const needTeamIds = new Set<string>();
    for (const ev of filtered) {
      const pid = ev?.payload?.player_id;
      const pname = ev?.payload?.player_name;
      if (pid && !pname) needPlayerIds.add(String(pid));
      if (ev?.type === 'player_sold') {
        const tid = ev?.payload?.team_id;
        const tname = ev?.payload?.team_name;
        if (tid && !tname) needTeamIds.add(String(tid));
      }
    }
    let playerMap: Record<string, string> = {};
    let teamMap: Record<string, string> = {};
    if (needPlayerIds.size > 0) {
      const { data: pl } = await supabase.from('auction_players').select('id,name').in('id', Array.from(needPlayerIds));
      (pl as any[])?.forEach((r: any) => { if (r?.id) playerMap[String(r.id)] = r?.name || ''; });
    }
    if (needTeamIds.size > 0) {
      const { data: tm } = await supabase.from('teams').select('id,name').in('id', Array.from(needTeamIds));
      (tm as any[])?.forEach((r: any) => { if (r?.id) teamMap[String(r.id)] = r?.name || ''; });
    }
    const hydrated = filtered.map((ev: any) => {
      const p = { ...(ev?.payload || {}) };
      if (p.player_id && !p.player_name && playerMap[p.player_id]) p.player_name = playerMap[p.player_id];
      if (ev?.type === 'player_sold' && p.team_id && !p.team_name && teamMap[p.team_id]) p.team_name = teamMap[p.team_id];
      return { ...ev, payload: p };
    });
    setEvents(hydrated.reverse());
  }

  useEffect(() => { loadRecent(); }, [auctionId, maxItems]);
  useEffect(() => {
    const ch = supabase
      .channel(`overlay-ticker-${auctionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'auction_events', filter: `auction_id=eq.${auctionId}` }, () => loadRecent())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [auctionId]);

  const nodes = useMemo(() => {
    return events.map((e, i) => <TickerItem key={e.id || i} ev={e} />);
  }, [events]);

  return (
    <OverlayFrame safeArea={0} chroma className="w-screen h-screen">
      <div className="relative w-full h-full flex items-start">
        <div className="relative w-full overflow-hidden bg-white/80 backdrop-blur-sm shadow-lg">
          <div className="flex animate-[none]">
            <div className="flex items-center gap-3 px-4 py-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/auction-central-3d-03.jpg" alt="Auction Central" className="h-8 w-8 rounded-full object-cover ring-1 ring-gray-200 bg-white" />
              <div className="leading-tight">
                <div className="text-sm font-bold text-gray-800">Auction Central</div>
                <div className="-mt-0.5 text-[10px] text-gray-500">Sponsored by UCL</div>
              </div>
            </div>
            <div className="relative flex-1 overflow-hidden">
              <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-white to-white/0 z-10" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-white to-white/0 z-10" />
              <TickerMarquee speedSec={speed}>{nodes}</TickerMarquee>
            </div>
          </div>
        </div>
      </div>
    </OverlayFrame>
  );
}

function TickerMarquee({ children, speedSec }: { children: React.ReactNode; speedSec: number }) {
  const duration = `${speedSec}s`;
  return (
    <div className="relative w-full py-2">
      <div className="flex animate-[marquee_linear_infinite]" style={{ animationDuration: duration }}>
        <div className="flex w-[200%] items-center">
          <div className="flex-shrink-0 flex items-center space-x-8 p-3 w-max">{children}</div>
          <div className="flex-shrink-0 flex items-center space-x-8 p-3 w-max">{children}</div>
        </div>
      </div>
      <style jsx>{`
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .animate-[marquee_linear_infinite] { animation-name: marquee; animation-timing-function: linear; animation-iteration-count: infinite; }
      `}</style>
    </div>
  );
}

function TickerItem({ ev }: { ev: any }) {
  const t = String(ev?.type || '');
  const isSold = t === 'player_sold';
  const name = String(ev?.payload?.player_name || ev?.payload?.player_id || '—');
  return (
    <>
      <div className="flex items-center space-x-6 text-lg">
        <span className="font-semibold text-gray-700">{name}</span>
        <span className="material-symbols-outlined text-gray-400">arrow_forward</span>
        {isSold ? (
          <>
            <span className="font-bold text-pink-600">{String(ev?.payload?.team_name || '—')}</span>
            <span className="font-bold text-gray-800">{fmtCurrency(ev?.payload?.amount ?? null)}</span>
          </>
        ) : (
          <span className="font-bold text-gray-800">Unsold</span>
        )}
      </div>
      <span className="h-7 w-1 bg-gray-300/80" />
    </>
  );
}

// filter handled at fetch; other events omitted

function nameOrId(name?: string | null, id?: string | null) {
  return name || id || '—';
}

function fmtCurrency(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}


