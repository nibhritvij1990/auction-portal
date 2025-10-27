'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../lib/useAuthReady';
type MultiOption = { id: string; name: string };

function MultiSelectDropdown({ placeholder, options, selected, onChange }: { placeholder: string; options: MultiOption[]; selected: string[]; onChange: (next: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);
  const selCount = selected.length;
  const label = selCount === 0 ? placeholder : selCount === 1 ? (options.find(o => o.id === selected[0])?.name || placeholder) : `${selCount} selected`;
  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id));
    else onChange([...selected, id]);
  }
  function selectAll() { onChange(Array.from(new Set(options.map(o => o.id)))); }
  function clearAll() { onChange([]); }
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(s => !s)} className="flex h-10 w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 shadow-sm hover:border-gray-400 focus:border-pink-500 focus:outline-none">
        <span className="truncate text-left">{label}</span>
        <span className="material-symbols-outlined text-gray-500 text-sm">arrow_drop_down</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-700">
            <button type="button" onClick={selectAll} className="rounded border px-2 py-1 hover:bg-gray-50">Select all</button>
            <button type="button" onClick={clearAll} className="rounded border px-2 py-1 hover:bg-gray-50">Clear</button>
          </div>
          <div className="max-h-56 overflow-auto py-1 text-gray-700">
            {options.map(o => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                <input type="checkbox" className="h-4 w-4" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
                <span className="truncate">{o.name}</span>
              </label>
            ))}
            {options.length === 0 && <div className="px-3 py-2 text-sm text-gray-500">No options</div>}
          </div>
        </div>
      )}
    </div>
  );
}


type Player = {
  id: string;
  name: string;
  base_price: number | null;
  category?: string | null;
  status?: string | null;
  set_id?: string | null;
  photo_path?: string | null;
  photo_url?: string | null;
};

