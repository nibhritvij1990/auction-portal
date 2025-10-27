'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../../lib/useAuthReady';
import ImageUploader from '../../../../../components/ImageUploader';

export default function NewPlayerPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const { ready, session } = useAuthReady();

  const [name, setName] = useState('');
  const [basePrice, setBasePrice] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [setLabel, setSetLabel] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [batStyle, setBatStyle] = useState('');
  const [bowlStyle, setBowlStyle] = useState('');
  const [matches, setMatches] = useState<number | ''>('');
  const [runs, setRuns] = useState<number | ''>('');
  const [average, setAverage] = useState<number | ''>('');
  const [strikeRate, setStrikeRate] = useState<number | ''>('');
  const [overs, setOvers] = useState<number | ''>('');
  const [wickets, setWickets] = useState<number | ''>('');
  const [economy, setEconomy] = useState<number | ''>('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (p?.role && !(p.role === 'admin' || p.role === 'auctioneer')) {
        router.replace(`/dashboard/${auctionId}/players`);
        return;
      }
    })();
    return () => { mounted = false; };
  }, [ready, session, router]);

  function resolvedPhotoPreview() {
    if (photoPath) {
      const { data } = supabase.storage.from('player-photos').getPublicUrl(photoPath);
      return data.publicUrl;
    }
    return photoUrl || '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let resolvedSetId: string | null = null;
      const nameTrim = (setLabel || '').trim();
      if (nameTrim) {
        const { data: existing } = await supabase
          .from('auction_sets')
          .select('id')
          .eq('auction_id', auctionId)
          .eq('name', nameTrim)
          .maybeSingle();
        if (existing?.id) {
          resolvedSetId = existing.id;
        } else {
          const { data: inserted, error: insErr } = await supabase
            .from('auction_sets')
            .insert({ auction_id: auctionId, name: nameTrim })
            .select('id')
            .single();
          if (insErr) throw insErr;
          resolvedSetId = inserted.id;
        }
      }
      const { error } = await supabase.from('auction_players').insert({
        auction_id: auctionId,
        name,
        base_price: toNum(basePrice),
        category: category || null,
        set_id: resolvedSetId,
        photo_path: photoPath,
        photo_url: photoPath ? null : (photoUrl || null),
        bat_style: batStyle || null,
        bowl_style: bowlStyle || null,
        matches: toNum(matches),
        runs: toNum(runs),
        average: toNum(average),
        strike_rate: toNum(strikeRate),
        overs: toNum(overs),
        wickets: toNum(wickets),
        economy: toNum(economy),
        notes: notes || null,
      });
      if (error) {
        if ((error as any).code === '23505') {
          throw new Error('A player with this name already exists in this auction.');
        }
        throw error;
      }
      router.push(`/dashboard/${auctionId}/players`);
    } catch (err: any) {
      setError(err.message || 'Failed to create player');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 bg-gray-50 py-12">
      <div className="container mx-auto max-w-screen-md px-4 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-3xl font-bold tracking-tight text-gray-900">New Player</h2>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-pink-500 focus:ring-pink-500" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Base Price (USD)</label>
                <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={basePrice} onChange={e => setBasePrice(numOrEmpty(e.target.value))} />
              </div>
              <div className="hidden" />
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                <input className="w-full rounded-lg border border-gray-300 px-4 py-2" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g., International, Domestic" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Auction Set</label>
                <input className="w-full rounded-lg border border-gray-300 px-4 py-2" value={setLabel} onChange={e => setSetLabel(e.target.value)} placeholder="Type set name (will be created if needed)" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <ImageUploader
                  bucket="player-photos"
                  label="Photo Upload"
                  helpText="If an image is uploaded, it will be used instead of the URL."
                  value={{ path: photoPath ?? undefined, url: resolvedPhotoPreview() }}
                  onChange={(v) => { setPhotoPath(v.path ?? null); setPhotoUrl(''); }}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Photo URL (fallback)</label>
                <input className="w-full rounded-lg border border-gray-300 px-4 py-2" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="https://..." />
                <p className="mt-1 text-xs text-gray-500">If an image is uploaded, it will be used instead of this URL.</p>
              </div>
            </div>
            {(photoPath || photoUrl) && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Preview</label>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolvedPhotoPreview()} alt="Player photo preview" className="h-24 object-contain" />
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-3">
              <button disabled={loading} className="rounded-full bg-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-700 disabled:opacity-50">{loading ? 'Saving…' : 'Create Player'}</button>
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