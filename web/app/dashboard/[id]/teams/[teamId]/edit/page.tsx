'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../../../lib/useAuthReady';
import ImageUploader from '../../../../../../components/ImageUploader';

export default function EditTeamPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const teamId = params?.teamId as string;
  const { ready, session } = useAuthReady();

  const [name, setName] = useState('');
  const [purseTotal, setPurseTotal] = useState<number | ''>('');
  const [maxPlayers, setMaxPlayers] = useState<number | ''>('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (p?.role && !(p.role === 'admin' || p.role === 'auctioneer')) {
        router.replace(`/dashboard/${auctionId}/teams`);
        return;
      }
      const { data, error } = await supabase
        .from('teams')
        .select('name,purse_total,max_players,logo_path,logo_url')
        .eq('id', teamId)
        .eq('auction_id', auctionId)
        .single();
      if (!mounted) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setName(data.name);
      setPurseTotal(data.purse_total ?? '');
      setMaxPlayers(data.max_players ?? '');
      setLogoPath(data.logo_path ?? null);
      setLogoUrl(data.logo_url ?? '');
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [ready, session, teamId, auctionId, router]);

  function resolvedLogoPreview() {
    if (logoPath) {
      const { data } = supabase.storage.from('team-logos').getPublicUrl(logoPath);
      return data.publicUrl;
    }
    return logoUrl || '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('teams')
        .update({
          name,
          purse_total: toNum(purseTotal),
          max_players: toNum(maxPlayers),
          logo_path: logoPath,
          logo_url: logoPath ? null : (logoUrl || null),
        })
        .eq('id', teamId)
        .eq('auction_id', auctionId);
      if (error) {
        if ((error as any).code === '23505') {
          throw new Error('A team with this name already exists in this auction.');
        }
        throw error;
      }
      router.push(`/dashboard/${auctionId}/teams`);
    } catch (err: any) {
      setError(err.message || 'Failed to save team');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="p-6">Loading…</main>;

  return (
    <main className="flex-1 bg-gray-50 py-12">
      <div className="container mx-auto max-w-screen-md px-4 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-3xl font-bold tracking-tight text-gray-900">Edit Team</h2>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Team Name</label>
              <input className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:ring-pink-500" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Purse Total (USD)</label>
                <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={purseTotal} onChange={e => setPurseTotal(numOrEmpty(e.target.value))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Max Players</label>
                <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={maxPlayers} onChange={e => setMaxPlayers(numOrEmpty(e.target.value))} />
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
                <input className="w-full rounded-lg border border-gray-300 px-4 py-2" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
                <p className="mt-1 text-xs text-gray-500">If an image is uploaded, it will be used instead of this URL.</p>
              </div>
            </div>
            {(logoPath || logoUrl) && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Preview</label>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolvedLogoPreview()} alt="Logo preview" className="h-24 object-contain" />
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-3">
              <button disabled={saving} className="rounded-lg bg-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-purple-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
              <button type="button" onClick={() => router.back()} className="rounded-lg border border-gray-300 px-6 py-3 text-sm">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

function numOrEmpty(v: string) { return v === '' ? '' : Number(v); }
function toNum(v: number | '') { return v === '' ? null : v; } 