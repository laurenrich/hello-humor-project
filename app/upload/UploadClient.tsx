'use client';

import { useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

const BASE_URL = 'https://api.almostcrackd.ai';

const SUPPORTED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function normalizeContentType(file: File): { contentType: string; note?: string } {
  const raw = (file.type || '').toLowerCase();
  if (raw === 'image/jpg') return { contentType: 'image/jpeg', note: 'normalized from image/jpg' };
  if (raw === 'image/x-png') return { contentType: 'image/png', note: 'normalized from image/x-png' };
  if (SUPPORTED_TYPES.has(raw)) return { contentType: raw };

  const name = (file.name || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() : '';
  if (ext === 'jpg' || ext === 'jpeg') return { contentType: 'image/jpeg', note: `inferred from .${ext}` };
  if (ext === 'png') return { contentType: 'image/png', note: 'inferred from .png' };
  if (ext === 'gif') return { contentType: 'image/gif', note: 'inferred from .gif' };
  if (ext === 'webp') return { contentType: 'image/webp', note: 'inferred from .webp' };

  return { contentType: raw };
}

async function reencodeToJpeg(input: Blob): Promise<Blob> {
  const url = URL.createObjectURL(input);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Unable to decode image for re-encode.'));
      el.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported.');
    ctx.drawImage(img, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Unable to encode JPEG.'))),
        'image/jpeg',
        0.92,
      );
    });

    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type PipelineStep = 'idle' | 'presign' | 'upload' | 'register' | 'caption' | 'done' | 'error';

type PresignResponse = {
  presignedUrl: string;
  cdnUrl: string;
};

type RegisterResponse = {
  imageId: string;
  now?: number;
};

type GeneratedCaptionRecord = Record<string, unknown> & {
  content?: unknown;
  caption?: unknown;
};

async function readJson(res: Response): Promise<unknown> {
  return await res.json().catch(() => null);
}

export default function UploadClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<PipelineStep>('idle');
  const [error, setError] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [captions, setCaptions] = useState<GeneratedCaptionRecord[] | null>(null);
  const [dragActive, setDragActive] = useState(false);

  function reset() {
    setStep('idle');
    setError(null);
    setCaptions(null);
  }

  function setPickedFile(f: File | null) {
    reset();
    setFile(f);

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);

    // Allow selecting the same file again (many browsers don't fire onChange otherwise).
    if (inputRef.current) inputRef.current.value = '';
  }

  async function getJwt(): Promise<string> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message || 'Unable to read auth session.');
    const token = data.session?.access_token;
    if (!token) throw new Error('Not authenticated.');
    return token;
  }

  async function runPipeline() {
    setError(null);
    setCaptions(null);

    if (!file) {
      setError('Choose an image first.');
      return;
    }

    const normalized = normalizeContentType(file);
    let contentType = normalized.contentType;
    let uploadBody: Blob = file;

    // Some “PNG” files (or PNG variants) fail server-side decoding.
    // Re-encoding in-browser ensures bytes match a supported format.
    if (contentType === 'image/png') {
      try {
        uploadBody = await reencodeToJpeg(file);
        contentType = 'image/jpeg';
      } catch {
        // If re-encode fails, fall back to original bytes/type.
        uploadBody = file;
        contentType = normalized.contentType;
      }
    }

    if (!SUPPORTED_TYPES.has(contentType)) {
      setError(
        `Unsupported file type: ${contentType || '(unknown)'}. Please use PNG, JPEG, GIF, or WEBP.`,
      );
      return;
    }

    const jwt = await getJwt();

    try {
      setStep('presign');
      const presignRes = await fetch(`${BASE_URL}/pipeline/generate-presigned-url`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${jwt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ contentType }),
      });

      if (!presignRes.ok) {
        const payload = await readJson(presignRes);
        throw new Error(
          `Presign failed (${presignRes.status}): ${JSON.stringify(payload)}`,
        );
      }

      const presignPayload = (await presignRes.json()) as PresignResponse;
      if (!presignPayload?.presignedUrl || !presignPayload?.cdnUrl) {
        throw new Error('Presign response missing presignedUrl/cdnUrl.');
      }

      setStep('upload');
      const uploadRes = await fetch(presignPayload.presignedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: uploadBody,
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text().catch(() => '');
        throw new Error(
          `Upload failed (${uploadRes.status}). ${text ? `Body: ${text}` : ''}`.trim(),
        );
      }

      setStep('register');
      const registerRes = await fetch(`${BASE_URL}/pipeline/upload-image-from-url`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${jwt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ imageUrl: presignPayload.cdnUrl, isCommonUse: false }),
      });

      if (!registerRes.ok) {
        const payload = await readJson(registerRes);
        throw new Error(
          `Register failed (${registerRes.status}): ${JSON.stringify(payload)}`,
        );
      }

      const registerPayload = (await registerRes.json()) as RegisterResponse;
      if (!registerPayload?.imageId) {
        throw new Error('Register response missing imageId.');
      }

      setStep('caption');
      const captionRes = await fetch(`${BASE_URL}/pipeline/generate-captions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${jwt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ imageId: registerPayload.imageId }),
      });

      if (!captionRes.ok) {
        const payload = await readJson(captionRes);
        throw new Error(
          `Generate captions failed (${captionRes.status}): ${JSON.stringify(payload)}`,
        );
      }

      const captionPayload = (await captionRes.json()) as unknown;
      const list = Array.isArray(captionPayload)
        ? (captionPayload as GeneratedCaptionRecord[])
        : null;

      setCaptions(list ?? []);
      setStep('done');
    } catch (e) {
      setStep('error');
      const baseMessage = e instanceof Error ? e.message : 'Unknown error';
      setError(
        normalized.note
          ? `${baseMessage} (Detected: ${file.type || '(none)'}; using ${contentType} — ${normalized.note})`
          : `${baseMessage} (Detected: ${file.type || '(none)'}; using ${contentType})`,
      );
    }
  }

  const busy = step !== 'idle' && step !== 'done' && step !== 'error';
  const busyLabel =
    step === 'presign'
      ? 'Preparing…'
      : step === 'upload'
        ? 'Uploading…'
        : step === 'register'
          ? 'Registering…'
          : step === 'caption'
            ? 'Generating…'
            : 'Working…';

  return (
    <div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-2xl border border-yellow-500/10 bg-zinc-950/70 p-5 shadow-sm backdrop-blur">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Upload
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Upload an image
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Drag & drop an image, then generate captions.
          </p>

          <div
            className={[
              'mt-5 rounded-2xl border-2 border-dashed p-5 transition',
              dragActive
                ? 'border-yellow-400/70 bg-yellow-400/5'
                : 'border-yellow-500/15 bg-black/20 hover:bg-yellow-400/5',
            ].join(' ')}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragActive(false);
              const f = e.dataTransfer.files?.[0] ?? null;
              setPickedFile(f);
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-100">
                  {file ? file.name : 'Drop your image here'}
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  {file
                    ? `${file.type || 'unknown type'} • ${Math.round(file.size / 1024)} KB`
                    : 'JPEG, PNG, WEBP, GIF'}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (inputRef.current) inputRef.current.value = '';
                    inputRef.current?.click();
                  }}
                  className="rounded-xl border border-yellow-500/15 bg-black/20 px-3 py-2 text-sm font-semibold text-zinc-100 shadow-sm hover:bg-yellow-400/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Choose file
                </button>
                <button
                  type="button"
                  disabled={!file || busy}
                  onClick={runPipeline}
                  className="rounded-xl bg-yellow-400 px-3 py-2 text-sm font-semibold text-black shadow-sm shadow-yellow-500/10 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <svg
                        className="h-4 w-4 animate-spin"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="3"
                        />
                        <path
                          className="opacity-75"
                          d="M22 12a10 10 0 0 1-10 10"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />
                      </svg>
                      {busyLabel}
                    </span>
                  ) : (
                    'Generate'
                  )}
                </button>
              </div>

              <input
                ref={inputRef}
                className="hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => setPickedFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>

          {previewUrl && (
            <div className="mt-4 overflow-hidden rounded-xl border border-yellow-500/10 bg-black/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Preview"
                className="h-72 w-full object-contain sm:h-96"
              />
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-zinc-400">
              <span className="font-semibold">Status:</span>{' '}
              {step === 'idle' && 'Ready'}
              {step === 'presign' && 'Presigning upload'}
              {step === 'upload' && 'Uploading bytes'}
              {step === 'register' && 'Registering image'}
              {step === 'caption' && 'Generating captions'}
              {step === 'done' && 'Done'}
              {step === 'error' && 'Error'}
            </div>
            <button
              disabled={busy && Boolean(file)}
              onClick={() => setPickedFile(null)}
              className="rounded-xl border border-yellow-500/15 bg-black/20 px-3 py-2 text-sm font-semibold text-zinc-100 shadow-sm hover:bg-yellow-400/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear
            </button>
          </div>

          {step === 'done' && captions && (
            <div className="mt-4 rounded-xl border border-yellow-500/20 bg-yellow-400/10 px-4 py-3 text-sm text-yellow-100">
              <span className="font-semibold">Generation complete.</span> Use{' '}
              <span className="font-semibold">Clear</span> to try a different image.
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <span className="font-semibold">Error:</span> {error}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-yellow-500/10 bg-zinc-950/70 p-5 shadow-sm backdrop-blur">
          <h2 className="text-lg font-semibold">Generated captions</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Captions are generated live from your uploaded image and may take a few seconds.
          </p>

          {!captions ? (
            <p className="mt-3 text-sm text-zinc-400">
              Upload an image and click Generate to see captions here.
            </p>
          ) : busy ? (
            <div className="mt-4 space-y-3">
              <div className="h-10 w-full animate-pulse rounded-xl bg-yellow-500/10" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-yellow-500/10" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-yellow-500/10" />
            </div>
          ) : captions.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No captions returned.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {captions.map((c, idx) => {
                const text =
                  typeof c.content === 'string'
                    ? c.content
                    : typeof c.caption === 'string'
                      ? c.caption
                      : JSON.stringify(c);

                return (
                  <li
                    key={idx}
                    className="rounded-xl border border-yellow-500/10 bg-black/20 px-4 py-3 text-sm text-zinc-100"
                  >
                    {text}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

