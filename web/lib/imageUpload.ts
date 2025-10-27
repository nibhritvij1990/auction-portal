import { supabase, SUPABASE_URL } from './supabaseClient';

export type UploadOptions = {
  bucket: string;
  file: File;
  filename: string; // without extension; we will append based on output type
  allowSvg?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0..1 when outputting webp/jpeg
  onProgress?: (percent: number) => void;
};

export type UploadResult = {
  path: string;
  publicUrl: string;
  mimeType: string;
};

export function isImageFile(file: File, allowSvg = true) {
  if (!file || !file.type) return false;
  if (file.type.startsWith('image/')) {
    if (!allowSvg && file.type === 'image/svg+xml') return false;
    return true;
  }
  return false;
}

export async function resizeAndCompress(file: File, maxWidth = 512, maxHeight = 512, quality = 0.85): Promise<{ blob: Blob; mimeType: string; ext: string }> {
  // For SVG or unsupported types, return as-is
  if (file.type === 'image/svg+xml') {
    return { blob: file, mimeType: file.type, ext: 'svg' };
  }
  // Create an image
  const img = await fileToImage(file);
  const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, maxWidth, maxHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  // Draw with high quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
  // Prefer WEBP when available, fallback to PNG
  const preferredType = 'image/webp';
  const mimeType = canvas.toDataURL(preferredType, quality).startsWith(`data:${preferredType}`) ? preferredType : 'image/png';
  const dataUrl = canvas.toDataURL(mimeType, quality);
  const blob = dataURLToBlob(dataUrl);
  const ext = mimeType === 'image/webp' ? 'webp' : 'png';
  return { blob, mimeType, ext };
}

export async function uploadWithProgress(opts: UploadOptions): Promise<UploadResult> {
  const { file, bucket, filename, allowSvg = true, maxWidth = 512, maxHeight = 512, quality = 0.85, onProgress } = opts;
  if (!isImageFile(file, allowSvg)) throw new Error('Please select a valid image file');

  const { blob, mimeType, ext } = await resizeAndCompress(file, maxWidth, maxHeight, quality);
  const session = await supabase.auth.getSession();
  const accessToken = session.data.session?.access_token;
  if (!accessToken) throw new Error('Not authenticated');

  const objectPath = `${filename}.${ext}`;
  const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeURI(objectPath)}`;

  await xhrUpload(url, accessToken, blob, mimeType, onProgress);

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  return { path: objectPath, publicUrl: data.publicUrl, mimeType };
}

export async function deleteFromBucket(bucket: string, path: string): Promise<void> {
  if (!path) return;
  await supabase.storage.from(bucket).remove([path]);
}

function fitWithin(srcW: number, srcH: number, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / srcW, maxH / srcH, 1);
  return { width: Math.round(srcW * ratio), height: Math.round(srcH * ratio) };
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

function dataURLToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const isBase64 = header.indexOf('base64') >= 0;
  const raw = isBase64 ? atob(data) : decodeURIComponent(data);
  const mime = header.substring(header.indexOf(':') + 1, header.indexOf(';'));
  const uInt8Array = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) uInt8Array[i] = raw.charCodeAt(i);
  return new Blob([uInt8Array], { type: mime });
}

function xhrUpload(url: string, accessToken: string, blob: Blob, mimeType: string, onProgress?: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress(percent);
      }
    };
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(xhr.responseText || 'Upload failed'));
        }
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(blob);
  });
} 