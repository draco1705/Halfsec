import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  
  if (!date) {
    return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  }

  try {
    // 1. Get the challenge ID for the date
    const { data: challenge, error: challengeError } = await supabase
      .from('daily_challenges')
      .select('id, artist_name')
      .eq('play_date', date)
      .single();

    if (challengeError || !challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    // 2. Get distribution of scores for this challenge
    const { data: submissions, error: submissionsError } = await supabase
      .from('daily_submissions')
      .select('score')
      .eq('challenge_id', challenge.id);

    if (submissionsError) {
      return NextResponse.json({ error: submissionsError.message }, { status: 500 });
    }

    // Calculate distribution (0 to 5)
    const distribution = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let total = 0;

    submissions.forEach(sub => {
      if (sub.score >= 0 && sub.score <= 5) {
        distribution[sub.score as keyof typeof distribution]++;
        total++;
      }
    });

    return NextResponse.json({
      artist_name: challenge.artist_name,
      distribution,
      total
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { verifySessionToken } from '@/lib/crypto';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { date, score, totalTimeMs, sessionToken, challengeId } = await request.json();

    if (!sessionToken || !challengeId) {
       return NextResponse.json({ error: 'Missing session token or challenge ID' }, { status: 400 });
    }

    // Verify cryptographic signature and start time
    const startMs = verifySessionToken(sessionToken, challengeId);
    const elapsedServerMs = Date.now() - startMs;
    
    // Hard limit: 5 rounds of 0.5s + human reaction time shouldn't take less than ~4 seconds
    if (elapsedServerMs < 4000) {
      return NextResponse.json({ error: 'Implausible completion time. Run rejected.' }, { status: 403 });
    }

    // HTTP-only cookie check to prevent double submissions for the same challenge
    const cookieStore = await cookies();
    const submissionKey = `submitted_${challengeId}`;
    if (cookieStore.get(submissionKey)) {
      return NextResponse.json({ error: 'Already submitted today.' }, { status: 403 });
    }

    const { data: challenge, error: challengeError } = await supabase
      .from('daily_challenges')
      .select('id')
      .eq('play_date', date)
      .single();

    if (challengeError || !challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    const { error: insertError } = await supabase
      .from('daily_submissions')
      .insert([
        { challenge_id: challenge.id, score, total_time_ms: totalTimeMs }
      ]);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Set cookie so they can't submit again
    cookieStore.set(submissionKey, 'true', { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
