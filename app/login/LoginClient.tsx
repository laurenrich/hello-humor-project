'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function LoginClient({ nextPath }: { nextPath: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithGoogle() {
    setError(null);
    setLoading(true);

    const origin =
      typeof window === 'undefined' ? '' : window.location.origin;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Assignment requirement: redirect back to /auth/callback exactly.
        redirectTo: `${origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success, browser navigates away to Google.
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Sign in</h1>
      <p style={{ marginTop: 8 }}>
        This app uses Google OAuth via Supabase. After sign-in you’ll be sent to{' '}
        <code>/auth/callback</code> and then redirected to{' '}
        <code>{nextPath}</code>.
      </p>

      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        <button
          onClick={signInWithGoogle}
          disabled={loading}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #ddd',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          {loading ? 'Redirecting…' : 'Continue with Google'}
        </button>

        <Link
          href="/"
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #ddd',
            textDecoration: 'none',
          }}
        >
          Back home
        </Link>
      </div>

      {error && (
        <p style={{ marginTop: 12, color: 'crimson' }}>
          Error: {error}
        </p>
      )}
    </main>
  );
}

