'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export default function SignOutButton() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    await supabase.auth.signOut();
    setLoading(false);
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      disabled={loading}
      style={{
        padding: '10px 14px',
        borderRadius: 10,
        border: '1px solid #ddd',
        cursor: loading ? 'not-allowed' : 'pointer',
        fontWeight: 600,
      }}
    >
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  );
}

