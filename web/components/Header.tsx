'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { useAuthReady } from '../lib/useAuthReady';

export default function Header() {
  const pathname = usePathname();
  // Hide header on manage-style pages
  const isManage = /^\/dashboard\/[^/]+\/(teams|players|rules|sponsors|summary)/.test(pathname ?? '');
  if (isManage) return null;

  const { ready, session } = useAuthReady();
  const [profile, setProfile] = useState<{ org_id: string; role: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const isConsole = /^\/dashboard\/[^/]+\/console/.test(pathname ?? '');
  const auctionIdMatch = pathname?.match(/^\/dashboard\/([^/]+)/);
  const auctionId = auctionIdMatch ? auctionIdMatch[1] : null;
  const [compactPref, setCompactPref] = useState<boolean>(false);
  const [ovOpen, setOvOpen] = useState(false);
  const ovAnchorRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);
  const ovMenuRef = useRef<HTMLDivElement | null>(null);
  const [ovPos, setOvPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!ready) return;
      if (!session?.user) { setProfile(null); return; }
      const { data: p } = await supabase.from('profiles').select('org_id, role').eq('id', session.user.id).single();
      if (!mounted) return;
      if (p) setProfile(p as any);
    })();
    return () => { mounted = false; };
  }, [ready, session]);

  // Load current compact pref for console pages
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!ready || !session?.user || !isConsole || !auctionId) return;
      const { data: prefRow } = await supabase
        .from('console_prefs')
        .select('prefs')
        .eq('user_id', session.user.id)
        .eq('auction_id', auctionId)
        .maybeSingle();
      if (!mounted) return;
      if (prefRow?.prefs) setCompactPref(Boolean(prefRow.prefs.compactMode ?? false));
    })();
    return () => { mounted = false; };
  }, [ready, session, isConsole, auctionId]);

  useEffect(() => {
    function updatePos() {
      if (!ovOpen) return;
      const el = ovAnchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setOvPos({ top: rect.bottom + 6, left: rect.left });
    }
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [ovOpen]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ovOpen) return;
      const a = ovAnchorRef.current;
      const m = ovMenuRef.current;
      const target = e.target as Node;
      if (a && a.contains(target)) return;
      if (m && m.contains(target)) return;
      setOvOpen(false);
    }
    document.addEventListener('mousedown', onDocClick, true);
    return () => document.removeEventListener('mousedown', onDocClick, true);
  }, [ovOpen]);

  async function toggleCompactPref() {
    if (!session?.user || !isConsole || !auctionId) return;
    const next = !compactPref;
    setCompactPref(next);
    await supabase
      .from('console_prefs')
      .upsert({ user_id: session.user.id, auction_id: auctionId, prefs: { compactMode: next } }, { onConflict: 'user_id,auction_id' });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('console-compact-changed', { detail: { compactMode: next } }));
    }
  }

  const isAuthPage = pathname?.startsWith('/auth');
  const userEmail = session?.user?.email?.split('@')[0] ?? null;

  return (
    <header className="flex items-center justify-between border-b border-black bg-black px-10 py-4 shadow-sm relative">
      <div className="absolute -right-[100px] top-[0px] h-[400px] w-[600px] blur-[10px] will-change-[filter] [transform:translateZ(0)]"
        style={{background:"radial-gradient(circle, rgb(134 0 255 / 1) 0%, transparent 100%)", zIndex: 1}}>
        <div className="h-[100%] w-[100%] bg-brand-700"></div>
      </div>
      <div className="flex items-center gap-4">
        <img alt="Auction Central" className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200 bg-white" src="/images/auction-central-3d-03.jpg" />
        <div className="leading-tight">
          <h1 className="text-2xl font-bold text-white tracking-tight">Auction Central</h1>
          <div className="-mt-0.5 text-xs text-gray-300">Sponsored by UCL</div>
        </div>
      </div>
      {isConsole && auctionId && (
        <nav className="hidden md:flex items-center gap-6 text-sm" style={{zIndex: 2}}>
          <Link className="font-medium text-gray-100 transition-colors hover:text-pink-600" href="/dashboard">Dashboard</Link>
          <Link className="font-medium text-gray-100 transition-colors hover:text-pink-600" href={`/dashboard/${auctionId}/teams`}>Teams</Link>
          <Link className="font-medium text-gray-100 transition-colors hover:text-pink-600" href={`/dashboard/${auctionId}/players`}>Players</Link>
          <Link className="font-medium text-gray-100 transition-colors hover:text-pink-600" href={`/dashboard/${auctionId}/rules`}>Rules</Link>
          <Link className="font-medium text-gray-100 transition-colors hover:text-pink-600" href={`/dashboard/${auctionId}/sponsors`}>Sponsors</Link>
          <Link className="font-medium text-gray-100 transition-colors hover:text-pink-600" href={`/dashboard/${auctionId}/summary`} target="_blank" rel="noopener noreferrer">Summary</Link>
          <button ref={ovAnchorRef as any} type="button" onClick={() => setOvOpen(s => !s)} className={`font-medium transition-colors ${ovOpen ? 'text-pink-600' : 'text-gray-100 hover:text-pink-600'}`}>Tickers/Overlays<span className="material-symbols-outlined text-sm ml-1 align-middle" style={{fontSize: '17px'}}>{ovOpen ? 'expand_less' : 'expand_more'}</span></button>
          {ovOpen && ovPos && createPortal(
            <div ref={ovMenuRef} className="w-56 rounded-md bg-white py-2 text-sm shadow-lg ring-1 ring-black ring-opacity-5" style={{ position: 'fixed', top: ovPos.top, left: ovPos.left, zIndex: 2147483647 }}>
              <Link href={`/overlays/${auctionId}/player`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Player Overlay</Link>
              <Link href={`/overlays/${auctionId}/player-list`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Player + List Overlay</Link>
              <Link href={`/overlays/${auctionId}/list`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Players List Overlay</Link>
              <Link href={`/overlays/${auctionId}/ticker`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Ticker Overlay</Link>
              <Link href={`/overlays/${auctionId}/teams`} target="_blank" rel="noopener noreferrer" className="block px-4 py-2 text-gray-700 hover:bg-gray-100">Teams Overlay</Link>
            </div>, document.body)
          }
        </nav>
      )}
      {!isAuthPage && (
        <div className="flex items-center gap-4" style={{zIndex: 2}}>
          <button className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2">
            <span className="material-symbols-outlined text-white">notifications</span>
            <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-pink-500 border-2 border-white"></span>
          </button>
          {ready && userEmail ? (
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen(s => !s)} className="flex items-center gap-3">
                <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10" style={{ backgroundImage: 'url(https://lh3.googleusercontent.com/aida-public/AB6AXuCkBaw0NP9vVQvXoio8OnkXr77KrzC_fbJWwzi6VZ61DM6m8HxpCjULjESPM-3SbdaLrAnKnS97J7WiQSrjXhvCTAXTm-ST0lNXRE_J5P8ZNDHHCP4UY1A6lzcsePkOLoAwP7KbxEcFul1kEXgDzmQskgxqEuJz455sHU-GB9d_3QuK82DMeaba4QA4y2IU16b7v0E6VOSqCj06cnETsGUnXZsBq7vQMiP4EAKavjeHTnTPHuNnsaC20XheVKeBqgn64ClOY8sQVs0)' }} />
                <div className="hidden sm:block text-left">
                  <div className="text-sm font-semibold text-white truncate max-w-[12ch]">{userEmail}</div>
                  <div className="text-xs text-gray-300">{profile?.role ?? 'User'}</div>
                </div>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-md bg-white py-2 text-sm shadow-lg ring-1 ring-black ring-opacity-5 z-50">
                  <div className="px-4 py-2">
                    <p className="font-medium text-gray-900">{userEmail}</p>
                    <p className="text-xs text-gray-500">Role: {profile?.role ?? 'User'}</p>
                  </div>
                  {isConsole && auctionId && (
                    <div className="flex items-center justify-between px-4 py-2">
                      <span className="text-gray-700">Compact mode</span>
                      <button aria-disabled="true" disabled role="switch" aria-checked={compactPref} onClick={toggleCompactPref} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${compactPref ? 'bg-gray-900' : 'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${compactPref ? 'translate-x-4' : 'translate-x-1'}`}></span>
                      </button>
                    </div>
                  )}
                  <button onClick={async () => { await supabase.auth.signOut(); setMenuOpen(false); router.replace('/auth/sign-in'); }} className="block w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100">Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/auth/sign-in" className="rounded-full bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">Sign in</Link>
          )}
        </div>
      )}
    </header>
  );
} 