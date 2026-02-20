'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

type CaptionRow = {
  id: string;
  content: string | null;
  [key: string]: unknown;
};

function pickRandomCaption(
  captions: CaptionRow[],
  votedCaptionIds: Set<string>,
): CaptionRow | null {
  const remaining = captions.filter((c) => !votedCaptionIds.has(c.id));
  if (remaining.length === 0) return null;
  const idx = Math.floor(Math.random() * remaining.length);
  return remaining[idx] ?? null;
}

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [captions, setCaptions] = useState<CaptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [votedCaptionIds, setVotedCaptionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [currentCaption, setCurrentCaption] = useState<CaptionRow | null>(null);
  const [votingCaptionId, setVotingCaptionId] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [{ data: userData }, { data: captionData, error: captionError }] =
        await Promise.all([
          supabase.auth.getUser(),
          supabase.from('captions').select('*'),
        ]);

      if (cancelled) return;

      setUser(userData.user ?? null);

      if (captionError) {
        console.error('Error fetching captions:', captionError);
        setCaptions([]);
        setCurrentCaption(null);
      } else {
        const rows = (captionData ?? []) as CaptionRow[];
        setCaptions(rows);
        setCurrentCaption((prev) => prev ?? pickRandomCaption(rows, new Set()));
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleAuthButton() {
    if (!user) {
      window.location.href = `/login?next=/`;
      return;
    }

    await supabase.auth.signOut();
    setUser(null);
    setVoteError(null);
  }

  function nextCaption(nextVotedSet = votedCaptionIds) {
    setCurrentCaption(pickRandomCaption(captions, nextVotedSet));
  }

  async function vote(captionId: string, value: 1 | -1) {
    setVoteError(null);

    if (!user) {
      window.location.href = `/login?next=/`;
      return;
    }

    setVotingCaptionId(captionId);
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ captionId, value }),
      });

      if (res.ok) {
        const nextSet = new Set(votedCaptionIds);
        nextSet.add(captionId);
        setVotedCaptionIds(nextSet);
        nextCaption(nextSet);
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
      setVoteError(details ? `${payload?.error || 'Vote failed.'} (${details})` : payload?.error || 'Vote failed.');
    } finally {
      setVotingCaptionId(null);
    }
  }

  if (loading) return <p>Loading...</p>

  const remainingCount = captions.filter((c) => !votedCaptionIds.has(c.id)).length;
  const isVoting = votingCaptionId !== null;
  const canVote = Boolean(currentCaption && !isVoting);

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Rate captions</h1>
      <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={handleAuthButton}
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid #ddd',
            cursor: 'pointer',
          }}
        >
          {user ? 'Log out' : 'Log in'}
        </button>
        <Link
          href="/protected"
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid #ddd',
            textDecoration: 'none',
          }}
        >
          Protected page
        </Link>
        {user && (
          <span style={{ alignSelf: 'center', color: '#555' }}>
            Signed in as <strong>{user.email}</strong>
          </span>
        )}
      </div>

      {voteError && (
        <p style={{ marginTop: 12, color: 'crimson' }}>Vote error: {voteError}</p>
      )}

      <div style={{ marginTop: 16 }}>
        <div style={{ color: '#555' }}>
          Remaining captions to rate: <strong>{remainingCount}</strong>
        </div>

        {!currentCaption && (
          <div style={{ marginTop: 12 }}>
            {captions.length === 0 ? (
              <p>No captions found yet.</p>
            ) : (
              <p>You’ve rated all available captions. Nice.</p>
            )}
          </div>
        )}

        {currentCaption && (
          <div
            style={{
              marginTop: 12,
              padding: 16,
              borderRadius: 12,
              border: '1px solid #eee',
              background: '#fff',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Caption</div>
            <div style={{ fontWeight: 600 }}>
              {currentCaption.content || <em>(no content)</em>}
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                disabled={!canVote}
                onClick={() => vote(currentCaption.id, 1)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid #ddd',
                  cursor: canVote ? 'pointer' : 'not-allowed',
                }}
              >
                {isVoting ? 'Saving…' : 'Upvote'}
              </button>
              <button
                disabled={!canVote}
                onClick={() => vote(currentCaption.id, -1)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid #ddd',
                  cursor: canVote ? 'pointer' : 'not-allowed',
                }}
              >
                {isVoting ? 'Saving…' : 'Downvote'}
              </button>
              <button
                disabled={isVoting || !currentCaption}
                onClick={() => nextCaption()}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '1px solid #ddd',
                  cursor: isVoting ? 'not-allowed' : 'pointer',
                }}
              >
                Skip
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
