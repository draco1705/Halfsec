export interface Track {
  id: string;
  title: string;
  preview_url: string;
  slice_offset_sec: number;
  album?: string;
  year?: string | number;
}

export function cleanTrackTitle(title: string): string {
  return title
    .replace(/\s*\(.*?(Remaster|Radio Edit|feat\.|Edition|Bonus|Mix|Version).*?\)/gi, '')
    .replace(/\s*\[.*?(Remaster|Radio Edit|feat\.|Edition|Bonus|Mix|Version).*?\]/gi, '')
    .replace(/\s*-.*?(Remaster|Radio Edit|Mix|Version|Edit)/gi, '')
    .trim();
}

export async function fetchArtistDiscography(artistName: string) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=200`;
  const response = await fetch(url);
  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    throw new Error('Artist not found');
  }

  // Filter out songs without previews
  let validTracks = data.results.filter((track: any) => track.previewUrl);
  
  // Group by clean title to avoid duplicates
  const uniqueTracksMap = new Map<string, any>();
  for (const track of validTracks) {
    const cleanTitle = cleanTrackTitle(track.trackName);
    if (!uniqueTracksMap.has(cleanTitle)) {
      uniqueTracksMap.set(cleanTitle, {
        id: track.trackId.toString(),
        title: cleanTitle,
        preview_url: track.previewUrl,
        slice_offset_sec: 0,
        album: track.collectionName || 'Unknown Album',
        year: track.releaseDate ? new Date(track.releaseDate).getFullYear() : 'Unknown'
      });
    }
  }

  const allTracks = Array.from(uniqueTracksMap.values());
  
  // Need at least 5 tracks for the game
  if (allTracks.length < 5) {
    throw new Error('Not enough tracks found for this artist');
  }

  // Sort by popularity or just take the first 50 (iTunes returns most relevant/popular first usually)
  const top50 = allTracks.slice(0, 50);
  
  // Pick 5 random tracks for the target pool
  const shuffled = [...top50].sort(() => 0.5 - Math.random());
  const targetTracks = shuffled.slice(0, 5);

  const artistImageUrl = data.results[0].artistViewUrl || data.results[0].artworkUrl100;

  return {
    artistName: data.results[0].artistName,
    artistImageUrl,
    targetTracks,
    allTitles: top50.map(t => t.title)
  };
}
