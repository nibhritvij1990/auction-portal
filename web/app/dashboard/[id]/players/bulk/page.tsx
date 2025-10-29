'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import { useAuthReady } from '../../../../../lib/useAuthReady';
import ManagePageLayout from '../../../../../components/ManagePageLayout';

export default function PlayersBulkPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params?.id as string;
  const { ready, session } = useAuthReady();

  const [jsonText, setJsonText] = useState('[\n  {\n    "name": "Player A",\n    "base_price": 500000,\n    "category": "International",\n    "set_id": null,\n    "status": "available",\n    "bat_style": "RHB",\n    "bowl_style": "Right-arm medium",\n    "matches": 12,\n    "runs": 430,\n    "average": 35.83,\n    "strike_rate": 128.50,\n    "overs": 22.5,\n    "wickets": 8,\n    "economy": 7.12,\n    "notes": "—"\n  }\n]');
  const [deleteText, setDeleteText] = useState('[\n  { "id": "<player_id>" }\n]');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [report, setReport] = useState<{ ok: boolean; rows: { index: number; status: 'ok' | 'error'; error?: string }[] } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  // Bulk Images state
  const [imgCsvText, setImgCsvText] = useState('player_name,image_filename\nVirat Kohli,virat.jpg');
  const [imgFiles, setImgFiles] = useState<File[]>([]);
  const [imgMappings, setImgMappings] = useState<{ player_id: string | null; player_name: string; image_filename: string; file?: File; status: 'pending' | 'ok' | 'error'; error?: string; hasExistingPhoto?: boolean }[]>([]);
  const [imgValidating, setImgValidating] = useState(false);
  const [imgUploading, setImgUploading] = useState(false);
  const [imgOnlyFillMissing, setImgOnlyFillMissing] = useState(true);
  const [imgProgress, setImgProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  useEffect(() => {
    (async () => {
      if (!ready) return;
      if (!session?.user) { router.replace('/auth/sign-in'); return; }
      const { data: p } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      if (p?.role && !(p.role === 'admin' || p.role === 'auctioneer')) {
        router.replace(`/dashboard/${auctionId}/players`);
        return;
      }
      // Prefill for edit: read ids from query params
      const sp = new URLSearchParams(window.location.search);
      const ids = (sp.get('ids') || '').split(',').filter(Boolean);
      if (ids.length > 0) {
        const { data } = await supabase
          .from('auction_players')
          .select('id,name,base_price,category,status,set_id,bat_style,bowl_style,matches,runs,average,strike_rate,overs,wickets,economy,notes')
          .eq('auction_id', auctionId)
          .in('id', ids);
        if (data && data.length > 0) {
          setJsonText(JSON.stringify(data, null, 2));
        }
      }
    })();
  }, [ready, session, router]);

  function parseCsv(text: string) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return [] as any[];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map((line) => {
      const cols = line.split(',');
      const row: any = {};
      headers.forEach((h, i) => { row[h] = cols[i] !== undefined ? cols[i].trim() : ''; });
      return row;
    });
  }

  function toCsv(rows: any[]) {
    if (!rows || rows.length === 0) return '';
    const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
    const head = headers.join(',');
    const body = rows.map(r => headers.map(h => r[h] ?? '').join(',')).join('\n');
    return `${head}\n${body}`;
  }

  function validateRow(p: any): string | null {
    if (!p || !p.name) return 'Missing name';
    if (p.base_price != null && isNaN(Number(p.base_price))) return 'Invalid base_price';
    if (p.matches != null && isNaN(Number(p.matches))) return 'Invalid matches';
    if (p.runs != null && isNaN(Number(p.runs))) return 'Invalid runs';
    if (p.average != null && isNaN(Number(p.average))) return 'Invalid average';
    if (p.strike_rate != null && isNaN(Number(p.strike_rate))) return 'Invalid strike_rate';
    if (p.overs != null && isNaN(Number(p.overs))) return 'Invalid overs';
    if (p.wickets != null && isNaN(Number(p.wickets))) return 'Invalid wickets';
    if (p.economy != null && isNaN(Number(p.economy))) return 'Invalid economy';
    return null;
  }

  async function handleUpsert() {
    setLoading(true);
    setMessage(null);
    setReport(null);
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error('JSON must be an array of objects');
      // Build set name -> id map for this auction to allow set_name usage
      const { data: sets } = await supabase
        .from('auction_sets')
        .select('id,name')
        .eq('auction_id', auctionId);
      const setNameToId = new Map<string, string>();
      (sets as any[] | null)?.forEach(s => setNameToId.set(String(s.name || '').trim().toLowerCase(), s.id));
      // Auto-create missing sets from set_name
      const nameKey = (s: string) => String(s || '').trim().toLowerCase();
      const missingNameKeyToOriginal = new Map<string, string>();
      for (const p of parsed) {
        const rawSetId = p?.set_id ? String(p.set_id) : '';
        const rawSetName = p?.set_name ? String(p.set_name) : '';
        if (!rawSetId && rawSetName) {
          const key = nameKey(rawSetName);
          if (key && !setNameToId.has(key)) missingNameKeyToOriginal.set(key, rawSetName.trim());
        }
      }
      if (missingNameKeyToOriginal.size > 0) {
        const toInsert = Array.from(missingNameKeyToOriginal.values()).map(n => ({ auction_id: auctionId, name: n }));
        const { data: inserted } = await supabase
          .from('auction_sets')
          .insert(toInsert)
          .select('id,name');
        (inserted as any[] | null)?.forEach(row => {
          const key = nameKey(row.name);
          if (key) setNameToId.set(key, row.id);
        });
      }
      const rowReports: { index: number; status: 'ok' | 'error'; error?: string }[] = [];
      const rows = parsed.map((p: any, idx: number) => {
        const err = validateRow(p);
        if (err) rowReports.push({ index: idx, status: 'error', error: err }); else rowReports.push({ index: idx, status: 'ok' });
        const rawSetId = p.set_id ? String(p.set_id) : '';
        const rawSetName = p.set_name ? String(p.set_name) : '';
        const mappedSetId = rawSetId || (rawSetName ? (setNameToId.get(rawSetName.trim().toLowerCase()) || null) : null);
        return {
          auction_id: auctionId,
          name: String(p.name),
          base_price: toNum(p.base_price ?? null),
          category: p.category ? String(p.category) : null,
          status: p.status ? String(p.status) : undefined,
          set_id: mappedSetId,
          bat_style: p.bat_style ? String(p.bat_style) : null,
          bowl_style: p.bowl_style ? String(p.bowl_style) : null,
          matches: toNum(p.matches),
          runs: toNum(p.runs),
          average: toNum(p.average),
          strike_rate: toNum(p.strike_rate),
          overs: toNum(p.overs),
          wickets: toNum(p.wickets),
          economy: toNum(p.economy),
          notes: p.notes ? String(p.notes) : null,
        };
      });
      const { error } = await supabase
        .from('auction_players')
        .upsert(rows, { onConflict: 'auction_id,name' });
      if (error) throw error;
      setMessage('Upsert successful');
      setReport({ ok: rowReports.every(r => r.status === 'ok'), rows: rowReports });
    } catch (e: any) {
      setMessage(e.message || 'Failed to upsert');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    setMessage(null);
    try {
      const parsed = JSON.parse(deleteText);
      if (!Array.isArray(parsed)) throw new Error('JSON must be an array of objects');
      // Prefer delete by id if provided, else by name+auction_id
      const ids: string[] = parsed.filter((p: any) => p.id).map((p: any) => String(p.id));
      const names: string[] = parsed.filter((p: any) => !p.id && p.name).map((p: any) => String(p.name));
      if (ids.length > 0) {
        const { error } = await supabase.from('auction_players').delete().in('id', ids).eq('auction_id', auctionId);
        if (error) throw error;
      }
      if (names.length > 0) {
        for (const name of names) {
          const { error } = await supabase.from('auction_players').delete().eq('auction_id', auctionId).eq('name', name);
          if (error) throw error;
        }
      }
      setMessage('Delete successful');
    } catch (e: any) {
      setMessage(e.message || 'Failed to delete');
    } finally {
      setLoading(false);
    }
  }

  // -------------------- Bulk Images Helpers --------------------
  function normalizeName(s: string) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function normalizeFilename(s: string) {
    return String(s || '').trim().toLowerCase();
  }

  function parseImageCsv(text: string): { player_name: string; image_filename: string }[] {
    const rows = parseCsv(text);
    return rows
      .map((r: any) => ({ player_name: String(r.player_name || r.name || ''), image_filename: String(r.image_filename || r.filename || '') }))
      .filter(r => r.player_name && r.image_filename);
  }

  async function validateImageMappings() {
    setImgValidating(true);
    try {
      const rows = parseImageCsv(imgCsvText);
      // Build filename -> File map
      const fileMap = new Map<string, File>();
      for (const f of imgFiles) fileMap.set(normalizeFilename(f.name), f);
      // Fetch players for this auction with existing photo state
      const { data: players } = await supabase
        .from('auction_players')
        .select('id,name,photo_path,photo_url')
        .eq('auction_id', auctionId)
        .limit(2000);
      const nameToPlayer = new Map<string, { id: string; name: string; hasExistingPhoto: boolean }>();
      (players as any[] | null)?.forEach(p => {
        nameToPlayer.set(normalizeName(p.name), { id: p.id, name: p.name, hasExistingPhoto: Boolean(p.photo_path || p.photo_url) });
      });
      const mapped = rows.map((r) => {
        const key = normalizeName(r.player_name);
        const p = nameToPlayer.get(key) || null;
        const fname = normalizeFilename(r.image_filename);
        const file = fileMap.get(fname);
        let status: 'pending' | 'ok' | 'error' = 'pending';
        let error: string | undefined;
        if (!p) { status = 'error'; error = 'Player not found'; }
        else if (!file) { status = 'error'; error = 'File not selected'; }
        else if (imgOnlyFillMissing && p.hasExistingPhoto) { status = 'error'; error = 'Photo exists (overwrite disabled)'; }
        else { status = 'ok'; }
        return { player_id: p?.id || null, player_name: r.player_name, image_filename: r.image_filename, file, status, error, hasExistingPhoto: p?.hasExistingPhoto };
      });
      setImgMappings(mapped);
    } finally {
      setImgValidating(false);
    }
  }

  async function uploadImageForMapping(map: { player_id: string; file: File; image_filename: string }) {
    // resize/compress
    const { blob, contentType, outExt } = await compressImage(map.file, { maxSide: 1024, quality: 0.82 });
    const path = `${auctionId}/${map.player_id}.${outExt}`;
    const { error: upErr } = await supabase.storage.from('player-photos').upload(path, blob, { upsert: true, contentType, cacheControl: '3600' });
    if (upErr) throw upErr;
    const { error: dbErr } = await supabase
      .from('auction_players')
      .update({ photo_path: path, photo_url: null })
      .eq('id', map.player_id)
      .eq('auction_id', auctionId);
    if (dbErr) throw dbErr;
  }

  async function compressImage(file: File, opts: { maxSide: number; quality: number }): Promise<{ blob: Blob; contentType: string; outExt: string }> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, opts.maxSide / Math.max(bitmap.width, bitmap.height));
    const targetW = Math.max(1, Math.round(bitmap.width * scale));
    const targetH = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetW; canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob: file, contentType: file.type || 'application/octet-stream', outExt: (file.name.split('.').pop() || 'jpg').toLowerCase() };
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    // Prefer WebP; fallback to JPEG if unsupported
    const tryTypes: { type: string; ext: string }[] = [ { type: 'image/webp', ext: 'webp' }, { type: 'image/jpeg', ext: 'jpg' } ];
    for (const t of tryTypes) {
      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(b => resolve(b), t.type, opts.quality));
      if (blob) return { blob, contentType: t.type, outExt: t.ext };
    }
    // last resort: original file
    return { blob: file, contentType: file.type || 'application/octet-stream', outExt: (file.name.split('.').pop() || 'jpg').toLowerCase() };
  }

  async function handleBulkImageUpload() {
    setImgUploading(true);
    setMessage(null);
    try {
      const ready = imgMappings.filter(m => m.status === 'ok' && m.player_id && m.file) as any[];
      setImgProgress({ done: 0, total: ready.length });
      const concurrency = 4;
      let idx = 0;
      const runNext = async () => {
        if (idx >= ready.length) return;
        const current = ready[idx++];
        try {
          await uploadImageForMapping({ player_id: current.player_id, file: current.file, image_filename: current.image_filename });
          setImgMappings(prev => prev.map(m => (m.player_id === current.player_id ? { ...m, status: 'ok', error: undefined } : m)));
        } catch (e: any) {
          setImgMappings(prev => prev.map(m => (m.player_id === current.player_id ? { ...m, status: 'error', error: e?.message || 'Upload failed' } : m)));
        } finally {
          setImgProgress(prev => ({ done: prev.done + 1, total: prev.total }));
          await runNext();
        }
      };
      const starters = Array.from({ length: Math.min(concurrency, ready.length) }, () => runNext());
      await Promise.all(starters);
      setMessage('Bulk image upload complete');
    } catch (e: any) {
      setMessage(e?.message || 'Bulk image upload failed');
    } finally {
      setImgUploading(false);
    }
  }

  return (
    <ManagePageLayout>
      <div className="space-y-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900">Players Bulk Operations</h2>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Bulk Add/Edit */}
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <h3 className="mb-3 text-lg font-semibold text-gray-800">Bulk Add/Edit (Upsert)</h3>
            <p className="mb-4 text-sm text-gray-600">Upload JSON or CSV. CSV headers supported: name, base_price, category, status, set_id, set_name, bat_style, bowl_style, matches, runs, average, strike_rate, overs, wickets, economy, notes. If set_id is not provided, set_name will be mapped automatically.</p>
            <div className="mb-3 flex items-center gap-3">
              <label className="cursor-pointer rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                <input type="file" accept=".csv" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0]; if (!f) return; const text = await f.text();
                  const rows = parseCsv(text);
                  setJsonText(JSON.stringify(rows, null, 2));
                }} />
                Import CSV
              </label>
              <button onClick={async () => {
                const parsed = JSON.parse(jsonText);
                const csv = toCsv(Array.isArray(parsed) ? parsed : []);
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = `players_${auctionId}.csv`; a.click(); URL.revokeObjectURL(url);
              }} className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Export CSV</button>
            </div>
            <textarea className="h-64 w-full rounded-lg border border-gray-300 p-3 font-mono text-sm text-gray-900 focus:border-pink-500 focus:ring-pink-500" value={jsonText} onChange={e => setJsonText(e.target.value)} />
            <div className="mt-4 flex items-center gap-3">
              <button onClick={handleUpsert} disabled={loading} className="rounded-full bg-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-700 disabled:opacity-50">{loading ? 'Working…' : 'Upsert Players'}</button>
              <button onClick={async () => {
                const { data } = await supabase
                  .from('auction_players')
                  .select('id,name,base_price,category,status,set_id,bat_style,bowl_style,matches,runs,average,strike_rate,overs,wickets,economy,notes')
                  .eq('auction_id', auctionId)
                  .order('created_at', { ascending: false });
                setJsonText(JSON.stringify(data ?? [], null, 2));
              }} className="rounded-full border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50">Export All as JSON</button>
            </div>
            {report && (() => {
              const total = report.rows.length;
              const errors = report.rows.filter(r => r.status === 'error').length;
              const oks = total - errors;
              return (
                <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="font-semibold text-gray-800">Validation Report</div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">OK: {oks}</span>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">Errors: {errors}</span>
                      <button type="button" onClick={() => setReportOpen(s => !s)} className="rounded-md border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-100">
                        {reportOpen ? 'Hide' : 'Details'}
                      </button>
                    </div>
                  </div>
                  {reportOpen && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {report.rows.map((r, idx) => (
                        <li key={idx} className={r.status === 'ok' ? 'text-green-700' : 'text-red-700'}>
                          Row {r.index + 1}: {r.status === 'ok' ? 'OK' : r.error}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}
          </div>
          
          {/* Bulk Delete */}
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
            <h3 className="mb-3 text-lg font-semibold text-gray-800">Bulk Delete</h3>
            <p className="mb-4 text-sm text-gray-600">Provide a JSON array with either an `id` or `name` for each player to delete.</p>
            <textarea className="h-64 w-full rounded-lg border border-gray-300 p-3 font-mono text-sm text-gray-900 focus:border-pink-500 focus:ring-pink-500" value={deleteText} onChange={e => setDeleteText(e.target.value)} />
            <div className="mt-4 flex items-center gap-3">
              <button onClick={handleDelete} disabled={loading} className="rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-50">{loading ? 'Working…' : 'Delete Players'}</button>
              <button onClick={() => { setDeleteText('[\n  { "id": "<player_id>" }\n]'); }} className="rounded-full border border-gray-600 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50">Reset</button>
            </div>
          </div>
        </div>

        {/* Bulk Images */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h3 className="mb-1 text-lg font-semibold text-gray-800">Bulk Images (CSV + Files)</h3>
          <p className="mb-4 text-sm text-gray-600">Provide a CSV with headers: <code>player_name,image_filename</code>. Then select all image files. We will validate and upload to storage, updating each player's photo.</p>
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <label className="cursor-pointer rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <input type="file" accept=".csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const text = await f.text(); setImgCsvText(text); }} />
              Import mapping CSV
            </label>
            <label className="cursor-pointer rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <input multiple type="file" accept="image/*" className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); setImgFiles(files); }} />
              Select images ({imgFiles.length} selected)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500" checked={imgOnlyFillMissing} onChange={(e) => setImgOnlyFillMissing(e.target.checked)} />
              Only fill missing (do not overwrite existing)
            </label>
          </div>
          <textarea className="h-40 w-full rounded-lg border border-gray-300 p-3 font-mono text-sm text-gray-900 focus:border-pink-500 focus:ring-pink-500" value={imgCsvText} onChange={e => setImgCsvText(e.target.value)} />
          <div className="mt-4 flex items-center gap-3">
            <button onClick={validateImageMappings} disabled={imgValidating} className="rounded-full bg-pink-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-pink-700 disabled:opacity-50">{imgValidating ? 'Validating…' : 'Validate Mappings'}</button>
            <button onClick={handleBulkImageUpload} disabled={imgUploading || imgMappings.filter(m => m.status === 'ok').length === 0} className="rounded-full bg-green-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-green-700 disabled:opacity-50">{imgUploading ? `Uploading ${imgProgress.done}/${imgProgress.total}…` : `Upload ${imgMappings.filter(m => m.status === 'ok').length} Images`}</button>
          </div>
          {imgMappings.length > 0 && (
            <div className="mt-4 overflow-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">Player</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">Filename</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {imgMappings.map((m, i) => (
                    <tr key={i} className={m.status === 'error' ? 'bg-red-50' : ''}>
                      <td className="px-4 py-2 text-gray-800">{m.player_name}</td>
                      <td className="px-4 py-2 text-gray-600">{m.image_filename}</td>
                      <td className="px-4 py-2">
                        {m.status === 'ok' && <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">Ready</span>}
                        {m.status === 'pending' && <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">Pending</span>}
                        {m.status === 'error' && <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">Error</span>}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">{m.error || (m.hasExistingPhoto && imgOnlyFillMissing ? 'Has existing photo' : '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {message && <div className="rounded-lg bg-blue-50 p-4 text-center text-sm text-blue-800">{message}</div>}
      </div>
    </ManagePageLayout>
  );
}

function toNum(v: any) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
} 