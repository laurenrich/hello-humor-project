'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

function NavLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const pathname = usePathname();
  const active =
    href === '/'
      ? pathname === '/'
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={[
        'rounded-xl px-3 py-2 text-sm font-semibold transition',
        active
          ? 'bg-yellow-400 text-black shadow-sm shadow-yellow-500/10'
          : 'text-zinc-300 hover:bg-zinc-900/60 hover:text-white',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}

export default function Navbar({ userEmail }: { userEmail: string | null }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
    router.push('/login?next=/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-yellow-500/10 bg-black/50 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-3">
        <div className="leading-tight">
          <div className="text-lg font-semibold tracking-tight text-zinc-100">
            The Humor Project
          </div>
          <div className="text-xs text-zinc-400">Browse • Upload • Rate</div>
        </div>

        <nav className="flex items-center gap-1 rounded-2xl border border-yellow-500/10 bg-zinc-950/70 p-1 shadow-sm">
          <NavLink href="/" label="Browse" />
          <NavLink href="/upload" label="Upload" />
        </nav>

        <div className="flex items-center gap-2">
          {userEmail && (
            <div className="hidden text-xs text-zinc-400 sm:block">
              {userEmail}
            </div>
          )}
          <button
            onClick={signOut}
            disabled={loading}
            className="rounded-xl border border-yellow-500/20 bg-zinc-950/70 px-3 py-2 text-sm font-semibold text-yellow-200 shadow-sm hover:bg-zinc-900/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </header>
  );
}

