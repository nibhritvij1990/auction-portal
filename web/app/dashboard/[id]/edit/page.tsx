'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import ImageUploader from '../../../../components/ImageUploader';

export default function EditAuctionPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [basePrice, setBasePrice] = useState<number | ''>('');
  const [totalPurse, setTotalPurse] = useState<number | ''>('');
  const [maxPlayers, setMaxPlayers] = useState<number | ''>('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) { router.replace('/auth/sign-in'); return; }
      const { data, error } = await supabase
        .from('auctions')
        .select('name, auction_date, base_price, total_purse, max_players_per_team, logo_path, logo_url')
        .eq('id', id)
        .single();
      if (!mounted) return;
      if (error) { setError(error.message); setLoading(false); return; }
      setName(data.name);
      setDate(data.auction_date ?? '');
      setBasePrice(data.base_price ?? '');
      setTotalPurse(data.total_purse ?? '');
      setMaxPlayers(data.max_players_per_team ?? '');
      setLogoPath(data.logo_path ?? null);
      setLogoUrl(data.logo_url ?? '');
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [id, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('auctions')
        .update({ name, auction_date: date || null, base_price: toNum(basePrice), total_purse: toNum(totalPurse), max_players_per_team: toNum(maxPlayers), logo_path: logoPath, logo_url: logoPath ? null : (logoUrl || null) })
        .eq('id', id);
      if (error) throw error;
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  const resolvedPreviewUrl = () => {
    if (logoPath) return supabase.storage.from('auction-logos').getPublicUrl(logoPath).data.publicUrl;
    return logoUrl || '';
  };

  if (loading) return <main className="p-6">Loading…</main>;

  return (
    <main className="flex-1 bg-gray-50 py-12">
      <div className="container mx-auto max-w-screen-md px-4 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-3xl font-bold tracking-tight text-gray-900">Edit Auction</h2>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSave} className="space-y-6">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input className="w-full rounded-lg border border-gray-300 px-4 py-2" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
                <input type="date" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={date} onChange={e => setDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Base Price (USD)</label>
                <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={basePrice} onChange={e => setBasePrice(numOrEmpty(e.target.value))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Total Purse (USD)</label>
                <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={totalPurse} onChange={e => setTotalPurse(numOrEmpty(e.target.value))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Max Players per Team</label>
                <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={maxPlayers} onChange={e => setMaxPlayers(numOrEmpty(e.target.value))} />
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
                <input className="w-full rounded-lg border border-gray-300 px-4 py-2" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
                <p className="mt-1 text-xs text-gray-500">If an image is uploaded, it will be used instead of this URL.</p>
              </div>
            </div>
            {(logoPath || logoUrl) && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Preview</label>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolvedPreviewUrl()} alt="Logo preview" className="h-24 object-contain" />
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-3">
              <button disabled={loading} className="rounded-full bg-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-700 disabled:opacity-50">Save</button>
              <button type="button" onClick={() => router.back()} className="rounded-full border border-gray-300 px-6 py-3 text-sm">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

function numOrEmpty(v: string) { return v === '' ? '' : Number(v); }
function toNum(v: number | '') { return v === '' ? null : v; } 