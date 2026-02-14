import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import SignOutButton from './SignOutButton';

export default async function ProtectedPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Protected page</h1>
      <p style={{ marginTop: 8 }}>
        This is the “gated UI”: you can only see it when authenticated.
      </p>

      <div
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 12,
          border: '1px solid #eee',
          background: '#fafafa',
        }}
      >
        <div style={{ fontWeight: 700 }}>Signed in as</div>
        <div style={{ marginTop: 6 }}>
          <div>
            <strong>Email:</strong> {user.email || '(none)'}
          </div>
          <div>
            <strong>User ID:</strong> {user.id}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        <SignOutButton />
        <Link
          href="/"
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #ddd',
            textDecoration: 'none',
          }}
        >
          Home
        </Link>
      </div>
    </main>
  );
}