export default function PlayersPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const { ready, session } = useAuthReady();

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [role, setRole] = useState<string>('User');
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [auctionsList, setAuctionsList] = useState<{ id: string; name: string }[]>([]);
  const [selectedAuctionId, setSelectedAuctionId] = useState<string>(auctionId);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [setsById, setSetsById] = useState<Record<string, { id: string; name: string }>>({});
  const [setOptions, setSetOptions] = useState<{ id: string; name: string }[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [filterSetIds, setFilterSetIds] = useState<string[]>([]);
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const pageSizeOptions = ['10','25','50','60','75','100','ALL'] as const;
  const [pageSize, setPageSize] = useState<typeof pageSizeOptions[number]>('100');
  const [totalCount, setTotalCount] = useState<number>(0);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [compactActions, setCompactActions] = useState<boolean>(false);
  const compactRef = useRef<boolean>(false);
  const rafIdRef = useRef<number | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
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
      // Fetch sets for filters
      const [{ data: sets }, { data: cats }] = await Promise.all([
        supabase.from('auction_sets').select('id,name').eq('auction_id', auctionId).order('ord', { ascending: true }),
        supabase.from('auction_players').select('category').eq('auction_id', auctionId).order('category', { ascending: true }),
      ]);
      if (!mounted) return;
      const map: Record<string, { id: string; name: string }> = {};
      (sets as any[])?.forEach((s: any) => { map[s.id] = { id: s.id, name: s.name }; });
      setSetsById(map);
      setSetOptions((sets as any[]) ?? []);
      const uniqCats = Array.from(new Set(((cats as any[]) ?? []).map((c: any) => c.category).filter((v: any) => !!v)));
      setCategoryOptions(uniqCats as string[]);
      await loadPlayersPage();
    }
    load();
    return () => { mounted = false; };
  }, [ready, session, auctionId, router]);

  async function loadPlayersPage() {
    let q = supabase
      .from('auction_players')
      .select('id,name,base_price,category,status,set_id,photo_path,photo_url', { count: 'exact' })
      .eq('auction_id', auctionId);
    if (filterSetIds.length > 0) q = q.in('set_id', filterSetIds);
    if (filterCategories.length > 0) q = q.in('category', filterCategories);
    if (filterStatuses.length > 0) q = q.in('status', filterStatuses);
    if (searchTerm) q = q.ilike('name', `%${searchTerm}%`);
    q = q.order('created_at', { ascending: false });
    if (pageSize !== 'ALL') {
      const size = Number(pageSize);
      const from = (page - 1) * size;
      const to = from + size - 1;
      q = q.range(from, to);
    }
    const { data, error, count } = await q;
    if (error) { setPlayers([]); setTotalCount(0); setLoading(false); return; }
    setPlayers((data as Player[]) ?? []);
    setTotalCount(count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    if (!ready || !session?.user) return;
    setLoading(true);
    // reset to page 1 on filter/search/pageSize change
    setPage(1);
    loadPlayersPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterSetIds, filterCategories, filterStatuses, searchTerm, pageSize]);

  useEffect(() => {
    if (!ready || !session?.user) return;
    if (pageSize === 'ALL') return; // no paging
    setLoading(true);
    loadPlayersPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => { compactRef.current = compactActions; }, [compactActions]);

  // Measure the full row (title + actions) and toggle compact mode based on container width thresholds
  useEffect(() => {
    const container = rowRef.current;
    if (!container) return;

    const measure = () => {
      const width = container.clientWidth;
      const hasSel = Object.keys(selected).some(id => selected[id]);
      const threshold = hasSel ? 1280 : 960;
      // Small hysteresis to avoid flicker around threshold
      if (!compactRef.current && width < threshold - 8) {
        setCompactActions(true);
      } else if (compactRef.current && width > threshold + 8) {
        setCompactActions(false);
      }
    };

    const schedule = () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        measure();
        rafIdRef.current = null;
      });
    };

    const ro = new ResizeObserver(schedule);
    ro.observe(container);
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
    };
  }, [selected]);

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      const next: Record<string, boolean> = {};
      players.forEach(p => next[p.id] = true);
      setSelected(next);
    } else {
      setSelected({});
    }
  }

  function toggleRow(id: string) {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    const ok = confirm('Delete this player?');
    if (!ok) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from('auction_players').delete().eq('id', id);
      if (error) throw error;
      setPlayers(prev => prev.filter(p => p.id !== id));
      setSelected(prev => { const cp = { ...prev }; delete cp[id]; return cp; });
    } catch (e) {
      alert((e as any)?.message || 'Failed to delete player');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteSelected() {
    const ids = Object.keys(selected).filter(id => selected[id]);
    if (ids.length === 0) return;
    const ok = confirm(`Delete ${ids.length} selected players?`);
    if (!ok) return;
    const { error } = await supabase.from('auction_players').delete().in('id', ids).eq('auction_id', auctionId);
    if (error) { alert(error.message); return; }
    setPlayers(prev => prev.filter(p => !ids.includes(p.id)));
    setSelected({});
  }

  function handleEditSelected() {
    const ids = Object.keys(selected).filter(id => selected[id]);
    if (ids.length === 0) return;
    router.push(`/dashboard/${auctionId}/players/bulk?ids=${encodeURIComponent(ids.join(','))}`);
  }

  async function handleBulkExport() {
    const rows = players.map(p => ({ id: p.id, name: p.name, base_price: p.base_price, category: p.category, status: p.status, set_id: p.set_id }));
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `players_${auctionId}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleMarkUnsoldAvailable() {
    const { error } = await supabase.from('auction_players').update({ status: 'available' }).eq('auction_id', auctionId).eq('status', 'unsold');
    if (error) { alert(error.message); return; }
    setPlayers(prev => prev.map(p => p.status === 'unsold' ? { ...p, status: 'available' } : p));
  }

  async function handleDeleteAll() {
    const ok = confirm('Delete ALL players in this auction?');
    if (!ok) return;
    const { error } = await supabase.from('auction_players').delete().eq('auction_id', auctionId);
    if (error) { alert(error.message); return; }
    setPlayers([]);
    setSelected({});
  }

  async function updatePlayerBasePrice(playerId: string, nextValue: number | null) {
    const prev = players;
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, base_price: nextValue } : p));
    const { error } = await supabase.from('auction_players').update({ base_price: nextValue }).eq('id', playerId);
    if (error) {
      alert(error.message);
      setPlayers(prev); // revert
    }
  }

  async function updatePlayerStatus(playerId: string, nextStatus: string | null) {
    const prev = players;
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, status: nextStatus } : p));
    const { error } = await supabase.from('auction_players').update({ status: nextStatus }).eq('id', playerId);
    if (error) {
      alert(error.message);
      setPlayers(prev);
    }
  }

  const userEmail = session?.user?.email ?? '';
  const displayEmail = userEmail ? userEmail.split('@')[0] : '';

  const totalPages = pageSize === 'ALL' ? 1 : Math.max(1, Math.ceil(totalCount / Number(pageSize)));
  const hasSelection = Object.keys(selected).some(id => selected[id]);

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
              <label className="mb-1 block text-xs text-white">Auction</label>
              <select
                className="w-full rounded-lg border border-gray-600 bg-gray-400 text-black px-3 py-2 text-sm shadow-sm focus:border-pink-500 focus:ring-pink-500"
                value={selectedAuctionId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedAuctionId(val);
                  router.replace(`/dashboard/${val}/players`);
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
              <Link href={`/dashboard/${auctionId}/players`} className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-pink-50 text-pink-600">
                <span className="material-symbols-outlined">person</span>
                <span className="font-semibold">Players</span>
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
            <div ref={rowRef} className="mb-6 flex items-center justify-between">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">Players</h2>
              <div ref={actionsRef} className="flex items-center gap-2 overflow-hidden">
                {(role === 'admin' || role === 'auctioneer') && (
                  <>
                    {hasSelection && (
                      <>
                        <button
                          onClick={handleEditSelected}
                          title="Edit Selected"
                          aria-label="Edit Selected"
                          className={`group inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 ${compactActions ? 'px-2 py-2' : 'px-3 py-2'} text-sm text-gray-700 hover:bg-gray-100 leading-none relative`}
                        >
                          <span className="material-symbols-outlined">edit</span>
                          <span className={`${compactActions ? 'hidden' : ''} whitespace-nowrap`}>Edit Selected</span>
                          {compactActions && (
                            <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-75 group-hover:opacity-100">Edit Selected</span>
                          )}
                        </button>
                        <button
                          onClick={handleDeleteSelected}
                          title="Delete Selected"
                          aria-label="Delete Selected"
                          className={`group inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 ${compactActions ? 'px-2 py-2' : 'px-3 py-2'} text-sm text-red-700 hover:bg-red-100 leading-none relative`}
                        >
                          <span className="material-symbols-outlined">delete</span>
                          <span className={`${compactActions ? 'hidden' : ''} whitespace-nowrap`}>Delete Selected</span>
                          {compactActions && (
                            <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-75 group-hover:opacity-100">Delete Selected</span>
                          )}
                        </button>
                      </>
                    )}
                    <Link
                      href={`/dashboard/${auctionId}/players/bulk`}
                      title="Bulk Import/Edit"
                      className={`group inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 ${compactActions ? 'px-2 py-2' : 'px-3 py-2'} text-sm text-gray-700 hover:bg-gray-100 leading-none relative`}
                    >
                      <span className="material-symbols-outlined">table_view</span>
                      <span className={`${compactActions ? 'hidden' : ''} whitespace-nowrap`}>Bulk Import/Edit</span>
                      {compactActions && (
                        <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-75 group-hover:opacity-100">Bulk Import/Edit</span>
                      )}
                    </Link>
                    <button
                      onClick={handleBulkExport}
                      title="Bulk Export"
                      aria-label="Bulk Export"
                      className={`group inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 ${compactActions ? 'px-2 py-2' : 'px-3 py-2'} text-sm text-gray-700 hover:bg-gray-100 leading-none relative`}
                    >
                      <span className="material-symbols-outlined">download</span>
                      <span className={`${compactActions ? 'hidden' : ''} whitespace-nowrap`}>Bulk Export</span>
                      {compactActions && (
                        <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-75 group-hover:opacity-100">Bulk Export</span>
                      )}
                    </button>
                    <button
                      onClick={handleMarkUnsoldAvailable}
                      title="Mark Unsold as Available"
                      aria-label="Mark Unsold as Available"
                      className={`group inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 ${compactActions ? 'px-2 py-2' : 'px-3 py-2'} text-sm text-gray-700 hover:bg-gray-100 leading-none relative`}
                    >
                      <span className="material-symbols-outlined">check_circle</span>
                      <span className={`${compactActions ? 'hidden' : ''} whitespace-nowrap`}>Mark Unsold as Available</span>
                      {compactActions && (
                        <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-75 group-hover:opacity-100">Mark Unsold as Available</span>
                      )}
                    </button>
                    <button
                      onClick={handleDeleteAll}
                      title="Delete All"
                      aria-label="Delete All"
                      className={`group inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 ${compactActions ? 'px-2 py-2' : 'px-3 py-2'} text-sm text-red-700 hover:bg-red-100 leading-none relative`}
                    >
                      <span className="material-symbols-outlined">delete_forever</span>
                      <span className={`${compactActions ? 'hidden' : ''} whitespace-nowrap`}>Delete All</span>
                      {compactActions && (
                        <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-75 group-hover:opacity-100">Delete All</span>
                      )}
                    </button>
                    <Link
                      href={`/dashboard/${auctionId}/players/new`}
                      title="New Player"
                      className={`group inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 ${compactActions ? 'px-3 py-2' : 'px-5 py-2.5'} text-sm font-semibold text-white shadow-sm transition-all hover:bg-purple-700 leading-none relative`}
                    >
                      <span className="material-symbols-outlined">add</span>
                      <span className={`${compactActions ? 'hidden' : ''} whitespace-nowrap`}>New Player</span>
                      {compactActions && (
                        <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-75 group-hover:opacity-100">New Player</span>
                      )}
                    </Link>
                  </>
                )}
              </div>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Set</label>
                <MultiSelectDropdown
                  placeholder="All Sets"
                  options={setOptions.map(s => ({ id: s.id, name: s.name }))}
                  selected={filterSetIds}
                  onChange={setFilterSetIds}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Category</label>
                <MultiSelectDropdown
                  placeholder="All Categories"
                  options={categoryOptions.map(c => ({ id: c, name: c }))}
                  selected={filterCategories}
                  onChange={setFilterCategories}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Status</label>
                <MultiSelectDropdown
                  placeholder="All Statuses"
                  options={[
                    { id: 'available', name: 'Available' },
                    { id: 'unsold', name: 'Unsold' },
                    { id: 'sold', name: 'Sold' },
                    { id: 'withheld', name: 'Withheld' },
                  ]}
                  selected={filterStatuses}
                  onChange={setFilterStatuses}
                />
              </div>
              <div className="lg:col-span-2">
                <label className="mb-1 block text-xs font-semibold text-gray-700">Search</label>
                <input className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700" placeholder="Search by name" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Per Page</label>
                <select className="w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700" value={pageSize} onChange={e => setPageSize(e.target.value as any)}>
                  {pageSizeOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-md">
              <table className="w-full min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-4 text-left w-12">
                      <input type="checkbox" className="h-4 w-4" checked={players.length > 0 && Object.keys(selected).filter(id => selected[id]).length === players.length} onChange={e => toggleSelectAll(e.target.checked)} />
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Player</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Set</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Base Price</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {loading && (
                    <tr>
                      <td className="px-6 py-6 text-sm text-gray-500" colSpan={7}>Loading…</td>
                    </tr>
                  )}
                  {!loading && players.map(p => {
                    const photo = p.photo_path ? supabase.storage.from('player-photos').getPublicUrl(p.photo_path).data.publicUrl : (p.photo_url || '');
                    return (
                      <tr key={p.id}>
                        <td className="px-4 py-4 text-sm"><input type="checkbox" className="h-4 w-4" checked={!!selected[p.id]} onChange={() => toggleRow(p.id)} /></td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
                              {photo ? <img src={photo} alt={p.name} className="h-10 w-10 object-cover" /> : <span className="material-symbols-outlined text-gray-400">person</span>}
                            </div>
                            <div>
                              <div className="text-gray-900">{p.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{p.category ?? '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{p.set_id ? (setsById[p.set_id]?.name ?? '-') : '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700">
                          {(role === 'admin' || role === 'auctioneer') ? (
                            <input
                              type="number"
                              className="w-28 rounded-md border border-gray-300 bg-white px-2 py-1 text-right text-sm focus:border-pink-500 focus:ring-pink-500"
                              defaultValue={p.base_price ?? undefined}
                              onBlur={(e) => {
                                const raw = (e.target as HTMLInputElement).value;
                                const val = raw === '' ? null : Number(raw);
                                if ((p.base_price ?? null) !== val) updatePlayerBasePrice(p.id, Number.isNaN(val as any) ? null : val);
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            />
                          ) : (
                            <>{fmt(p.base_price)}</>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {(role === 'admin' || role === 'auctioneer') ? (
                            <select
                              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-pink-500 focus:ring-pink-500"
                              value={p.status ?? 'available'}
                              onChange={(e) => updatePlayerStatus(p.id, (e.target as HTMLSelectElement).value)}
                            >
                              <option value="available">available</option>
                              <option value="unsold">unsold</option>
                              <option value="sold">sold</option>
                              <option value="withheld">withheld</option>
                            </select>
                          ) : (
                            <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border" style={{ borderColor: '#e5e7eb', color: '#374151' }}>{p.status ?? 'available'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                          {(role === 'admin' || role === 'auctioneer') && (
                            <>
                              <Link href={`/dashboard/${auctionId}/players/${p.id}/edit`} className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-gray-100" title="Edit"><span className="material-symbols-outlined text-gray-700">edit</span></Link>
                              <button onClick={() => handleDelete(p.id)} disabled={deletingId === p.id} className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-red-50 disabled:opacity-50" title="Delete"><span className="material-symbols-outlined text-red-600">delete</span></button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && players.length === 0 && (
                    <tr>
                      <td className="px-6 py-6 text-sm text-gray-500" colSpan={7}>No players yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-gray-700">
                {pageSize === 'ALL' ? `Showing all ${players.length} players` : `Page ${page} of ${totalPages} (${totalCount} players)`}
              </div>
              {pageSize !== 'ALL' && (
                <div className="flex items-center gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 disabled:opacity-50">Prev</button>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="rounded border border-gray-300 px-3 py-1 text-gray-700 text-sm disabled:opacity-50">Next</button>
                </div>
              )}
            </div>
            {/* Selected actions moved to top toolbar; bottom duplicates removed */}
          </div>
        </main>
      </div>
    </div>
  );
}

function fmt(n: number | null) {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
} 