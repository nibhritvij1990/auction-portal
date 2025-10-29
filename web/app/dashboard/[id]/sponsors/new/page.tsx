"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../../lib/useAuthReady';
import ImageUploader from '../../../../../components/ImageUploader';
import ManagePageLayout from '../../../../../components/ManagePageLayout';

export default function NewSponsorPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const { ready, session } = useAuthReady();

  const [name, setName] = useState('');
  const [type, setType] = useState<'title' | 'regular'>('regular');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (p?.role && !(p.role === 'admin' || p.role === 'auctioneer')) {
        router.replace(`/dashboard/${auctionId}/sponsors`);
        return;
      }
    })();
  }, [ready, session, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.from('auction_sponsors').insert({
        auction_id: auctionId,
        name,
        sponsor_type: type,
        logo_path: logoPath,
        logo_url: logoPath ? null : (logoUrl || null),
      });
      if (error) throw error;
      router.replace(`/dashboard/${auctionId}/sponsors`);
    } catch (err: any) {
      setError(err.message || 'Failed to create sponsor');
    } finally {
      setSaving(false);
    }
  }

  const resolvedPreviewUrl = () => {
    if (logoPath) return supabase.storage.from('sponsor-logos').getPublicUrl(logoPath).data.publicUrl;
    return logoUrl || '';
  };

  return (
    <ManagePageLayout>
      <div className="mx-auto max-w-screen-md">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">New Sponsor</h2>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-pink-500 focus:ring-pink-500" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
              <select className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:border-pink-500 focus:ring-pink-500" value={type} onChange={e => setType(e.target.value as any)}>
                <option value="title">Title Sponsor</option>
                <option value="regular">Sponsor</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <ImageUploader
                  bucket="sponsor-logos"
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
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-3">
              <button disabled={saving} className="rounded-full bg-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-700 disabled:opacity-50">{saving ? 'Saving…' : 'Create Sponsor'}</button>
              <button type="button" onClick={() => router.back()} className="rounded-full border border-gray-600 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </ManagePageLayout>
  );
} 