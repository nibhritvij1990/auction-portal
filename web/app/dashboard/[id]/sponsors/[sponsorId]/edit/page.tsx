"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../../../lib/useAuthReady';
import { uploadWithProgress, deleteFromBucket, isImageFile } from '../../../../../../lib/imageUpload';

export default function EditSponsorPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const sponsorId = params?.sponsorId as string;
  const { ready, session } = useAuthReady();

  const [name, setName] = useState('');
  const [type, setType] = useState<'title' | 'regular'>('regular');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const previewRevokeRef = useRef<string | null>(null);
  const lastUploadedPathRef = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (p?.role && !(p.role === 'admin' || p.role === 'auctioneer')) {
        router.replace(`/dashboard/${auctionId}/sponsors`);
        return;
      }
      const { data, error } = await supabase
        .from('auction_sponsors')
        .select('name,sponsor_type,logo_path,logo_url')
        .eq('id', sponsorId)
        .eq('auction_id', auctionId)
        .single();
      if (error || !data) { setError(error?.message || 'Not found'); setLoading(false); return; }
      setName(data.name);
      setType(data.sponsor_type as any);
      setLogoPath(data.logo_path ?? null);
      setLogoUrl(data.logo_url ?? '');
      setLoading(false);
    })();
  }, [ready, session, router, sponsorId, auctionId]);

  useEffect(() => {
    return () => {
      if (previewRevokeRef.current) {
        URL.revokeObjectURL(previewRevokeRef.current);
        previewRevokeRef.current = null;
      }
    };
  }, []);

  async function processAndUpload(file: File) {
    try {
      if (!isImageFile(file, true)) { setError('Please upload an image file'); return; }
      setError(null);
      if (previewRevokeRef.current) { URL.revokeObjectURL(previewRevokeRef.current); previewRevokeRef.current = null; }
      const local = URL.createObjectURL(file);
      previewRevokeRef.current = local;
      setPreviewUrl(local);
      setUploading(true);
      setUploadProgress(0);
      const baseName = `${auctionId}_${Date.now()}`;
      const result = await uploadWithProgress({
        bucket: 'sponsor-logos',
        file,
        filename: baseName,
        allowSvg: true,
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.85,
        onProgress: (p) => setUploadProgress(p),
      });
      const prev = logoPath || lastUploadedPathRef.current;
      setLogoPath(result.path);
      lastUploadedPathRef.current = result.path;
      setLogoUrl('');
      if (prev && prev !== result.path) {
        try { await deleteFromBucket('sponsor-logos', prev); } catch {}
      }
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) await processAndUpload(f);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) { e.preventDefault(); setDragOver(true); }
  function onDragLeave(e: React.DragEvent<HTMLDivElement>) { e.preventDefault(); setDragOver(false); }
  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) await processAndUpload(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase
        .from('auction_sponsors')
        .update({ name, sponsor_type: type, logo_path: logoPath, logo_url: logoPath ? null : (logoUrl || null) })
        .eq('id', sponsorId)
        .eq('auction_id', auctionId);
      if (error) throw error;
      router.replace(`/dashboard/${auctionId}/sponsors`);
    } catch (err: any) {
      setError(err.message || 'Failed to save sponsor');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="p-6">Loading…</main>;

  return (
    <main className="flex-1 bg-gray-50 py-12">
      <div className="container mx-auto max-w-screen-md px-4 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-3xl font-bold tracking-tight text-gray-900">Edit Sponsor</h2>
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input className="w-full rounded-lg border border-gray-300 px-4 py-2" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Type</label>
              <select className="w-full rounded-lg border border-gray-300 px-4 py-2" value={type} onChange={e => setType(e.target.value as any)}>
                <option value="title">Title Sponsor</option>
                <option value="regular">Sponsor</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Logo Upload</label>
                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  className={`flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-sm ${dragOver ? 'border-pink-500 bg-pink-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
                  onClick={() => document.getElementById('sponsor-logo-input')?.click()}
                >
                  <div className="text-center">
                    <div className="mb-2 text-gray-600">Drag & drop an image here, or click to select</div>
                    <div className="text-xs text-gray-500">PNG, JPG, WEBP, SVG</div>
                  </div>
                </div>
                <input id="sponsor-logo-input" type="file" accept="image/*" onChange={onFileInputChange} className="hidden" />
                {uploading && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-200">
                    <div className="h-full bg-pink-600 transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Logo URL (fallback)</label>
                <input className="w-full rounded-lg border border-gray-300 px-4 py-2" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
                <p className="mt-1 text-xs text-gray-500">If an image is uploaded, it will be used instead of this URL.</p>
              </div>
            </div>
            {(logoPath || logoUrl || previewUrl) && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Preview</label>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl || (logoPath ? supabase.storage.from('sponsor-logos').getPublicUrl(logoPath).data.publicUrl : logoUrl)} alt="Logo preview" className="h-24 object-contain" />
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