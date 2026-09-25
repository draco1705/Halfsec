import { NextResponse } from 'next/server';
import { createSessionToken } from '@/lib/crypto';

export async function POST(request: Request) {
  try {
    const { challengeId } = await request.json();

    if (!challengeId) {
      return NextResponse.json({ error: 'Missing challengeId' }, { status: 400 });
    }

    const sessionToken = createSessionToken(challengeId);

    return NextResponse.json({ sessionToken });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
