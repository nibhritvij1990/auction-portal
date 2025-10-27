'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../../../lib/useAuthReady';
import ImageUploader from '../../../../../../components/ImageUploader';

export default function EditPlayerPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const playerId = params?.playerId as string;
  const { ready, session } = useAuthReady();

  const [name, setName] = useState('');
  const [basePrice, setBasePrice] = useState<number | ''>('');
  const [category, setCategory] = useState('');
  const [setLabel, setSetLabel] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      const { data, error } = await supabase
        .from('auction_players')
        .select('name, base_price, category, set_id, photo_path, photo_url, bat_style, bowl_style, matches, runs, average, strike_rate, overs, wickets, economy, notes')
        .eq('id', playerId)
        .eq('auction_id', auctionId)
        .single();
      if (!mounted) return;
      if (error || !data) { setError(error?.message || 'Not found'); setLoading(false); return; }
      setName(data.name);
      setBasePrice(data.base_price ?? '');
      if (data.set_id) {
        const { data: s } = await supabase.from('auction_sets').select('name').eq('id', data.set_id).single();
        setSetLabel(s?.name ?? '');
      } else {
        setSetLabel('');
      }
      setPhotoPath(data.photo_path ?? null);
      setPhotoUrl(data.photo_url ?? '');
      setBatStyle((data as any).bat_style ?? '');
      setBowlStyle((data as any).bowl_style ?? '');
      setMatches((data as any).matches ?? '');
      setRuns((data as any).runs ?? '');
      setAverage((data as any).average ?? '');
      setStrikeRate((data as any).strike_rate ?? '');
      setOvers((data as any).overs ?? '');
      setWickets((data as any).wickets ?? '');
      setEconomy((data as any).economy ?? '');
      setNotes((data as any).notes ?? '');
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [ready, session, playerId, auctionId, router]);

  function resolvedPhotoPreview() {
    if (photoPath) {
      const { data } = supabase.storage.from('player-photos').getPublicUrl(photoPath);
      return data.publicUrl;
    }
    return photoUrl || '';
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
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
      const { error } = await supabase
        .from('auction_players')
        .update({ name, base_price: toNum(basePrice), category: category || null, set_id: resolvedSetId, photo_path: photoPath, photo_url: photoPath ? null : (photoUrl || null), bat_style: batStyle || null, bowl_style: bowlStyle || null, matches: toNum(matches), runs: toNum(runs), average: toNum(average), strike_rate: toNum(strikeRate), overs: toNum(overs), wickets: toNum(wickets), economy: toNum(economy), notes: notes || null })
        .eq('id', playerId)
        .eq('auction_id', auctionId);
      if (error) {
        if ((error as any).code === '23505') {
          throw new Error('A player with this name already exists in this auction.');
        }
        throw error;
      }
      router.push(`/dashboard/${auctionId}/players`);
    } catch (err: any) {
      setError(err.message || 'Failed to save player');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="p-6">Loading…</main>;

  return (
    <main className="flex-1 bg-gray-50 py-12">
      <div className="container mx-auto max-w-screen-md px-4 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-3xl font-bold tracking-tight text-gray-900">Edit Player</h2>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input className="w-full rounded-lg border border-gray-300 px-4 py-2" value={name} onChange={e => setName(e.target.value)} required />
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
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Batting Style</label>
                <input className="w-full rounded-lg border border-gray-300 px-4 py-2" value={batStyle} onChange={e => setBatStyle(e.target.value)} placeholder="e.g., RHB, LHB" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Bowling Style</label>
                <input className="w-full rounded-lg border border-gray-300 px-4 py-2" value={bowlStyle} onChange={e => setBowlStyle(e.target.value)} placeholder="e.g., Right-arm medium" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Matches</label>
                <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={matches} onChange={e => setMatches(numOrEmpty(e.target.value))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Runs</label>
                <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={runs} onChange={e => setRuns(numOrEmpty(e.target.value))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Wickets</label>
                <input type="number" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={wickets} onChange={e => setWickets(numOrEmpty(e.target.value))} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Average</label>
                <input type="number" step="0.01" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={average} onChange={e => setAverage(numOrEmpty(e.target.value))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Strike Rate</label>
                <input type="number" step="0.01" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={strikeRate} onChange={e => setStrikeRate(numOrEmpty(e.target.value))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Economy</label>
                <input type="number" step="0.01" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={economy} onChange={e => setEconomy(numOrEmpty(e.target.value))} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Overs</label>
                <input type="number" step="0.1" className="w-full rounded-lg border border-gray-300 px-4 py-2" value={overs} onChange={e => setOvers(numOrEmpty(e.target.value))} />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <textarea className="w-full rounded-lg border border-gray-300 px-4 py-2" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes or bio" />
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