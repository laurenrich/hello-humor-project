import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import Navbar from './navbar';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/');
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_circle_at_50%_-20%,rgba(250,204,21,0.12),transparent_60%),radial-gradient(800px_circle_at_10%_0%,rgba(250,204,21,0.06),transparent_50%)]">
      <Navbar userEmail={user.email ?? null} />
      <main className="mx-auto max-w-6xl px-5 pb-12 pt-8">{children}</main>
    </div>
  );
}

