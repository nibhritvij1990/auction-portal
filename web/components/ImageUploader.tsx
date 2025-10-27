"use client";

import { useEffect, useRef, useState } from 'react';
import { uploadWithProgress, deleteFromBucket, isImageFile } from '../lib/imageUpload';

export type ImageUploaderValue = { path?: string | null; url?: string };

export default function ImageUploader({
  bucket,
  label,
  helpText,
  allowSvg = true,
  value,
  onChange,
  deleteOldOnReplace = true,
}: {
  bucket: string;
  label?: string;
  helpText?: string;
  allowSvg?: boolean;
  value: ImageUploaderValue;
  onChange: (next: ImageUploaderValue) => void;
  deleteOldOnReplace?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const previewRevokeRef = useRef<string | null>(null);
  const lastUploadedPathRef = useRef<string | null>(value?.path ?? null);

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
      if (!isImageFile(file, allowSvg)) { setError('Please upload an image file'); return; }
      setError(null);
      if (previewRevokeRef.current) { URL.revokeObjectURL(previewRevokeRef.current); previewRevokeRef.current = null; }
      const local = URL.createObjectURL(file);
      previewRevokeRef.current = local;
      setPreviewUrl(local);
      setUploading(true);
      setProgress(0);
      const baseName = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const result = await uploadWithProgress({
        bucket,
        file,
        filename: baseName,
        allowSvg,
        maxWidth: 512,
        maxHeight: 512,
        quality: 0.85,
        onProgress: setProgress,
      });
      const prev = value?.path || lastUploadedPathRef.current;
      onChange({ path: result.path, url: undefined });
      lastUploadedPathRef.current = result.path;
      if (deleteOldOnReplace && prev && prev !== result.path) {
        try { await deleteFromBucket(bucket, prev); } catch {}
      }
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>) { e.preventDefault(); setDragOver(true); }
  function onDragLeave(e: React.DragEvent<HTMLDivElement>) { e.preventDefault(); setDragOver(false); }
  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) await processAndUpload(f);
  }

  return (
    <div>
      {label && <label className="mb-2 block text-sm font-medium text-gray-700">{label}</label>}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-sm ${dragOver ? 'border-pink-500 bg-pink-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
        onClick={() => document.getElementById('image-uploader-input')?.click()}
      >
        <div className="text-center">
          <div className="mb-2 text-gray-600">Drag & drop an image here, or click to select</div>
          <div className="text-xs text-gray-500">PNG, JPG, WEBP{allowSvg ? ', SVG' : ''}</div>
        </div>
      </div>
      <input id="image-uploader-input" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) processAndUpload(f); }} className="hidden" />
      {uploading && (
        <div className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-200">
          <div className="h-full bg-pink-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {helpText && <p className="mt-1 text-xs text-gray-500">{helpText}</p>}
      {(previewUrl || value?.url) && (
        <div className="mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl || value?.url || ''} alt="preview" className="h-24 object-contain" />
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
} 