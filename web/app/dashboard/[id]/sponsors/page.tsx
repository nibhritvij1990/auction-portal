"use client";

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../lib/useAuthReady';
import ManagePageLayout from '../../../../components/ManagePageLayout';
import LiquidGlassCard from '../../../../components/LiquidGlassCard';

type Sponsor = {
  id: string;
  name: string;
  sponsor_type: string;
  logo_path: string | null;
  logo_url: string | null;
  ord: number;
  is_title: boolean;
};

export default function SponsorsPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const { ready, session } = useAuthReady();

  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ role: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }

      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (mounted && p) setProfile(p);

      setLoading(true);
      const [{ data: a }, { data: sp }] = await Promise.all([
        supabase.from('auctions').select('id,name').order('created_at', { ascending: false }),
        supabase.from('auction_sponsors').select('id,name,sponsor_type,logo_path,logo_url,ord').eq('auction_id', auctionId).order('sponsor_type', { ascending: true }).order('ord', { ascending: true }),
      ]);
      if (!mounted) return;
      // setProfileRole((p as any)?.role || 'User'); // This line is removed as per the new_code
      // setAuctionsList((a as any[]) ?? []); // This line is removed as per the new_code
      // setSelectedAuctionId(auctionId); // This line is removed as per the new_code
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

  async function handleDelete(id: string) {
    if (!confirm('Delete this sponsor?')) return;
    try {
      setDeletingId(id);
      await supabase.from('auction_sponsors').delete().eq('id', id).eq('auction_id', auctionId);
      setSponsors(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      console.error('Error deleting sponsor:', error);
    } finally {
      setDeletingId(null);
    }
  }

  function publicLogoUrl(row: Sponsor) {
    if (row.logo_path) return supabase.storage.from('sponsor-logos').getPublicUrl(row.logo_path).data.publicUrl;
    return row.logo_url || '';
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
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Sponsors</h2>
          {(profile?.role === 'admin' || profile?.role === 'auctioneer') && (
            <Link href={`/dashboard/${auctionId}/sponsors/new`} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-purple-700">
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
                {(profile?.role === 'admin' || profile?.role === 'auctioneer') && (
                  <div className="pointer-events-none absolute bottom-2 right-2 z-[9] flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
    </ManagePageLayout>
  );
} 