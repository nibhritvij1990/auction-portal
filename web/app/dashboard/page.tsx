'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthReady } from '../../lib/useAuthReady';

type AuctionRow = {
  id: string;
  name: string;
  status: string;
  auction_date: string | null;
  base_price: number | null;
  total_purse: number | null;
  max_players_per_team: number | null;
};

export default function DashboardPage() {
  const router = useRouter();
  const { ready, session } = useAuthReady();
  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [teamCounts, setTeamCounts] = useState<Record<string, number>>({});
  const [titleSponsors, setTitleSponsors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [role, setRole] = useState<string>('viewer');

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      setLoading(true);
      // fetch role for RBAC UI guards
      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (isMounted && p?.role) setRole(p.role);
      const { data, error } = await supabase
        .from('auctions')
        .select('id,name,status,auction_date,base_price,total_purse,max_players_per_team')
        .order('created_at', { ascending: false });
      if (!isMounted) return;
      const rows = (error ? [] : data ?? []) as AuctionRow[];
      setAuctions(rows);
      // team counts in one query via view
      const { data: countsRows } = await supabase.from('v_auction_team_counts').select('auction_id, teams_count');
      const counts: Record<string, number> = {};
      (countsRows ?? []).forEach((r: any) => { counts[r.auction_id] = r.teams_count ?? 0; });
      if (!isMounted) return;
      setTeamCounts(counts);
      // title sponsors
      const { data: ts } = await supabase
        .from('auction_sponsors')
        .select('auction_id,name,sponsor_type,ord')
        .in('auction_id', rows.map(r => r.id))
        .eq('sponsor_type', 'title')
        .order('ord', { ascending: true });
      const tsMap: Record<string, string> = {};
      (ts ?? []).forEach((r: any) => { if (!tsMap[r.auction_id]) tsMap[r.auction_id] = r.name; });
      setTitleSponsors(tsMap);
      setLoading(false);
    }
    load();
    return () => { isMounted = false; };
  }, [ready, session, router]);

  async function handleDelete(id: string) {
    if (deletingId) return;
    const ok = confirm('Delete this auction? This cannot be undone.');
    if (!ok) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from('auctions').delete().eq('id', id);
      if (error) throw error;
      setAuctions(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      alert((e as any)?.message || 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  function statusClass(raw: string | null | undefined) {
    const s = String(raw || '').toLowerCase();
    if (s === 'open' || s === 'active' || s === 'live' || s === 'in_progress' || s === 'running') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (s === 'paused' || s === 'pending' || s === 'scheduled') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (s === 'closed' || s === 'completed' || s === 'ended') return 'bg-rose-50 text-rose-700 border-rose-200';
    return 'bg-gray-50 text-gray-700 border-gray-200';
  }

  return (
    <div className="text-white" style={{ fontFamily: 'Spline Sans, Noto Sans, sans-serif', backgroundColor: '#110f22', height: 'calc(100vh - 79px)' }}>
      <div className="flex h-full overflow-hidden">
        <main className="flex-1 m-2 overflow-hidden min-h-0" style={{ borderRadius: '16px', backgroundColor: 'rgb(249 250 251 / var(--tw-bg-opacity, 1))', zIndex: 1 }}>
          <div className="container mx-auto w-full max-w-full px-4 sm:px-6 lg:px-8 overflow-auto h-full p-6">
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-4xl font-bold tracking-tight text-gray-900">Auctions Dashboard</h2>
          <Link href="/dashboard/new-auction" className="flex items-center justify-center gap-2 rounded-full bg-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-600">
            <span className="material-symbols-outlined">add</span>
            <span>Create New Auction</span>
          </Link>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-md">
          <table className="w-full min-w-full divide-y divide-gray-200" style={{ maxWidth: '90vw' }}>
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Auction Name</th>
                <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Teams</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Base Price</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Purse</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Players per Team</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading && (
                <tr>
                  <td className="px-6 py-6 text-sm text-gray-500" colSpan={8}>Loading…</td>
                </tr>
              )}
              {!loading && auctions.map(a => (
                <tr key={a.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                        <span className="material-symbols-outlined text-gray-500">emoji_events</span>
                      </div>
                      <span className="flex flex-col min-w-0">
                        <span className="truncate max-w-[48ch]" title={a.name}>{a.name}</span>
                        {titleSponsors[a.id] && (<span className="text-xs font-normal text-gray-500 truncate max-w-[48ch]" title={titleSponsors[a.id]}>{titleSponsors[a.id]}</span>)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border capitalize ${statusClass(a.status)}`}>{a.status}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{a.auction_date ?? '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">{teamCounts[a.id] ?? 0}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">{formatCurrency(a.base_price)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">{formatCurrency(a.total_purse)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">{a.max_players_per_team ?? 0}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <Link href={`/dashboard/${a.id}/teams`} className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-gray-100" title="Manage"><span className="material-symbols-outlined text-gray-600">settings</span></Link>
                    <Link href={`/dashboard/${a.id}/console`} className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-gray-100" title="Console"><span className="material-symbols-outlined text-gray-600">monitor</span></Link>
                    <Link href={`/dashboard/${a.id}/summary`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-gray-100" title="Summary"><span className="material-symbols-outlined text-gray-600">summarize</span></Link>
                    <Link href={`/dashboard/${a.id}/edit`} className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-gray-100" title="Edit"><span className="material-symbols-outlined text-gray-600">edit</span></Link>
                    {(role === 'admin' || role === 'auctioneer') && (
                      <button onClick={() => handleDelete(a.id)} disabled={deletingId === a.id} className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-red-50 disabled:opacity-50" title="Delete">
                        <span className="material-symbols-outlined text-red-600">delete</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && auctions.length === 0 && (
                <tr>
                  <td className="px-6 py-6 text-sm text-gray-500" colSpan={8}>No auctions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function formatCurrency(n: number | null | undefined) {
  if (!n) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
} 