'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../lib/useAuthReady';
import Link from 'next/link';
import LiquidGlassCard from '../../../../components/LiquidGlassCard';
import ManagePageLayout from '../../../../components/ManagePageLayout';

type Team = {
  id: string;
  name: string;
  purse_total: number | null;
  max_players: number | null;
  logo_path: string | null;
  logo_url: string | null;
};

type Aggregates = Record<string, { players: number; spent: number }>;

export default function TeamsPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const { ready, session } = useAuthReady();

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ role: string } | null>(null);
  const [aggs, setAggs] = useState<Aggregates>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      // profile
      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (mounted && p) setProfile(p);

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

  return (
    <ManagePageLayout>
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
          {(profile?.role === 'admin' || profile?.role === 'auctioneer') && (
            <Link href={`/dashboard/${auctionId}/teams/new`} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-purple-700">
              <span className="material-symbols-outlined">add</span>
              <span>New Team</span>
            </Link>
          )}
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(17.5rem,17.5rem))] justify-start gap-6">
          {loading && (
            <div className="col-span-full rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading…</div>
          )}
          {!loading && teams.map(team => {
            const players = aggs[team.id]?.players ?? 0;
            const spent = aggs[team.id]?.spent ?? 0;
            const balance = (team.purse_total ?? 0) - spent;
            const logo = team.logo_path
              ? supabase.storage.from('team-logos').getPublicUrl(team.logo_path).data.publicUrl
              : (team.logo_url || '');
            return (
              <LiquidGlassCard key={team.id} className="rounded-2xl" size="no-size" style={{ padding: '0rem' }}>
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
                              <img src={logo} alt={team.name} className="h-[95%] w-[95%] object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.18)]" />
                            ) : (
                              <span className="material-symbols-outlined text-6xl">groups</span>
                            )}
                          </div>
                        </div>
                      </LiquidGlassCard>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 text-center mb-2">{team.name}</h3>
                    <div className="text-sm text-gray-900 space-y-2 mt-auto">
                      <p><strong>Players:</strong> {players} {team.max_players ? `/ ${team.max_players}` : ''}</p>
                      <p><strong>Balance Purse:</strong> {fmt(balance)}</p>
                    </div>
                    {(profile?.role === 'admin' || profile?.role === 'auctioneer') && (
                      <div className="flex gap-2 mt-4">
                        <Link href={`/dashboard/${auctionId}/teams/${team.id}/edit`} className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-medium"><span className="material-symbols-outlined text-base">edit</span>Edit</Link>
                        <button onClick={() => handleDelete(team.id)} disabled={deletingId === team.id} className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-red-50/80 hover:bg-red-100 text-red-700 font-medium disabled:opacity-50"><span className="material-symbols-outlined text-base">delete</span>Delete</button>
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
    </ManagePageLayout>
  );
}

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
} 