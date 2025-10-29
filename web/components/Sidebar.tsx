'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';
import { useAuthReady } from '../lib/useAuthReady';

export default function Sidebar() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const auctionId = params?.id as string;

  const { ready, session } = useAuthReady();
  const [profile, setProfile] = useState<{ role: string } | null>(null);
  const [auctionsList, setAuctionsList] = useState<{ id: string; name: string }[]>([]);
  const [selectedAuctionId, setSelectedAuctionId] = useState<string>(auctionId);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [overlaysOpen, setOverlaysOpen] = useState<boolean>(false);
  const overlaysAnchorRef = useRef<HTMLDivElement | null>(null);
  const overlaysMenuRef = useRef<HTMLDivElement | null>(null);
  const [overlaysPos, setOverlaysPos] = useState<{ top: number; left: number } | null>(null);

  // Fetch profile
  useEffect(() => {
    async function fetchProfile() {
      if (!session?.user) return;
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();
      setProfile(profileData);
    }
    if (session) fetchProfile();
  }, [session]);

  // Fetch auctions for switcher
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!ready || !session?.user) return;
      const { data } = await supabase.from('auctions').select('id,name').order('created_at', { ascending: false });
      if (!mounted) return;
      setAuctionsList((data as any[]) ?? []);
      if (auctionId) {
        setSelectedAuctionId(auctionId);
      }
    })();
    return () => { mounted = false; };
  }, [ready, session, auctionId]);

  // Overlays dropdown position effect
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

  // Overlays dropdown click outside
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

  // Profile menu outside click effect
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('click', onClickOutside);
    return () => document.removeEventListener('click', onClickOutside);
  }, []);

  const userEmail = session?.user?.email ?? '';
  const displayEmail = userEmail.split('@')[0];
  const profileRole = profile?.role ?? 'User';

  const navLinks = [
    { href: `/dashboard/${auctionId}/teams`, icon: 'groups', label: 'Teams' },
    { href: `/dashboard/${auctionId}/players`, icon: 'person', label: 'Players' },
    { href: `/dashboard/${auctionId}/rules`, icon: 'gavel', label: 'Bid Rules' },
    { href: `/dashboard/${auctionId}/sponsors`, icon: 'handshake', label: 'Sponsors' },
  ];

  const strategyLink = {
    href: `/dashboard/${auctionId}/strategy`,
    icon: 'psychology',
    label: 'Strategy Room',
  };

  const secondaryNavLinks = [
    { href: `/dashboard/${auctionId}/console`, icon: 'live_tv', label: 'Live Auction Console' },
    { href: `/dashboard/${auctionId}/summary`, icon: 'insights', label: 'Summary', newTab: true },
  ];

  return (
    <aside className="sticky top-0 h-screen overflow-y-auto shrink-0 w-80 bg-transparent px-4 py-6 flex flex-col justify-between z-10">
      <div>
        <div className="flex items-center gap-3 mb-10">
          <img alt="Auction Central" className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200 bg-white" src="/images/auction-central-3d-03.jpg" />
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
              const newPath = pathname.replace(auctionId, val);
              router.replace(newPath);
            }}
          >
            {auctionsList.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <hr className="mb-4 border-gray-200" />
        <nav className="flex flex-col gap-2">
          {navLinks.map(link => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg ${isActive ? 'bg-pink-50 text-pink-600' : 'text-white hover:bg-gray-700'}`}>
                <span className="material-symbols-outlined">{link.icon}</span>
                <span className={isActive ? 'font-semibold' : ''}>{link.label}</span>
              </Link>
            );
          })}
          <hr className="my-4 border-gray-200" />
          {profile && (profile.role === 'admin' || profile.role === 'team_rep') && (
            <>
              <Link href={strategyLink.href} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg ${pathname.startsWith(strategyLink.href) ? 'bg-pink-50 text-pink-600' : 'text-white hover:bg-gray-700'}`}>
                <span className="material-symbols-outlined">{strategyLink.icon}</span>
                <span className={pathname.startsWith(strategyLink.href) ? 'font-semibold' : ''}>{strategyLink.label}</span>
              </Link>
              <hr className="my-4 border-gray-200" />
            </>
          )}
          {secondaryNavLinks.map(link => (
            <Link key={link.href} href={link.href} target={link.newTab ? '_blank' : undefined} rel={link.newTab ? 'noopener noreferrer' : undefined} className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-white hover:bg-gray-700">
              <span className="material-symbols-outlined">{link.icon}</span>
              <span>{link.label}</span>
            </Link>
          ))}
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
        <button onClick={() => setProfileOpen(s => !s)} className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 text-left text-white hover:text-black">
          <div className="size-10 rounded-full bg-center bg-cover bg-no-repeat" style={{ backgroundImage: 'url(https://lh3.googleusercontent.com/aida-public/AB6AXuCkBaw0NP9vVQvXoio8OnkXr77KrzC_fbJWwzi6VZ61DM6m8HxpCjULjESPM-3SbdaLrAnKnS97J7WiQSrjXhvCTAXTm-ST0lNXRE_J5P8ZNDHHCP4UY1A6lzcsePkOLoAwP7KbxEcFul1kEXgDzmQskgxqEuJz455sHU-GB9d_3QuK82DMeaba4QA4y2IU16b7v0E6VOSqCj06cnETsGUnXZsBq7vQMiP4EAKavjeHTnTPHuNnsaC20XheVKeBqgn64ClOY8sQVs0)' }} />
          <div className="min-w-0">
            <p className="font-semibold truncate max-w-[18ch]">{displayEmail}</p>
            <p className="text-sm opacity-70">{profileRole}</p>
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
  );
}
