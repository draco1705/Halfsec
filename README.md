# Halfsec ⚡

**Halfsec** is a daily music trivia web game that tests how well players know a featured artist. The catch? You only get to hear exactly **0.5 seconds** (500ms) of a song to guess what it is. 

Every day at 12:00 UTC, a new artist drops. You face 5 consecutive rounds, guessing from a large autocomplete discography pool. At the end, you see your final accuracy, elapsed time, and how you stack up against the global bell curve of players.

## Features

- 🎧 **Web Audio API:** Slices audio buffers with mathematical precision (no HTML `<audio>` tag lag), ramping down the final 15ms to eliminate speaker pops.
- 📅 **Daily Global Reset:** A synchronized countdown runs until 12:00 UTC when the next artist is revealed to the world.
- 🔒 **Ironclad Anti-Cheat:** 
  - Raw audio MP3s are proxied and stripped of all ID3 metadata via an internal API.
  - Guess validation happens securely on the server.
  - Matches are protected by HMAC-signed session tokens and server-side timestamps to prevent fraudulent impossible-time submissions.
- 📊 **Global Percentile Rankings:** See exactly where your score and reaction time lands on a real-time bell curve.
- 🟩 **Spoiler-Free Sharing:** 1-click clipboard copying (Wordle-style emoji grids) to flex your elite ear on social media.

## Tech Stack

- **Framework:** Next.js (App Router, TypeScript)
- **Styling & Icons:** Tailwind CSS, Lucide React
- **Audio Engine:** Web Audio API (`AudioContext`)
- **Fuzzy Search:** `fuse.js`
- **Database:** Supabase (PostgreSQL)

## Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/halfsec.git
   cd halfsec
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Environment Variables:**
   Create a `.env.local` file in the root directory and add your Supabase credentials and a secret key for session tokens:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   GAME_SECRET=a-super-secret-key-that-is-at-least-32-bytes
   CRON_SECRET=your_cron_secret
   ```

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Test Mode (No DB Required):**
   If you want to test the UI immediately without setting up a database, you can bypass the daily fetch and dynamically hit the iTunes Search API by adding the `?artist=` query parameter in your browser:
   `http://localhost:3000/?artist=Drake`

## Database Architecture (Supabase)

To run the game in production, you will need to execute the schema to create `daily_challenges` and `daily_submissions` (or the V2 `scheduled_artists` schema for unreleased tracks) in your Supabase SQL Editor. See the internal design docs for the table setup!

---

*Inspired by Songless. Built with Next.js.*
