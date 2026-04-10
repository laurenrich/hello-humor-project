'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type CaptionRow = {
  id: string;
  content: string | null;
  image_id: string | null;
  is_public: boolean | null;
  imageUrl?: string | null;
  [key: string]: unknown;
};

export default function RateClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [captions, setCaptions] = useState<CaptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [votedCaptionIds, setVotedCaptionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [activeCaptions, setActiveCaptions] = useState<CaptionRow[]>([]);
  const [votingIds, setVotingIds] = useState<Set<string>>(() => new Set());
  const [selectedVotes, setSelectedVotes] = useState<Record<string, 1 | -1>>(
    {},
  );
  const [voteError, setVoteError] = useState<string | null>(null);
  const [recentSave, setRecentSave] = useState<{ captionId: string; at: number } | null>(
    null,
  );

  const batchSize = 8;

  function desiredCountForMode(nextMode: typeof mode) {
    return nextMode === 'batch' ? batchSize : 1;
  }

  function IconButton({
    variant,
    label,
    active,
    disabled,
    onClick,
  }: {
    variant: 'up' | 'down';
    label: string;
    active?: boolean;
    disabled: boolean;
    onClick: () => void;
  }) {
    const base =
      'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';

    // Black + yellow theme:
    // - Upvote leans yellow
    // - Downvote stays neutral but uses the same yellow focus/active cues
    const styles =
      variant === 'up'
        ? 'border-yellow-500/25 bg-yellow-400/10 text-yellow-200 hover:bg-yellow-400/15'
        : 'border-yellow-500/15 bg-black/20 text-zinc-200 hover:bg-yellow-400/5';

    const activeStyles = 'ring-2 ring-yellow-400/40';

    return (
      <button
        disabled={disabled}
        onClick={onClick}
        className={`${base} ${styles} ${active ? activeStyles : ''}`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {variant === 'up' ? (
            <>
              <path d="M12 19V5" />
              <path d="M5 12l7-7 7 7" />
            </>
          ) : (
            <>
              <path d="M12 5v14" />
              <path d="M19 12l-7 7-7-7" />
            </>
          )}
        </svg>
        {label ? <span className="hidden sm:inline">{label}</span> : null}
      </button>
    );
  }

  function pickRandomCaptions(
    all: CaptionRow[],
    voted: Set<string>,
    count: number,
    excludeIds: Set<string> = new Set(),
  ): CaptionRow[] {
    const pool = all.filter(
      (c) =>
        !voted.has(c.id) &&
        !excludeIds.has(c.id) &&
        Boolean(c.imageUrl),
    );
    if (pool.length === 0) return [];

    const picked: CaptionRow[] = [];
    const used = new Set<string>();
    while (picked.length < count && used.size < pool.length) {
      const idx = Math.floor(Math.random() * pool.length);
      const candidate = pool[idx];
      if (!candidate) break;
      if (used.has(candidate.id)) continue;
      used.add(candidate.id);
      picked.push(candidate);
    }
    return picked;
  }

  function ensureFilled(
    current: CaptionRow[],
    nextMode: typeof mode,
    nextVoted: Set<string>,
  ) {
    const desired = desiredCountForMode(nextMode);
    const next = current.slice(0, desired);
    const exclude = new Set(next.map((c) => c.id));
    if (next.length >= desired) return next;
    const add = pickRandomCaptions(captions, nextVoted, desired - next.length, exclude);
    return next.concat(add);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: userData } = await supabase.auth.getUser();
      const authedUser = userData.user ?? null;

      if (!authedUser) {
        window.location.href = `/login?next=/`;
        return;
      }

      setUser(authedUser);

      const { data: captionData, error: captionError } = await supabase
        .from('captions')
        .select('id, content, image_id, is_public')
        .eq('is_public', true);

      if (cancelled) return;

      if (captionError) {
        console.error('Error fetching captions:', captionError);
        setCaptions([]);
        setActiveCaptions([]);
        setLoading(false);
        return;
      }

      const rows = (captionData ?? []) as CaptionRow[];
      const imageIds = Array.from(
        new Set(rows.map((r) => r.image_id).filter(Boolean) as string[]),
      );

      const { data: imageData, error: imageError } = await supabase
        .from('images')
        .select('id, url, is_public')
        .in('id', imageIds)
        .eq('is_public', true);

      if (cancelled) return;

      if (imageError) {
        console.error('Error fetching images:', imageError);
      }

      const imageUrlById = new Map<string, string>();
      for (const img of imageData ?? []) {
        if (img?.id && img?.url) imageUrlById.set(img.id, img.url);
      }

      const enriched = rows.map((r) => ({
        ...r,
        imageUrl: r.image_id ? imageUrlById.get(r.image_id) ?? null : null,
      }));

      setCaptions(enriched);
      setActiveCaptions((prev) =>
        prev.length > 0 ? prev : pickRandomCaptions(enriched, new Set(), 1),
      );
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // Keep the active list filled whenever mode/captions change.
  useEffect(() => {
    if (loading) return;
    setActiveCaptions((prev) => ensureFilled(prev, mode, votedCaptionIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, captions.length, loading]);

  useEffect(() => {
    if (!recentSave) return;
    const t = setTimeout(() => setRecentSave(null), 1200);
    return () => clearTimeout(t);
  }, [recentSave]);

  function removeAndReplace(captionId: string, nextVotedSet = votedCaptionIds) {
    setVoteError(null);

    setActiveCaptions((prev) => {
      const desired = desiredCountForMode(mode);
      const remaining = prev.filter((c) => c.id !== captionId).slice(0, desired);
      return ensureFilled(remaining, mode, nextVotedSet);
    });
  }

  function refreshBatch(options?: { nextVotedSet?: Set<string>; excludeCurrent?: boolean }) {
    const nextVotedSet = options?.nextVotedSet ?? votedCaptionIds;
    setVoteError(null);
    setVotingIds(new Set());
    setSelectedVotes({});

    const exclude = new Set<string>();
    if (options?.excludeCurrent) {
      for (const c of activeCaptions) exclude.add(c.id);
    }

    const picked = pickRandomCaptions(captions, nextVotedSet, batchSize, exclude);
    // If we excluded everything (small pool), fall back to allowing repeats of unvoted.
    setActiveCaptions(
      picked.length > 0 ? picked : pickRandomCaptions(captions, nextVotedSet, batchSize),
    );
  }

  // In batch mode, if you've voted on every card currently shown, auto-refresh.
  useEffect(() => {
    if (loading) return;
    if (mode !== 'batch') return;
    const shown = activeCaptions.slice(0, batchSize);
    if (shown.length === 0) return;

    const allVoted = shown.every((c) => votedCaptionIds.has(c.id));
    if (!allVoted) return;

    refreshBatch({ nextVotedSet: votedCaptionIds, excludeCurrent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, loading, votedCaptionIds, activeCaptions]);

  function toggleBatchSelection(captionId: string, value: 1 | -1) {
    if (mode !== 'batch') return;
    if (votingIds.has(captionId)) return;

    const current = selectedVotes[captionId];
    if (current === value) {
      // unvote
      setSelectedVotes((prev) => {
        const next = { ...prev };
        delete next[captionId];
        return next;
      });
      void vote(captionId, 0);
      return;
    }

    // change vote
    setSelectedVotes((prev) => ({ ...prev, [captionId]: value }));
    void vote(captionId, value);
  }

  async function vote(captionId: string, value: 1 | -1 | 0) {
    setVoteError(null);

    if (!user) {
      window.location.href = `/login?next=/`;
      return;
    }

    setVotingIds((prev) => new Set(prev).add(captionId));
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ captionId, value }),
      });

      if (res.ok) {
        if (value === 0) {
          setVotedCaptionIds((prev) => {
            const next = new Set(prev);
            next.delete(captionId);
            return next;
          });
          setSelectedVotes((prev) => {
            const next = { ...prev };
            delete next[captionId];
            return next;
          });
          setRecentSave({ captionId, at: Date.now() });
          return;
        }

        setSelectedVotes((prev) => ({ ...prev, [captionId]: value as 1 | -1 }));
        setVotedCaptionIds((prev) => {
          const next = new Set(prev);
          next.add(captionId);
          if (mode === 'single') {
            removeAndReplace(captionId, next);
          }
          return next;
        });
        setRecentSave({ captionId, at: Date.now() });
        return;
      }

      const payload = (await res.json().catch(() => null)) as
        | { error?: string; lastError?: { message?: string } }
        | null;

      if (res.status === 401) {
        window.location.href = `/login?next=/`;
        return;
      }

      const details = payload?.lastError?.message;
      setVoteError(
        details
          ? `${payload?.error || 'Vote failed.'} (${details})`
          : payload?.error || 'Vote failed.',
      );
    } finally {
      setVotingIds((prev) => {
        const next = new Set(prev);
        next.delete(captionId);
        return next;
      });
    }
  }

  const desiredCount = mode === 'batch' ? batchSize : 1;
  const showCaptions = activeCaptions.slice(0, desiredCount);

  if (loading) return <p className="px-5 py-10 text-sm text-zinc-500">Loading…</p>;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
            Rate captions
          </h1>
          <div className="mt-1 text-sm text-zinc-400">
            {mode === 'single'
              ? 'Single: vote one at a time.'
              : 'Batch: vote a grid. Click the same arrow again to undo.'}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
          <div className="inline-flex items-center gap-1 rounded-xl border border-yellow-500/15 bg-zinc-950/70 p-1 shadow-sm backdrop-blur">
            <button
              onClick={() => setMode('single')}
              className={[
                'grid h-9 w-11 place-items-center rounded-lg transition',
                mode === 'single'
                  ? 'bg-yellow-400 text-black shadow-sm shadow-yellow-500/10'
                  : 'text-zinc-300 hover:bg-yellow-400/5 hover:text-yellow-200',
              ].join(' ')}
              aria-label="Single view"
              title="Single"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="6" y="5" width="12" height="14" rx="2" />
              </svg>
            </button>
            <button
              onClick={() => setMode('batch')}
              className={[
                'grid h-9 w-11 place-items-center rounded-lg transition',
                mode === 'batch'
                  ? 'bg-yellow-400 text-black shadow-sm shadow-yellow-500/10'
                  : 'text-zinc-300 hover:bg-yellow-400/5 hover:text-yellow-200',
              ].join(' ')}
              aria-label="Batch view"
              title="Batch"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="4" y="4" width="7" height="7" rx="1.5" />
                <rect x="13" y="4" width="7" height="7" rx="1.5" />
                <rect x="4" y="13" width="7" height="7" rx="1.5" />
                <rect x="13" y="13" width="7" height="7" rx="1.5" />
              </svg>
            </button>
          </div>

          <button
            onClick={() => refreshBatch({ excludeCurrent: true })}
            className={[
              'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-yellow-500/15 bg-black/20 px-3 text-yellow-200 shadow-sm transition hover:bg-yellow-400/5',
              mode === 'batch' ? '' : 'pointer-events-none opacity-0',
            ].join(' ')}
            aria-label="Refresh batch"
            title="Refresh"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-3-6.7" />
              <path d="M21 3v6h-6" />
            </svg>
            <span className="hidden sm:inline text-sm font-semibold">Refresh</span>
          </button>
        </div>
      </div>

      {voteError && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span className="font-semibold">Vote error:</span> {voteError}
        </div>
      )}

      {showCaptions.length === 0 && (
        <div className="mt-6 rounded-2xl border border-yellow-500/10 bg-zinc-950/70 p-5 text-sm text-zinc-300 shadow-sm backdrop-blur">
          {captions.length === 0
            ? 'No captions found yet.'
            : 'You’ve rated all available captions. Nice.'}
        </div>
      )}

      {showCaptions.length > 0 && (
        <div className={mode === 'single' ? 'mx-auto mt-6 max-w-3xl' : 'mt-6'}>
          <div
            className={[
              'grid gap-5',
              mode === 'batch'
                ? 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'grid-cols-1',
            ].join(' ')}
          >
          {showCaptions.map((cap) => {
            const isVoting = votingIds.has(cap.id);
            const canVote = !isVoting;
            const imageFitClass =
              mode === 'single' ? 'object-contain' : 'object-cover';
            const imageHeightClass =
              mode === 'batch'
                ? 'h-52 sm:h-60'
                : 'h-80 sm:h-[26rem]';
            const selected = selectedVotes[cap.id];
            const justSaved =
              Boolean(recentSave) &&
              recentSave!.captionId === cap.id &&
              Date.now() - recentSave!.at < 1200;

            return (
              <section
                key={cap.id}
                className="group overflow-hidden rounded-2xl border border-yellow-500/10 bg-zinc-950/70 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-yellow-500/20 hover:shadow-md"
              >
                {cap.imageUrl && (
                  <div className="relative border-b border-yellow-500/10 bg-black/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cap.imageUrl}
                      alt="Caption image"
                      className={`w-full ${imageHeightClass} ${imageFitClass}`}
                      loading="lazy"
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-black/55 to-transparent opacity-0 transition group-hover:opacity-100" />
                  </div>
                )}

                <div className={mode === 'batch' ? 'p-4' : 'p-5'}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Caption
                      </div>
                      <div
                        className={[
                          'mt-2 font-semibold leading-snug',
                          mode === 'batch' ? 'text-sm sm:text-[15px]' : 'text-base sm:text-lg',
                        ].join(' ')}
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp:
                            mode === 'batch'
                              ? batchSize >= 9
                                ? 5
                                : 7
                              : 0,
                          WebkitBoxOrient: 'vertical',
                          overflow: mode === 'batch' ? 'hidden' : 'visible',
                        }}
                      >
                        {cap.content || <em className="font-normal">(no content)</em>}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <IconButton
                        variant="up"
                        label={mode === 'batch' ? '' : isVoting ? 'Saving…' : 'Upvote'}
                        active={selected === 1}
                        disabled={!canVote}
                        onClick={() =>
                          mode === 'batch'
                            ? toggleBatchSelection(cap.id, 1)
                            : vote(cap.id, 1)
                        }
                      />
                      <IconButton
                        variant="down"
                        label={mode === 'batch' ? '' : isVoting ? 'Saving…' : 'Downvote'}
                        active={selected === -1}
                        disabled={!canVote}
                        onClick={() =>
                          mode === 'batch'
                            ? toggleBatchSelection(cap.id, -1)
                            : vote(cap.id, -1)
                        }
                      />
                    </div>
                    {isVoting && (
                      <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                        Saving…
                      </div>
                    )}
                    {!isVoting && justSaved && (
                      <div className="text-xs font-semibold text-yellow-200">
                        Saved
                      </div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}

