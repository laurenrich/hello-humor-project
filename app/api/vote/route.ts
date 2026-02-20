import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type VoteRequestBody = {
  captionId?: unknown;
  value?: unknown;
};

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  let parsed: VoteRequestBody = {};
  try {
    parsed = (await request.json()) as VoteRequestBody;
  } catch {
    // ignore invalid JSON
  }

  const captionId = typeof parsed.captionId === 'string' ? parsed.captionId : null;
  const value = typeof parsed.value === 'number' ? parsed.value : null;

  if (!captionId || (value !== 1 && value !== -1)) {
    return json(
      { error: 'Invalid payload. Expected { captionId: string, value: 1 | -1 }.' },
      400,
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return json({ error: 'Not authenticated.' }, 401);
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('caption_votes')
    .insert({
      created_datetime_utc: now,
      modified_datetime_utc: now,
      caption_id: captionId,
      profile_id: user.id,
      vote_value: value,
    })
    .select(
      'id, created_datetime_utc, modified_datetime_utc, caption_id, profile_id, vote_value',
    )
    .single();

  if (!error) {
    return json({ ok: true, vote: data }, 200);
  }

  const message = error.message || 'Unknown error';

  if (
    message.toLowerCase().includes('row-level security') ||
    message.toLowerCase().includes('violates row-level security') ||
    message.toLowerCase().includes('permission denied')
  ) {
    return json({ error: message }, 403);
  }

  if (message.toLowerCase().includes('duplicate key')) {
    return json({ error: 'You already voted for this caption.' }, 409);
  }

  return json(
    {
      error: `Unable to insert vote into caption_votes: ${message}`,
      lastError: { message, details: error.details, code: error.code },
    },
    500,
  );
}

