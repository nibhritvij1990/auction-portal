"use client";

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../lib/useAuthReady';
import LiquidGlassCard from '../../../../components/LiquidGlassCard';

export default function SponsorsPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const { ready, session } = useAuthReady();

  const [profileRole, setProfileRole] = useState<string>('User');
  const [auctionsList, setAuctionsList] = useState<{ id: string; name: string }[]>([]);
  const [selectedAuctionId, setSelectedAuctionId] = useState<string>(auctionId);
  const [sponsors, setSponsors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const profileRef = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
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

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      const [{ data: p }, { data: a }, { data: sp }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', session.user.id).single(),
        supabase.from('auctions').select('id,name').order('created_at', { ascending: false }),
        supabase.from('auction_sponsors').select('id,name,sponsor_type,logo_path,logo_url,ord').eq('auction_id', auctionId).order('sponsor_type', { ascending: true }).order('ord', { ascending: true }),
      ]);
      if (!mounted) return;
      setProfileRole((p as any)?.role || 'User');
      setAuctionsList((a as any[]) ?? []);
      setSelectedAuctionId(auctionId);
      setSponsors(((sp as any[]) ?? []).slice().sort((a, b) => {
        const at = a?.sponsor_type === 'title' ? 0 : 1;
        const bt = b?.sponsor_type === 'title' ? 0 : 1;
        if (at !== bt) return at - bt;
        return (a?.ord ?? 0) - (b?.ord ?? 0);
      }));
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [ready, session, auctionId, router]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, []);

  function publicLogoUrl(row: any) {
    if (row.logo_path) return supabase.storage.from('sponsor-logos').getPublicUrl(row.logo_path).data.publicUrl;
    return row.logo_url || '';
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this sponsor?')) return;
    await supabase.from('auction_sponsors').delete().eq('id', id).eq('auction_id', auctionId);
    setSponsors(prev => prev.filter(s => s.id !== id));
  }

  const userEmail = session?.user?.email ?? '';
  const displayEmail = userEmail ? userEmail.split('@')[0] : '';
  // overlaysOpen already declared above

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
                  router.replace(`/dashboard/${val}/sponsors`);
                }}
              >
                {auctionsList.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <hr className="mb-4 border-gray-200" />
            <nav className="flex flex-col gap-2" id="main-nav">
              <Link href={`/dashboard/${auctionId}/teams`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-white hover:bg-gray-400 hover:text-black"><span className="material-symbols-outlined">groups</span><span>Teams</span></Link>
              <Link href={`/dashboard/${auctionId}/players`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-white hover:bg-gray-400 hover:text-black"><span className="material-symbols-outlined">person</span><span>Players</span></Link>
              <Link href={`/dashboard/${auctionId}/rules`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-white hover:bg-gray-400 hover:text-black"><span className="material-symbols-outlined">gavel</span><span>Bid Rules</span></Link>
              <Link href={`/dashboard/${auctionId}/sponsors`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-pink-50 text-pink-600"><span className="material-symbols-outlined">handshake</span><span className="font-semibold">Sponsors</span></Link>
              <hr className="my-4 border-gray-200" />
              <Link href={`/dashboard/${auctionId}/console`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-white hover:bg-gray-400 hover:text-black"><span className="material-symbols-outlined">live_tv</span><span>Live Auction Console</span></Link>
              <Link href={`/dashboard/${auctionId}/summary`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-white hover:bg-gray-400 hover:text-black"><span className="material-symbols-outlined">insights</span><span>Summary</span></Link>
              <div className="relative" ref={overlaysAnchorRef}>
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
                <p className="text-sm text-gray-500">{profileRole}</p>
              </div>
            </button>
            {profileOpen && (
              <div className="absolute left-0 ml-2 bottom-[110%] w-56 rounded-md bg-white py-2 text-sm shadow-lg ring-1 ring-black ring-opacity-5 z-10">
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="font-medium text-gray-900 truncate" title={userEmail}>{userEmail}</p>
                  <p className="text-xs text-gray-500">Role: {profileRole}</p>
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
                  <p className="mt-2 text-gray-500">Manage sponsors for your auction.</p>
                </div>
                <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg border border-pink-50 px-4 py-2 text-sm text-pink-600 bg-pink-50 hover:bg-pink-100">
                  <span className="material-symbols-outlined">arrow_back</span>
                  <span>Back to Dashboard</span>
                </Link>
              </div>
            </header>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">Sponsors</h2>
              {(profileRole === 'admin' || profileRole === 'auctioneer') && (
                <Link href={`/dashboard/${auctionId}/sponsors/new`} className="flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-purple-700">
                  <span className="material-symbols-outlined">add</span>
                  <span>New Sponsor</span>
                </Link>
              )}
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,14rem))] justify-start gap-10">
              {loading && (
                <div className="col-span-full rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading…</div>
              )}
              {!loading && sponsors.map(s => (
                <div key={s.id} className="group relative flex flex-col items-center">
                  {s.sponsor_type === 'title' && (
                    <span className="absolute left-1 top-1 inline-flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100 text-yellow-700 shadow z-[9]">
                      <span className="material-symbols-outlined text-[36px] leading-none" style={{ fontSize: '28px' }}>workspace_premium</span>
                    </span>
                  )}
                  <div className="relative h-56 w-56">
                    {/* rotating blurred background logo */}
                    <div className="absolute inset-0 rounded-full overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={publicLogoUrl(s)} alt="bg" className="h-full w-full object-contain opacity-60 animate-spin" style={{ animationDuration: '30s', filter: 'blur(4px)' }} />
                    </div>
                    {/* liquid glass circle with top logo using our component */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <LiquidGlassCard className="rounded-full" style={{ width: '100%', height: '100%', borderRadius: '9999px' }} size="no-size">
                        <div className="flex h-full w-full items-center justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={publicLogoUrl(s)} alt={s.name} className="h-full w-full rounded-full object-contain p-3" style={{ borderRadius: '9999px' }} />
                        </div>
                      </LiquidGlassCard>
                    </div>
                    {(profileRole === 'admin' || profileRole === 'auctioneer') && (
                      <div className="pointer-events-none absolute bottom-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Link href={`/dashboard/${auctionId}/sponsors/${s.id}/edit`} className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200" title="Edit">
                          <span className="material-symbols-outlined text-sm">edit</span>
                        </Link>
                        <button onClick={() => handleDelete(s.id)} className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-red-600 hover:bg-red-100" title="Delete">
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 text-base font-semibold text-gray-800 text-center">{s.name}</div>
                  <div className="text-sm text-gray-500">{s.sponsor_type === 'title' ? 'Title Sponsor' : 'Sponsor'}</div>
                </div>
              ))}
              {!loading && sponsors.length === 0 && (
                <div className="col-span-full rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">No sponsors yet.</div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
} 