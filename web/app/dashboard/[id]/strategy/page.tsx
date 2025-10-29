'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../lib/useAuthReady';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import ManagePageLayout from '../../../../components/ManagePageLayout';

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
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
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

type Profile = {
  role: string;
};

type Player = {
  id: string;
  name: string;
  category: string | null;
  base_price: number;
  photo_url?: string;
  photo_path?: string;
  set_id?: string;
  // Add all stats fields for comparison
  bat_style?: string;
  bowl_style?: string;
  matches?: number;
  runs?: number;
  average?: number;
  strike_rate?: number;
  overs?: number;
  wickets?: number;
  economy?: number;
};

type Team = {
  id: string;
  name: string;
  purse_total: number;
};

type Strategy = {
  player_id: string;
  interest: 'high' | 'medium' | 'low' | 'none';
  max_bid: number | null;
  notes: string | null;
};

export default function StrategyPage() {
  const { id: auctionId } = useParams() as { id: string };
  const router = useRouter();
  const { session, ready } = useAuthReady();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<Record<string, Strategy>>({});
  const [selectedPlayers, setSelectedPlayers] = useState<Record<string, boolean>>({});
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [overlaysOpen, setOverlaysOpen] = useState<boolean>(false);
  const overlaysAnchorRef = useRef<HTMLDivElement | null>(null);
  const overlaysMenuRef = useRef<HTMLDivElement | null>(null);
  const [overlaysPos, setOverlaysPos] = useState<{ top: number; left: number } | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [auctionsList, setAuctionsList] = useState<{ id: string; name: string }[]>([]);
  const [selectedAuctionId, setSelectedAuctionId] = useState<string>(auctionId);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [filterName, setFilterName] = useState('');
  const [filterCategories, setFilterCategories] = useState<string[]>([]);
  const [filterInterests, setFilterInterests] = useState<string[]>([]);
  const [filterSetIds, setFilterSetIds] = useState<string[]>([]);
  const [setOptions, setSetOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    let mounted = true;
    async function fetchInitialData() {
      if (!session?.user) {
        setLoading(false);
        setAccessDenied(true);
        return;
      }

      // Fetch profile to check role
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profileError || !profileData) {
        console.error('Error fetching profile:', profileError);
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      setProfile(profileData);
      const userRole = profileData.role;

      if (userRole !== 'admin' && userRole !== 'team_rep') {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      
      // Fetch teams this user can manage
      if (userRole === 'admin') {
        // Admins can see all teams in the auction
        const { data: adminTeams } = await supabase.from('teams').select('id, name, purse_total').eq('auction_id', auctionId);
        setTeams(adminTeams || []);
        if (adminTeams?.length) {
          setSelectedTeamId(adminTeams[0].id);
        }
      } else {
        // Team reps can only see their assigned team
        const { data: repTeam } = await supabase
          .from('team_representatives')
          .select('teams(id, name, purse_total)')
          .eq('user_id', session.user.id)
          .eq('auction_id', auctionId)
          .single();
        
        if (repTeam?.teams) {
          const team = repTeam.teams as unknown as Team;
          setTeams([team]);
          setSelectedTeamId(team.id);
        } else {
          // No team assigned for this auction
          setAccessDenied(true); 
        }
      }

      // Fetch sets for the auction
      const { data: setsData } = await supabase
        .from('auction_sets')
        .select('id, name')
        .eq('auction_id', auctionId)
        .order('ord', { ascending: true });
      if (mounted && setsData) {
        setSetOptions(setsData);
      }

      // Fetch players for the auction
      const { data: playersData, error: playersError } = await supabase
        .from('auction_players')
        .select('id, name, category, base_price, photo_url, photo_path, set_id, bat_style, bowl_style, matches, runs, average, strike_rate, overs, wickets, economy')
        .eq('auction_id', auctionId)
        .order('name', { ascending: true });

      if (playersError) {
        console.error('Error fetching players:', playersError);
        // Handle player fetch error, maybe show a message
      } else {
        setPlayers(playersData as Player[]);
      }

      setLoading(false);
    }

    if (session) {
      fetchInitialData();
    }
    return () => { mounted = false; };
  }, [session, auctionId]);

  useEffect(() => {
    // Load auctions for switcher
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
    // Fetch strategies when selected team changes
    async function fetchStrategies() {
      if (!selectedTeamId) return;

      const { data, error } = await supabase
        .from('team_strategies')
        .select('player_id, interest, max_bid, notes')
        .eq('team_id', selectedTeamId);
      
      if (error) {
        console.error('Error fetching strategies:', error);
        return;
      }

      const newStrategies: Record<string, Strategy> = {};
      data.forEach(s => {
        newStrategies[s.player_id] = s as Strategy;
      });
      setStrategies(newStrategies);
    }

    fetchStrategies();
  }, [selectedTeamId]);

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


  async function handleStrategyChange(playerId: string, updatedStrategy: Partial<Strategy>) {
    if (!selectedTeamId) return;

    const currentStrategy = strategies[playerId] || { interest: 'none', max_bid: null, notes: null };
    const newStrategy = { ...currentStrategy, ...updatedStrategy };
    
    // Optimistic UI update
    setStrategies(prev => ({
      ...prev,
      [playerId]: { ...newStrategy, player_id: playerId }
    }));

    const { player_id, ...strategyData } = newStrategy;

    const { error } = await supabase
      .from('team_strategies')
      .upsert({
        team_id: selectedTeamId,
        player_id: playerId,
        ...strategyData,
      }, { onConflict: 'team_id,player_id' });

    if (error) {
      console.error('Error saving strategy:', error);
      // Revert UI on error if needed
      setStrategies(prev => ({...prev, [playerId]: currentStrategy}));
    }
  }

  function handlePlayerSelect(playerId: string, isSelected: boolean) {
    const selectedCount = Object.values(selectedPlayers).filter(Boolean).length;
    if (isSelected && selectedCount >= 5) {
      setToast({ type: 'error', message: 'You can compare a maximum of 5 players at a time.' });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    setSelectedPlayers(prev => ({ ...prev, [playerId]: isSelected }));
  }

  const filteredPlayers = useMemo(() => {
    return players.filter(player => {
      const strategy = strategies[player.id];
      if (filterName && !player.name.toLowerCase().includes(filterName.toLowerCase())) {
        return false;
      }
      if (filterSetIds.length > 0 && !filterSetIds.includes(player.set_id || '')) {
        return false;
      }
      if (filterCategories.length > 0 && !filterCategories.includes(player.category || '')) {
        return false;
      }
      if (filterInterests.length > 0 && !filterInterests.includes(strategy?.interest || 'none')) {
        return false;
      }
      return true;
    });
  }, [players, strategies, filterName, filterSetIds, filterCategories, filterInterests]);

  const strategySummary = useMemo(() => {
    const team = teams.find(t => t.id === selectedTeamId);
    const totalPurse = team?.purse_total || 0;
    const committedSpend = Object.values(strategies).reduce((acc, s) => acc + (s.max_bid || 0), 0);
    const remainingPurse = totalPurse - committedSpend;
    const interestCounts = {
      high: 0,
      medium: 0,
      low: 0,
    };
    Object.values(strategies).forEach(s => {
      if (s.interest === 'high' || s.interest === 'medium' || s.interest === 'low') {
        interestCounts[s.interest]++;
      }
    });
    return { totalPurse, committedSpend, remainingPurse, interestCounts };
  }, [strategies, teams, selectedTeamId]);

  const allCategories = useMemo(() => {
    const catSet = new Set(players.map(p => p.category).filter((c): c is string => !!c));
    return Array.from(catSet).sort();
  }, [players]);

  const playersToCompare = players.filter(p => selectedPlayers[p.id]);
  const hasSelection = playersToCompare.length > 0;

  const remainingPurse = strategySummary.remainingPurse;
  let purseColorClasses = 'text-green-600';
  if (remainingPurse <= 0) {
    purseColorClasses = 'text-red-600';
  } else if (remainingPurse <= 1000) {
    purseColorClasses = 'text-yellow-600';
  }

  if (loading) {
    return <div className="flex h-screen w-full items-center justify-center bg-gray-900 text-white">Loading...</div>;
  }

  if (accessDenied) {
    return <div className="flex h-screen w-full items-center justify-center bg-gray-900 text-white">Access Denied. You do not have permission to view this page.</div>;
  }

  return (
    <ManagePageLayout>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold">Strategy Room</h1>
          <p className="mt-1 text-gray-500">Plan your auction-winning team.</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-gray-500">Total Purse</div>
              <div className="text-lg font-bold">{fmtCurrency(strategySummary.totalPurse)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Committed</div>
              <div className="text-lg font-bold">{fmtCurrency(strategySummary.committedSpend)}</div>
            </div>
            <div className="text-right">
              <div className={`text-xs font-bold ${purseColorClasses}`}>Remaining</div>
              <div className={`text-lg font-bold ${purseColorClasses}`}>{fmtCurrency(strategySummary.remainingPurse)}</div>
            </div>
          </div>
          <div className="h-10 border-l border-gray-300"></div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-xs text-gray-500">High</div>
              <div className="text-lg font-bold">{strategySummary.interestCounts.high}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Med</div>
              <div className="text-lg font-bold">{strategySummary.interestCounts.medium}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">Low</div>
              <div className="text-lg font-bold">{strategySummary.interestCounts.low}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-gray-500">None</div>
              <div className="text-lg font-bold">{players.length - strategySummary.interestCounts.high - strategySummary.interestCounts.medium - strategySummary.interestCounts.low}</div>
            </div>
            <div className="h-10 border-l border-gray-300"></div>
          </div>

          {profile?.role === 'admin' && teams.length > 0 && (
            <select
              value={selectedTeamId || ''}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="bg-gray-100 border border-gray-300 rounded-md px-3 py-2 text-gray-900"
            >
              {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          )}

        <div className="h-10 border-l border-gray-300"></div>
        <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg border border-pink-50 px-4 py-2 text-sm text-pink-600 bg-pink-50 hover:bg-pink-100">
              <span className="material-symbols-outlined">arrow_back</span>
              <span>Back to Dashboard</span>
            </Link>
        </div>
      </div>
      
      <div className="mt-6 p-4 rounded-lg bg-gray-50 border border-gray-200 grid grid-cols-1 lg:grid-cols-5 gap-4 items-center">
        <div className="relative lg:col-span-2">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
          <input
            type="text"
            placeholder="Search player name..."
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            className="w-full rounded-md border-gray-300 pl-10 pr-4 py-2 focus:border-pink-500 focus:ring-pink-500 h-10"
          />
        </div>
        <MultiSelectDropdown
          placeholder="All Sets"
          options={setOptions.map(s => ({ id: s.id, name: s.name }))}
          selected={filterSetIds}
          onChange={setFilterSetIds}
        />
        <MultiSelectDropdown
          placeholder="All Categories"
          options={allCategories.map(c => ({ id: c, name: c }))}
          selected={filterCategories}
          onChange={setFilterCategories}
        />
        <MultiSelectDropdown
          placeholder="All Interests"
          options={['high', 'medium', 'low', 'none'].map(i => ({ id: i, name: i.charAt(0).toUpperCase() + i.slice(1) }))}
          selected={filterInterests}
          onChange={setFilterInterests}
        />
      </div>

      {hasSelection && (
        <div className="fixed bottom-8 right-8 z-50 flex items-center gap-3">
          <button
            onClick={() => {
              setSelectedPlayers({});
            }}
            className="bg-white text-gray-700 rounded-full px-3 py-3 shadow-lg border border-gray-300 hover:bg-gray-50 transition-all text-sm font-semibold flex items-center gap-2"
            aria-label="Clear selected players"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
          <button
            onClick={() => setCompareModalOpen(true)}
            disabled={playersToCompare.length < 2}
            className="bg-pink-600 text-white rounded-full px-6 py-3 shadow-lg hover:bg-pink-700 transition-all text-lg font-bold flex items-center gap-3 disabled:bg-gray-400 disabled:opacity-80 disabled:hover:opacity-100 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined">compare_arrows</span>
            Compare {playersToCompare.length} Players
          </button>
        </div>
      )}

      <div className="grid gap-6 mt-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {filteredPlayers.map((player) => {
          const strategy = strategies[player.id] || { interest: 'none', max_bid: null, notes: null };
          const interestColors = {
            high: 'bg-green-500/10 border-green-500',
            medium: 'bg-yellow-500/10 border-yellow-500',
            low: 'bg-red-500/10 border-red-500',
            none: 'border-gray-200',
          };
          const photoUrl = player.photo_path
            ? supabase.storage.from('player-photos').getPublicUrl(player.photo_path).data.publicUrl
            : player.photo_url;
          return (
            <div key={player.id} className={`relative rounded-lg border bg-gray-50 p-4 flex flex-col transition-all shadow-sm ${interestColors[strategy.interest]} ${selectedPlayers[player.id] ? 'border-blue-500' : ''}`}>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden">
                  {photoUrl ? (
                    <img src={photoUrl} alt={player.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-4xl text-gray-400">person</span>
                    </div>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight text-gray-900">{player.name}</h3>
                  <p className="text-sm text-gray-500">{player.category || 'N/A'}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-4 gap-y-2 text-left text-sm mb-4">
                {renderMiniStat("Matches", player.matches)}
                {renderMiniStat("Runs", player.runs)}
                {renderMiniStat("SR", player.strike_rate, 1)}
                {renderMiniStat("Avg", player.average, 1)}
                {renderMiniStat("Overs", Math.round(player.overs || 0), 0)}
                {renderMiniStat("Wickets", player.wickets)}
                {renderMiniStat("Econ", player.economy, 2)}
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex gap-2 mt-1 items-center">
                  <label className="text-xs text-gray-500 mr-2">Interest</label>
                    {(['high', 'medium', 'low', 'none'] as const).map(level => (
                      <button
                        key={level}
                        onClick={() => handleStrategyChange(player.id, { interest: level })}
                        className={`w-full text-xs rounded px-2 py-1 transition-colors ${strategy.interest === level ? 'bg-pink-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                      >
                        {level.charAt(0).toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex justify-between gap-4 items-end mt-4">
                    <div className="flex items-center gap-4">
                      <span><label className="text-xs text-gray-500">Max Bid</label></span>
                      <span><input
                        type="number" step="50" min="0" max={strategySummary.totalPurse}
                        placeholder="e.g., 500"
                        value={strategy.max_bid || ''}
                        onChange={(e) =>
                          handleStrategyChange(player.id, {
                            max_bid: e.target.value ? parseInt(e.target.value, 10) : null,
                          })
                        }
                        className="w-[100px] bg-white border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-pink-500 focus:border-pink-500"
                      /></span>
                    </div>
                    <div className="flex items-center gap-4">
                    <span><label className="text-xs text-gray-500">Compare</label></span>
                      <span className="flex items-center">
                        <input
                          type="checkbox"
                          checked={!!selectedPlayers[player.id]}
                          onChange={(e) => handlePlayerSelect(player.id, e.target.checked)}
                          className="h-5 w-5 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                        />
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-4 hidden">
                {/* Notes could be added here in a similar way */}
              </div>
            </div>
          );
        })}
      </div>

      {compareModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col text-gray-900">
            <header className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-bold">Player Comparison</h2>
              <button onClick={() => setCompareModalOpen(false)} className="p-1 rounded-full text-gray-500 hover:bg-gray-100">
                <span className="material-symbols-outlined">close</span>
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-6">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr>
                    <th className="py-3 pr-4 font-semibold w-max"></th>
                    {playersToCompare.map(p => (
                      <th key={p.id} className="px-4 py-3 text-center">
                        <div className="w-20 h-20 mx-auto rounded-full bg-gray-200 overflow-hidden mb-2">
                          {p.photo_path || p.photo_url
                            ? <img src={p.photo_path ? supabase.storage.from('player-photos').getPublicUrl(p.photo_path).data.publicUrl : p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><span className="material-symbols-outlined text-4xl text-gray-400">person</span></div>}
                        </div>
                        <h3 className="font-bold text-base">{p.name}</h3>
                        <p className="text-gray-500 text-xs">{p.category}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-white">
                    <td className="py-3 pr-4 font-semibold w-max"></td>
                    {playersToCompare.map(p => {
                      const strategy = strategies[p.id] || { interest: 'none', max_bid: null, notes: null };
                      return (
                        <td key={p.id} className="px-4 py-3 align-top">
                          <div className="space-y-2">
                            <div>
                              <div className="flex gap-1 mt-1">
                                {(['high', 'medium', 'low', 'none'] as const).map(level => (
                                  <button
                                    key={level}
                                    onClick={() => handleStrategyChange(p.id, { interest: level })}
                                    className={`w-full text-xs rounded px-1.5 py-1 transition-colors ${strategy.interest === level ? 'bg-pink-600 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
                                    title={level.charAt(0).toUpperCase() + level.slice(1)}
                                  >
                                    {level.charAt(0).toUpperCase()}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div>
                              <input
                                type="number" step="50" min="0" max={strategySummary.totalPurse}
                                placeholder="Set max bid"
                                value={strategy.max_bid || ''}
                                onChange={(e) => handleStrategyChange(p.id, { max_bid: e.target.value ? parseInt(e.target.value, 10) : null })}
                                className="w-full bg-white border border-gray-300 rounded-md px-2 py-1 text-sm mt-1 focus:ring-pink-500 focus:border-pink-500"
                              />
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  {renderStatRow("Batting Style", playersToCompare.map(p => p.bat_style), 0)}
                  {renderStatRow("Bowling Style", playersToCompare.map(p => p.bowl_style), 1)}
                  {renderStatRow("Matches", playersToCompare.map(p => p.matches), 0)}
                  {renderStatRow("Runs", playersToCompare.map(p => p.runs), 1)}
                  {renderStatRow("Average", playersToCompare.map(p => p.average), 0)}
                  {renderStatRow("Strike Rate", playersToCompare.map(p => p.strike_rate), 1)}
                  {renderStatRow("Overs", playersToCompare.map(p => p.overs), 0)}
                  {renderStatRow("Wickets", playersToCompare.map(p => p.wickets), 1)}
                  {renderStatRow("Economy", playersToCompare.map(p => p.economy), 0)}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed top-8 right-[calc(50%-160px)] translate-x-[50%] rounded-lg px-4 py-3 text-sm shadow-lg ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.message}
        </div>
      )}
    </ManagePageLayout>
  );
}

const miniLabelMap: Record<string, string> = {
  "Matches": "M",
  "Runs": "R",
  "Wickets": "W",
  "Avg": "A",
  "SR": "SR",
  "Econ": "E",
  "Overs": "O",
};

function renderMiniStat(label: string, value: string | number | undefined | null, digits = 0) {
  const displayValue = (value === undefined || value === null || value === '') ? '–' : Number(value).toFixed(digits);
  const miniLabel = miniLabelMap[label] || label;
  return (
    <div className="px-2 flex-[1_1_60px] whitespace-nowrap">
      <div className="font-semibold text-gray-800"><span className="text-xs text-gray-500">{miniLabel} - </span>{displayValue}</div>
    </div>
  );
}

function renderStatRow(label: string, values: (string | number | undefined | null)[], rowIndex: number) {
  if (values.every(v => v === undefined || v === null || v === '')) return null;
  const bgColor = rowIndex % 2 === 0 ? 'bg-gray-50' : 'bg-white';
  return (
    <tr className={bgColor}>
      <td className="py-3 pr-4 font-semibold text-gray-500 w-max">{label}</td>
      {values.map((value, i) => (
        <td key={i} className="px-4 py-3 text-center font-medium">{value ?? '–'}</td>
      ))}
    </tr>
  );
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
