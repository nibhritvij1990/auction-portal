'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../lib/useAuthReady';

type Rule = {
  id: string;
  threshold: number;
  increment: number;
};

export default function RulesPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const { ready, session } = useAuthReady();

  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>('User');
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [auctionsList, setAuctionsList] = useState<{ id: string; name: string }[]>([]);
  const [selectedAuctionId, setSelectedAuctionId] = useState<string>(auctionId);

  // New rule form state
  const [threshold, setThreshold] = useState<number | ''>('');
  const [increment, setIncrement] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!ready) return;
      if (!session?.user) return;
      const { data } = await supabase.from('auctions').select('id,name').order('created_at', { ascending: false });
      if (!mounted) return;
      setAuctionsList((data as any[]) ?? []);
      setSelectedAuctionId(auctionId);
    })();
    return () => { mounted = false; };
  }, [ready, session, auctionId]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (p && mounted) setRole(p.role || 'User');
      setLoading(true);
      const { data, error } = await supabase
        .from('increment_rules')
        .select('id,threshold,increment')
        .eq('auction_id', auctionId)
        .order('threshold', { ascending: true });
      if (!mounted) return;
      setRules(error ? [] : (data as Rule[]) ?? []);
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, [ready, session, auctionId, router]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('increment_rules')
        .insert({ auction_id: auctionId, threshold: toNum(threshold), increment: toNum(increment) });
      if (error) throw error;
      setThreshold('');
      setIncrement('');
      // refresh
      const { data } = await supabase
        .from('increment_rules')
        .select('id,threshold,increment')
        .eq('auction_id', auctionId)
        .order('threshold', { ascending: true });
      setRules((data as Rule[]) ?? []);
    } catch (err: any) {
      setError(err.message || 'Failed to add rule');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const ok = confirm('Delete this rule?');
    if (!ok) return;
    const { error } = await supabase.from('increment_rules').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    setRules(prev => prev.filter(r => r.id !== id));
  }

  const userEmail = session?.user?.email ?? '';
  const displayEmail = userEmail ? userEmail.split('@')[0] : '';
  const [overlaysOpen, setOverlaysOpen] = useState<boolean>(false);
  const overlaysAnchorRef = useRef<HTMLDivElement | null>(null);
  const overlaysMenuRef = useRef<HTMLDivElement | null>(null);
  const [overlaysPos, setOverlaysPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    function updatePos() {
      if (!overlaysOpen) return;
      const el = overlaysAnchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setOverlaysPos({ top: Math.max(8, rect.top), left: rect.right + 8 });
    }
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [overlaysOpen]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!overlaysOpen) return;
      const a = overlaysAnchorRef.current;
      const m = overlaysMenuRef.current;
      const target = e.target as Node;
      if (a && a.contains(target)) return;
      if (m && m.contains(target)) return;
      setOverlaysOpen(false);
    }
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, [overlaysOpen]);

  return (
    <div className="h-screen text-white" style={{ fontFamily: 'Spline Sans, Noto Sans, sans-serif', backgroundColor: '#110f22' }}>
      <div className="flex h-full overflow-visible">
        <div className="absolute -left-[200px] -bottom-[0px] h-[600px] w-[600px] rounded-full blur-[100px] will-change-[filter] [transform:translateZ(0)]" style={{ background: 'radial-gradient(circle, rgb(134 0 255 / 1) 0%, transparent 70%)' }}>
          <div className="h-[400px] w-[400px] bg-brand-700"></div>
        </div>
        <aside className="sticky top-0 h-screen overflow-y-auto shrink-0 w-80 bg-transparent px-4 py-6 flex flex-col justify-between z-[2147483647]">
          <div>
            <div className="flex items-center gap-3 mb-10">
              <img className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200 bg-white" src="/images/auction-central-3d-03.jpg" />
              <div className="flex flex-col">
                <h1 className="text-white text-xl font-bold leading-tight">Auction Central</h1>
                <p className="text-sm text-gray-500">Sponsored by UCL</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-xs font-semibold text-white">Auction</label>
              <select
                className="w-full rounded-lg border border-gray-600 bg-gray-400 text-black px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-pink-500"
                value={selectedAuctionId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedAuctionId(val);
                  router.replace(`/dashboard/${val}/rules`);
                }}
              >
                {auctionsList.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <hr className="mb-4 border-gray-200" />
            <nav className="flex flex-col gap-2" id="main-nav">
              <Link href={`/dashboard/${auctionId}/teams`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-white hover:bg-gray-400 hover:text-black">
                <span className="material-symbols-outlined">groups</span>
                <span>Teams</span>
              </Link>
              <Link href={`/dashboard/${auctionId}/players`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-white hover:bg-gray-400 hover:text-black">
                <span className="material-symbols-outlined">person</span>
                <span>Players</span>
              </Link>
              <Link href={`/dashboard/${auctionId}/rules`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-pink-50 text-pink-600">
                <span className="material-symbols-outlined">gavel</span>
                <span className="font-semibold">Bid Rules</span>
              </Link>
              <Link href={`/dashboard/${auctionId}/sponsors`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-white hover:bg-gray-400 hover:text-black">
                <span className="material-symbols-outlined">handshake</span>
                <span>Sponsors</span>
              </Link>
              <hr className="my-4 border-gray-200" />
              <Link href={`/dashboard/${auctionId}/console`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-white hover:bg-gray-400 hover:text-black">
                <span className="material-symbols-outlined">live_tv</span>
                <span>Live Auction Console</span>
              </Link>
              <Link href={`/dashboard/${auctionId}/summary`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-white hover:bg-gray-400 hover:text-black">
                <span className="material-symbols-outlined">insights</span>
                <span>Summary</span>
              </Link>
              <div ref={overlaysAnchorRef}>
                <button type="button" onClick={() => setOverlaysOpen(s => !s)} className={`flex items-center justify-between px-4 py-2.5 rounded-lg text-white w-full ${overlaysOpen ? 'bg-gray-400 text-black' : 'hover:bg-gray-400 hover:text-black'}`}>
                  <span className="flex items-center gap-3">
                    <span className="material-symbols-outlined">movie_filter</span>
                    <span>Tickers/Overlays</span>
                  </span>
                  <span className="material-symbols-outlined text-sm">{overlaysOpen ? 'chevron_left' : 'chevron_right'}</span>
                </button>
                {overlaysOpen && overlaysPos && createPortal(
                  <div ref={overlaysMenuRef} className="w-56 rounded-md bg-white py-2 text-sm shadow-lg ring-1 ring-black ring-opacity-5" style={{ position: 'fixed', top: overlaysPos.top, left: overlaysPos.left, zIndex: 2147483647 }}>
                    <Link href={`/overlays/${auctionId}/player`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Player Overlay</Link>
                    <Link href={`/overlays/${auctionId}/player-list`} target ="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Player + List Overlay</Link>
                    <Link href={`/overlays/${auctionId}/list`} target ="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Players List Overlay</Link>
                    <Link href={`/overlays/${auctionId}/ticker`} target ="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Ticker Overlay</Link>
                    <Link href={`/overlays/${auctionId}/teams`} target ="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Teams Overlay</Link>
                  </div>, document.body)
                }
              </div>
            </nav>
          </div>
          <div ref={profileRef} className="relative">
            <button onClick={() => setProfileOpen(s => !s)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 text-left  text-white hover:text-black">
              <div className="size-10 rounded-full bg-center bg-cover bg-no-repeat" style={{ backgroundImage: 'url(https://lh3.googleusercontent.com/aida-public/AB6AXuCkBaw0NP9vVQvXoio8OnkXr77KrzC_fbJWwzi6VZ61DM6m8HxpCjULjESPM-3SbdaLrAnKnS97J7WiQSrjXhvCTAXTm-ST0lNXRE_J5P8ZNDHHCP4UY1A6lzcsePkOLoAwP7KbxEcFul1kEXgDzmQskgxqEuJz455sHU-GB9d_3QuK82DMeaba4QA4y2IU16b7v0E6VOSqCj06cnETsGUnXZsBq7vQMiP4EAKavjeHTnTPHuNnsaC20XheVKeBqgn64ClOY8sQVs0)' }} />
              <div className="min-w-0">
                <p className="font-semibold truncate max-w-[18ch]">{displayEmail}</p>
                <p className="text-sm text-gray-500">{role}</p>
              </div>
            </button>
            {profileOpen && (
              <div className="absolute left-0 ml-2 bottom-[110%] w-56 rounded-md bg-white py-2 text-sm shadow-lg ring-1 ring-black ring-opacity-5 z-10">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="font-medium text-gray-900 truncate" title={userEmail}>{userEmail}</p>
                  <p className="text-xs text-gray-500">Role: {role}</p>
                </div>
                <button onClick={async () => { await supabase.auth.signOut(); setProfileOpen(false); router.replace('/auth/sign-in'); }} className="block w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100">Sign out</button>
              </div>
            )}
          </div>
        </aside>
        <main className="flex-1 p-6 m-2 overflow-y-auto min-h-0 relative" style={{ borderRadius: '16px', backgroundColor: 'rgb(249 250 251 / var(--tw-bg-opacity, 1))', zIndex: 1 }}>
          <div className="w-full">
            <header className="mb-8">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-4xl font-bold text-gray-900">Auction Management Console</h1>
                  <p className="mt-2 text-gray-500">Manage teams, players and bid rules for your auction.</p>
                </div>
                <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg border border-pink-50 px-4 py-2 text-sm text-pink-600 bg-pink-50 hover:bg-pink-100">
                  <span className="material-symbols-outlined">arrow_back</span>
                  <span>Back to Dashboard</span>
                </Link>
              </div>
            </header>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-3xl font-bold tracking-tight text-gray-900">Bid Rules</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-6">
                  {loading && (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading…</div>
                  )}
                  {!loading && rules.map(r => (
                    <div key={r.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
                      <div>
                        <p className="font-medium text-gray-800">Increment: <span className="text-purple-600">{fmtCurrency(r.increment)}</span></p>
                        <p className="text-sm text-gray-500">Up to a bid of: {fmtCurrency(r.threshold)}</p>
                      </div>
                      {(role === 'admin' || role === 'auctioneer') && (
                        <div className="flex items-center gap-2">
                          <Link href={`/dashboard/${auctionId}/rules/${r.id}/edit`} className="p-2 rounded-full hover:bg-gray-200" title="Edit"><span className="material-symbols-outlined text-gray-600">edit</span></Link>
                          <button onClick={() => handleDelete(r.id)} className="p-2 rounded-full hover:bg-red-100" title="Delete"><span className="material-symbols-outlined text-red-600">delete</span></button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!loading && rules.length === 0 && (
                    <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">No rules yet.</div>
                  )}
                </div>
              </div>
              {(role === 'admin' || role === 'auctioneer') && (
                <div className="lg:mt-[60px]">
                  <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
                    <h3 className="text-xl font-bold text-gray-900 mb-6">Add New Rule</h3>
                    <form onSubmit={handleAdd} className="space-y-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Increment Amount (USD)</label>
                        <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={increment} onChange={e => setIncrement(numOrEmpty(e.target.value))} required />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Up To Threshold (USD)</label>
                        <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={threshold} onChange={e => setThreshold(numOrEmpty(e.target.value))} required />
                      </div>
                      {error && <p className="text-sm text-red-600">{error}</p>}
                      <button disabled={saving} className="w-full rounded-lg bg-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-700 disabled:opacity-50">{saving ? 'Adding…' : 'Add Rule'}</button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function numOrEmpty(v: string) { return v === '' ? '' : Number(v); }
function toNum(v: number | '') { return v === '' ? null : v; }
function fmtCurrency(n: number | null | undefined) {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
} 