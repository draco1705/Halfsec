import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchArtistDiscography } from '@/lib/music';

// Secret to protect this cron endpoint
const CRON_SECRET = process.env.CRON_SECRET || 'secret';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { artistName, playDate } = await request.json();
    if (!artistName || !playDate) {
      return NextResponse.json({ error: 'Missing artistName or playDate' }, { status: 400 });
    }

    const { artistName: fetchedArtistName, artistImageUrl, targetTracks, allTitles } = await fetchArtistDiscography(artistName);

    const { data, error } = await supabase
      .from('daily_challenges')
      .insert([
        {
          play_date: playDate,
          artist_name: fetchedArtistName,
          artist_image_url: artistImageUrl,
          track_pool: targetTracks,
          all_searchable_titles: allTitles
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, challenge: data });
  } catch (error: any) {
    console.error('Error generating daily challenge:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
