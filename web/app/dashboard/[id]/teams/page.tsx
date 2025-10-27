'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../lib/useAuthReady';
import LiquidGlassCard from '../../../../components/LiquidGlassCard';

type Team = {
  id: string;
  name: string;
  purse_total: number | null;
  max_players: number | null;
};

type Aggregates = Record<string, { players: number; spent: number }>;

export default function TeamsPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const { ready, session } = useAuthReady();
  const [teams, setTeams] = useState<Team[]>([]);
  const [aggs, setAggs] = useState<Aggregates>({});
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [role, setRole] = useState<string>('User');
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [auctionsList, setAuctionsList] = useState<{ id: string; name: string }[]>([]);
  const [selectedAuctionId, setSelectedAuctionId] = useState<string>(auctionId);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      // profile
      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (p && mounted) setRole(p.role || 'User');
      setLoading(true);
      const [{ data: teamRows, error: teamErr }, { data: assignRows }] = await Promise.all([
        supabase.from('teams').select('id,name,purse_total,max_players,logo_path,logo_url').eq('auction_id', auctionId).order('created_at', { ascending: false }),
        supabase.from('assignments').select('team_id, price').eq('auction_id', auctionId),
      ]);
      if (!mounted) return;
      if (teamErr) { setTeams([]); setLoading(false); return; }
      setTeams((teamRows as Team[]) ?? []);
      const a: Aggregates = {};
      (assignRows ?? []).forEach((r: any) => {
        if (!a[r.team_id]) a[r.team_id] = { players: 0, spent: 0 };
        a[r.team_id].players += 1;
        a[r.team_id].spent += Number(r.price || 0);
      });
      setAggs(a);
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, [ready, session, auctionId, router]);

  // Load auctions for switcher
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
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, []);

  async function handleDelete(id: string) {
    if (deletingId) return;
    const ok = confirm('Delete this team?');
    if (!ok) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
      setTeams(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      alert((e as any)?.message || 'Failed to delete team');
    } finally {
      setDeletingId(null);
    }
  }

  const userEmail = session?.user?.email ?? '';
  const displayEmail = userEmail ? userEmail.split('@')[0] : '';
  const [overlaysOpen, setOverlaysOpen] = useState<boolean>(false);
  const overlaysAnchorRef = useRef<HTMLDivElement | null>(null);
  const [overlaysPos, setOverlaysPos] = useState<{ top: number; left: number } | null>(null);
  const overlaysMenuRef = useRef<HTMLDivElement | null>(null);

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
      <div className="absolute -left-[200px] -bottom-[0px] h-[600px] w-[600px] rounded-full blur-[100px] will-change-[filter] [transform:translateZ(0)]"
        style={{background:"radial-gradient(circle, rgb(134 0 255 / 1) 0%, transparent 70%)"}}>
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
                  router.replace(`/dashboard/${val}/teams`);
                }}
              >
                {auctionsList.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <hr className="mb-4 border-gray-200" />
            <nav className="flex flex-col gap-2" id="main-nav">
              <Link href={`/dashboard/${auctionId}/teams`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-pink-50 text-pink-600">
                <span className="material-symbols-outlined">groups</span>
                <span className="font-semibold">Teams</span>
              </Link>
              <Link href={`/dashboard/${auctionId}/players`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-white hover:bg-gray-400 hover:text-black">
                <span className="material-symbols-outlined">person</span>
                <span>Players</span>
              </Link>
              <Link href={`/dashboard/${auctionId}/rules`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-white hover:bg-gray-400 hover:text-black">
                <span className="material-symbols-outlined">gavel</span>
                <span>Bid Rules</span>
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
                    <Link href={`/overlays/${auctionId}/player-list`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Player + List Overlay</Link>
                    <Link href={`/overlays/${auctionId}/list`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Players List Overlay</Link>
                    <Link href={`/overlays/${auctionId}/ticker`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Ticker Overlay</Link>
                    <Link href={`/overlays/${auctionId}/teams`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Teams Overlay</Link>
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
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">Teams</h2>
              {(role === 'admin' || role === 'auctioneer') && (
                <Link href={`/dashboard/${auctionId}/teams/new`} className="flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-purple-700">
                  <span className="material-symbols-outlined">add</span>
                  <span>New Team</span>
                </Link>
              )}
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(17.5rem,17.5rem))] justify-start gap-6">
              {loading && (
                <div className="col-span-full rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading…</div>
              )}
              {!loading && teams.map(t => {
                const players = aggs[t.id]?.players ?? 0;
                const spent = aggs[t.id]?.spent ?? 0;
                const balance = (t.purse_total ?? 0) - spent;
                const logo = (t as any).logo_path
                  ? supabase.storage.from('team-logos').getPublicUrl((t as any).logo_path).data.publicUrl
                  : ((t as any).logo_url || '');
                return (
                  <LiquidGlassCard key={t.id} className="rounded-2xl" size="no-size" style={{ padding: '0rem' }}>
                    <div className="relative">
                      {logo && (
                        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                          <style jsx>{`
                            .bg-scroll-animate {
                              position: absolute;
                              top: 0; left: 0; right: 0; bottom: 0;
                              width: 100%;
                              height: 100%;
                              pointer-events: none;
                              z-index: 0;
                              overflow: hidden;
                            }
                            .bg-scroll-animate .scroll-inner {
                              position: absolute;
                              top: 0; left: 0; right: 0;
                              width: 100%;
                              height: 200%;
                              display: flex;
                              flex-direction: column;
                              animation: bgInfiniteScroll 0s linear infinite;
                            }
                            .bg-scroll-animate img {
                              width: 100%;
                              height: 50%;
                              object-fit: cover;
                              opacity: 0.5;
                              filter: blur(2px);
                              display: block;
                              user-select: none;
                              pointer-events: none;
                            }
                            @keyframes bgInfiniteScroll {
                              0% { transform: translateY(0); }
                              100% { transform: translateY(-50%); }
                            }
                          `}</style>
                          <div className="bg-scroll-animate">
                            <div className="scroll-inner" style={{ backgroundColor: 'rgba(0, 0, 255, 0.95)', height: '36%' }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/images/bg-contour.jpg" alt="bg" draggable="false" />
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src="/images/bg-contour.jpg" alt="bg" draggable="false" />
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="relative z-10 flex flex-col p-6">
                        <div className="mx-auto mb-6">
                          <LiquidGlassCard className="p-0" size="no-size" style={{ width: '11rem', height: '11rem'}}>
                            <div className="flex h-full w-full items-center justify-center">
                              <div className="h-[10rem] w-[10rem] flex items-center justify-center overflow-hidden shadow-[0_10px_18px_rgba(0,0,0,0.18),_0_2px_6px_rgba(0,0,0,0.08),_inset_2px_2px_5px_rgba(0,0,0,0.12),_inset_-3px_-3px_7px_rgba(255,255,255,0.82)]">
                                {logo ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={logo} alt={t.name} className="h-[95%] w-[95%] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.18)]" />
                                ) : (
                                  <span className="material-symbols-outlined text-6xl">groups</span>
                                )}
                              </div>
                            </div>
                          </LiquidGlassCard>
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 text-center mb-2">{t.name}</h3>
                        <div className="text-sm text-gray-900 space-y-2 mt-auto">
                          <p><strong>Players:</strong> {players} {t.max_players ? `/ ${t.max_players}` : ''}</p>
                          <p><strong>Balance Purse:</strong> {fmt(balance)}</p>
                        </div>
                        {(role === 'admin' || role === 'auctioneer') && (
                          <div className="flex gap-2 mt-4">
                            <Link href={`/dashboard/${auctionId}/teams/${t.id}/edit`} className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium"><span className="material-symbols-outlined text-base">edit</span>Edit</Link>
                            <button onClick={() => handleDelete(t.id)} disabled={deletingId === t.id} className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-red-50/80 hover:bg-red-100 text-red-700 font-medium disabled:opacity-50"><span className="material-symbols-outlined text-base">delete</span>Delete</button>
                          </div>
                        )}
                      </div>
                    </div>
                  </LiquidGlassCard>
                );
              })}
              {!loading && teams.length === 0 && (
                <div className="col-span-full rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">No teams yet.</div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
} 