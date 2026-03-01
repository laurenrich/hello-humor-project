'use client';

import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function LoginClient() {
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
    <main className="min-h-screen bg-[radial-gradient(1200px_circle_at_50%_-20%,rgba(250,204,21,0.14),transparent_60%),radial-gradient(900px_circle_at_10%_0%,rgba(250,204,21,0.08),transparent_55%)] text-zinc-100">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3">
            <div className="leading-tight">
              <div className="text-2xl font-semibold tracking-tight">
                The Humor Project
              </div>
              <div className="text-xs text-zinc-400">
                Sign in to continue
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-yellow-500/10 bg-zinc-950/70 p-6 shadow-sm backdrop-blur">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Continue with Google to browse, upload, and rate captions.
            </p>

            <button
              onClick={signInWithGoogle}
              disabled={loading}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-black shadow-sm shadow-yellow-500/10 hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
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
                  Redirecting…
                </>
              ) : (
                'Continue with Google'
              )}
            </button>

            {error && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                <span className="font-semibold">Error:</span> {error}
              </div>
            )}

            <p className="mt-4 text-xs text-zinc-400">
              By continuing, you’ll be redirected to Google for authentication.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

