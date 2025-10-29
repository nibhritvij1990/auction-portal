'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../../lib/useAuthReady';
import ImageUploader from '../../../../../components/ImageUploader';
import ManagePageLayout from '../../../../../components/ManagePageLayout';

export default function NewTeamPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const { ready, session } = useAuthReady();

  const [orgId, setOrgId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [purseTotal, setPurseTotal] = useState<number | ''>('');
  const [maxPlayers, setMaxPlayers] = useState<number | ''>('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      const { data: p } = await supabase.from('profiles').select('role, org_id').eq('id', session.user.id).single();
      if (p?.role && !(p.role === 'admin' || p.role === 'auctioneer')) {
        router.replace(`/dashboard/${auctionId}/teams`);
        return;
      }
      if (!mounted) return;
      setOrgId(p?.org_id ?? null);
      // Prefill defaults from auction schema
      const { data: a } = await supabase
        .from('auctions')
        .select('total_purse,max_players_per_team')
        .eq('id', auctionId)
        .maybeSingle();
      if (!mounted) return;
      if (a) {
        const tp = (a as any)?.total_purse;
        const mp = (a as any)?.max_players_per_team;
        setPurseTotal(tp != null ? Number(tp) : '');
        setMaxPlayers(mp != null ? Number(mp) : '');
      }
    })();
    return () => { mounted = false; };
  }, [ready, session, router]);

  function resolvedLogoPreview() {
    if (logoPath) {
      const { data } = supabase.storage.from('team-logos').getPublicUrl(logoPath);
      return data.publicUrl;
    }
    return logoUrl || '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!orgId) throw new Error('Your user is not linked to an organization (profiles.org_id).');
      const purseTotalNum = toNum(purseTotal);
      const { error } = await supabase.from('teams').insert({
        org_id: orgId,
        auction_id: auctionId,
        name,
        purse_total: purseTotalNum,
        purse_remaining: purseTotalNum,
        max_players: toNum(maxPlayers),
        logo_path: logoPath,
        logo_url: logoPath ? null : (logoUrl || null),
      });
      if (error) {
        if ((error as any).code === '23505') {
          throw new Error('A team with this name already exists in this auction.');
        }
        throw error;
      }
      router.push(`/dashboard/${auctionId}/teams`);
    } catch (err: any) {
      setError(err.message || 'Failed to create team');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ManagePageLayout>
      <div className="mx-auto max-w-screen-md">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">New Team</h2>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          {!orgId && (
            <p className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Your profile is not linked to an organization. Add a row in public.profiles for your auth user.</p>
          )}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Team Name</label>
              <input className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-pink-500 focus:ring-pink-500" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Purse Total (USD)</label>
                <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900" value={purseTotal} onChange={e => setPurseTotal(numOrEmpty(e.target.value))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Max Players</label>
                <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900" value={maxPlayers} onChange={e => setMaxPlayers(numOrEmpty(e.target.value))} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <ImageUploader
                  bucket="team-logos"
                  label="Logo Upload"
                  helpText="If an image is uploaded, it will be used instead of the URL."
                  allowSvg
                  value={{ path: logoPath ?? undefined, url: resolvedLogoPreview() }}
                  onChange={(v) => { setLogoPath(v.path ?? null); setLogoUrl(''); }}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Logo URL (fallback)</label>
                <input className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
                <p className="mt-1 text-xs text-gray-500">If an image is uploaded, it will be used instead of this URL.</p>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-3">
              <button disabled={loading} className="rounded-full bg-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-700 disabled:opacity-50">{loading ? 'Saving…' : 'Create Team'}</button>
              <button type="button" onClick={() => router.back()} className="rounded-full border border-gray-600 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </ManagePageLayout>
  );
}

function numOrEmpty(v: string) { return v === '' ? '' : Number(v); }
function toNum(v: number | '') { return v === '' ? null : v; } 