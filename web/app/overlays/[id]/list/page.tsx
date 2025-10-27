'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import OverlayFrame from '../../../../components/OverlayFrame';

type Row = {
  id: string;
  name: string;
  category: string | null;
  status: 'available' | 'sold' | 'unsold';
  set_id: string | null;
  set_name?: string;
  team_name?: string | null;
  price?: number | null;
  photo_url?: string | null;
};

export default function PlayersListOverlayPage() {
  const params = useParams();
  const search = useSearchParams();
  const auctionId = params?.id as string;
  const scopeTab = (search?.get('tab') || 'current') as 'current' | 'available' | 'sold' | 'unsold' | 'all';

  const [rows, setRows] = useState<Row[]>([]);
  const [setsMap, setSetsMap] = useState<Record<string, string>>({});
  const [scopeLabel, setScopeLabel] = useState<string>('Players');

  async function loadAll() {
    const [{ data: auction }, { data: sets }, { data: available }, { data: unsold }, { data: sold }] = await Promise.all([
      supabase.from('auctions').select('queue_scope,current_set_id').eq('id', auctionId).maybeSingle(),
      supabase.from('auction_sets').select('id,name').eq('auction_id', auctionId),
      supabase
        .from('auction_players')
        .select('id,name,category,status,set_id,photo_path,photo_url')
        .eq('auction_id', auctionId)
        .eq('status', 'available'),
      supabase
        .from('auction_players')
        .select('id,name,category,status,set_id,photo_path,photo_url')
        .eq('auction_id', auctionId)
        .eq('status', 'unsold'),
      supabase
        .from('assignments')
        .select('price, players:auction_players(id,name,category,set_id,photo_path,photo_url), team:teams(name)')
        .eq('auction_id', auctionId)
    ]);
    const sm: Record<string, string> = {};
    (sets as any[])?.forEach((s: any) => { sm[s.id] = s.name; });
    setSetsMap(sm);
    const av = ((available as any[]) || []).map((p: any) => ({
      id: p.id, name: p.name, category: p.category, status: 'available', set_id: p.set_id,
      photo_url: p.photo_path ? supabase.storage.from('player-photos').getPublicUrl(p.photo_path).data.publicUrl : (p.photo_url || null)
    } as Row));
    const un = ((unsold as any[]) || []).map((p: any) => ({
      id: p.id, name: p.name, category: p.category, status: 'unsold', set_id: p.set_id,
      photo_url: p.photo_path ? supabase.storage.from('player-photos').getPublicUrl(p.photo_path).data.publicUrl : (p.photo_url || null)
    } as Row));
    const so = ((sold as any[]) || []).map((r: any) => ({
      id: r.players?.id, name: r.players?.name, category: r.players?.category, status: 'sold', set_id: r.players?.set_id,
      team_name: r.team?.name || null, price: r.price ?? null,
      photo_url: r.players?.photo_path ? supabase.storage.from('player-photos').getPublicUrl(r.players.photo_path).data.publicUrl : (r.players?.photo_url || null)
    } as Row));
    const currentScope = (auction as any)?.queue_scope || 'default';
    const currentSetId = (auction as any)?.current_set_id || null;
    // Filter sold by scope set if applicable
    let soldScoped = so;
    if (currentScope === 'set' && currentSetId) soldScoped = so.filter(r => r.set_id === currentSetId);
    const merged = [...av, ...un, ...soldScoped].map(r => ({ ...r, set_name: r.set_id ? sm[r.set_id] : undefined }));
    setRows(merged);
    // Set scope label for header
    let label = 'All (Default)';
    if (currentScope === 'unsold') label = 'Unsold';
    if (currentScope === 'set' && currentSetId) label = sm[currentSetId] || 'By Set';
    setScopeLabel(label);
  }

  useEffect(() => { loadAll(); }, [auctionId]);
  useEffect(() => {
    const ch = supabase
      .channel(`overlay-list-${auctionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_players', filter: `auction_id=eq.${auctionId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `auction_id=eq.${auctionId}` }, () => loadAll())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [auctionId]);

  const display = useMemo(() => {
    let arr = rows.slice();
    // Filter by tab if specified
    if (scopeTab !== 'all' && scopeTab !== 'current') arr = arr.filter(r => r.status === scopeTab);
    // Sort: available first then sold/unsold, by name within groups
    const weight = (s: string) => (s === 'available' ? 0 : 1);
    arr.sort((a, b) => {
      const wa = weight(a.status);
      const wb = weight(b.status);
      if (wa !== wb) return wa - wb;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    return arr;
  }, [rows, scopeTab]);

  return (
    <OverlayFrame safeArea={24} chroma className="w-screen h-screen">
      <div className="flex h-full w-full items-center justify-center">
        <div className="w-full max-w-2xl bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden border-2 border-white max-h-[90vh] flex flex-col">
          <div className="px-6 py-4 flex items-center justify-between bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 opacity-100">
            <div className="text-lg font-extrabold tracking-tight text-white">{scopeLabel}</div>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/auction-central-3d-03.jpg" alt="Auction Central" className="h-7 w-7 rounded-full object-cover ring-1 ring-gray-200 bg-white" />
              <div className="leading-tight text-right">
                <div className="text-xs font-bold text-white">Auction Central</div>
                <div className="text-[10px] text-gray-200 -mt-0.5">Sponsored by UCL</div>
              </div>
            </div>
          </div>
          <div className="px-0 pb-3">
           
            <div className="h-1 rounded-full bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 opacity-100 shadow-[0_4px_8px_0_rgba(128,0,128,0.w5)]" />
          </div>
          <div className="px-6 pb-5 flex-1 min-h-0 overflow-auto">
            <ul className="divide-y divide-gray-100">
              {display.map((p, idx) => {
                const isDim = p.status !== 'available';
                return (
                  <li key={p.id} className={`grid grid-cols-[auto_1fr] gap-4 items-center py-3 ${isDim ? 'opacity-65' : ''}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-700 text-[10px] font-semibold border border-gray-200">{idx + 1}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p.photo_url ? (
                        <img src={p.photo_url} alt={p.name} className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-gray-400">person</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="text-base font-semibold text-gray-800 truncate max-w-[20ch]">{p.name}</div>
                        {renderCategoryIcon(p.category || undefined, 16)}
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${p.status === 'available' ? 'bg-sky-50 text-sky-700 border-sky-200' : p.status === 'sold' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                          {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                        </span>
                        {p.status === 'sold' && (
                          <>
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border bg-gray-50 text-gray-700 border-gray-200 truncate max-w-[16ch]" title={p.team_name || ''}>{p.team_name || ''}</span>
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold border bg-gray-50 text-gray-700 border-gray-200">{fmtCurrency(p.price)}</span>
                          </>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate max-w-[42ch]">{p.set_name || ''}</div>
                    </div>
                  </li>
                );
              })}
              {display.length === 0 && (
                <li className="py-10 text-center text-sm text-gray-500">No players found.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </OverlayFrame>
  );
}

function fmtCurrency(n: number | null | undefined) {
  if (n === null || n === undefined) return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function renderCategoryIcon(cat?: string, size = 16) {
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


