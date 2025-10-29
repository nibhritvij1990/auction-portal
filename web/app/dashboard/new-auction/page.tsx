'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '../../../lib/supabaseClient';
import ImageUploader from '../../../components/ImageUploader';

export default function NewAuctionPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [basePrice, setBasePrice] = useState<number | ''>('');
  const [totalPurse, setTotalPurse] = useState<number | ''>('');
  const [maxPlayers, setMaxPlayers] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.push('/auth/sign-in'); return; }
      const { data, error } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', auth.user.id)
        .single();
      if (!mounted) return;
      if (error) {
        setError('No profile found for this user. Link your user to an organization in public.profiles.');
        setOrgId(null);
      } else {
        setOrgId(data?.org_id ?? null);
      }
    })();
    return () => { mounted = false; };
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!orgId) throw new Error('Your user is not linked to an organization (profiles.org_id).');
      const { error } = await supabase
        .from('auctions')
        .insert({
          org_id: orgId,
          name,
          status: 'draft',
          auction_date: date || null,
          base_price: toNum(basePrice),
          total_purse: toNum(totalPurse),
          max_players_per_team: toNum(maxPlayers),
          logo_path: logoPath,
          logo_url: logoPath ? null : (logoUrl || null),
        });
      if (error) throw error;
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const resolvedPreviewUrl = () => {
    if (logoPath) return supabase.storage.from('auction-logos').getPublicUrl(logoPath).data.publicUrl;
    return logoUrl || '';
  };

  return (
    <div className="text-white" style={{ fontFamily: 'Spline Sans, Noto Sans, sans-serif', backgroundColor: '#110f22', height: 'calc(100vh - 79px)' }}>
      <div className="flex h-full overflow-hidden">
        <main className="flex-1 m-2 overflow-hidden min-h-0" style={{ borderRadius: '16px', backgroundColor: 'rgb(249 250 251 / var(--tw-bg-opacity, 1))', zIndex: 1 }}>
          <div className="container mx-auto w-full max-w-screen-md px-4 sm:px-6 lg:px-8 overflow-auto h-full p-6">
            <div className="mb-8 flex items-center justify-between">
              <h2 className="text-3xl font-bold tracking-tight text-gray-900">Create New Auction</h2>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              {!orgId && (
                <p className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Your profile is not linked to an organization. Create a row in public.profiles linking your auth user id to an organization id.
                </p>
              )}
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Auction Name</label>
                  <input className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-pink-500 focus:ring-pink-500" value={name} onChange={e => setName(e.target.value)} required />
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                    <input type="date" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-pink-500 focus:ring-pink-500" value={date} onChange={e => setDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Base Price (USD)</label>
                    <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-pink-500 focus:ring-pink-500" value={basePrice} onChange={e => setBasePrice(numOrEmpty(e.target.value))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Total Purse (USD)</label>
                    <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-pink-500 focus:ring-pink-500" value={totalPurse} onChange={e => setTotalPurse(numOrEmpty(e.target.value))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Max Players per Team</label>
                    <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-pink-500 focus:ring-pink-500" value={maxPlayers} onChange={e => setMaxPlayers(numOrEmpty(e.target.value))} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div>
                    <ImageUploader
                      bucket="auction-logos"
                      label="Logo Upload"
                      helpText="If an image is uploaded, it will be used instead of the URL."
                      allowSvg
                      value={{ path: logoPath ?? undefined, url: resolvedPreviewUrl() }}
                      onChange={(v) => { setLogoPath(v.path ?? null); setLogoUrl(''); }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Logo URL (fallback)</label>
                    <input className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
                    <p className="mt-1 text-xs text-gray-500">If an image is uploaded, it will be used instead of this URL.</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button disabled={loading} className="rounded-full bg-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-700 disabled:opacity-50">{loading ? 'Saving…' : 'Create Auction'}</button>
                  <button type="button" onClick={() => router.back()} className="rounded-full border border-gray-600 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function numOrEmpty(v: string) { return v === '' ? '' : Number(v); }
function toNum(v: number | '') { return v === '' ? null : v; } 