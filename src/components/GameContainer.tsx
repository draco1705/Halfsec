'use client';

import { useState, useEffect, useRef } from 'react';
import Fuse from 'fuse.js';
import { audioEngine } from '@/lib/audio-player';
import ScoreDistribution from './ScoreDistribution';
import { Play, SkipForward, HelpCircle, Flame, BarChart2, Volume2, User, Search, RefreshCw, X, FastForward, Clock } from 'lucide-react';

type GameState = 'START_SCREEN' | 'PLAYING_ROUND' | 'ROUND_FEEDBACK' | 'GAME_OVER';

interface TrackFeedback {
  isCorrect: boolean;
  actualTitle: string;
  album: string;
  year: string | number;
  sliceStart: number;
  timeTaken: number;
  guess: string;
}

export default function GameContainer() {
  const [gameState, setGameState] = useState<GameState>('START_SCREEN');
  const [challenge, setChallenge] = useState<any>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [score, setScore] = useState(0);
  const [totalTimeMs, setTotalTimeMs] = useState(0);
  const [guessHistory, setGuessHistory] = useState<TrackFeedback[]>([]);
  const [feedback, setFeedback] = useState<TrackFeedback | null>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const fuseRef = useRef<Fuse<string> | null>(null);
  
  const timerStartRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [roundTimeRemaining, setRoundTimeRemaining] = useState(10); // 10s per round

  const [testArtist, setTestArtist] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [resetTimer, setResetTimer] = useState<string>('00:00:00');
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      setCurrentTime(now.toISOString().split('T')[1].slice(0,8));
      
      const nextReset = new Date(now);
      nextReset.setUTCHours(12, 0, 0, 0);
      if (now.getTime() >= nextReset.getTime()) {
        nextReset.setUTCDate(nextReset.getUTCDate() + 1);
      }
      
      const diffMs = nextReset.getTime() - now.getTime();
      const hours = Math.floor(diffMs / (1000 * 60 * 60)).toString().padStart(2, '0');
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)).toString().padStart(2, '0');
      const secs = Math.floor((diffMs % (1000 * 60)) / 1000).toString().padStart(2, '0');
      
      setResetTimer(`${hours}:${mins}:${secs}`);
    };

    updateClocks();
    const interval = setInterval(updateClocks, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const artist = params.get('artist');
    if (artist) setTestArtist(artist);
    
    const dateStr = new Date().toISOString().split('T')[0];
    const url = artist ? `/api/daily?date=${dateStr}&artist=${encodeURIComponent(artist)}` : `/api/daily?date=${dateStr}`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setChallenge(data);
          fuseRef.current = new Fuse(data.all_searchable_titles, {
            threshold: 0.3
          });
          
          data.track_pool.forEach((t: any) => {
            audioEngine.loadAudio(t.preview_url, t.id);
          });
        }
      });
  }, []);

  // Timer logic for round
  useEffect(() => {
    let interval: any;
    if (gameState === 'PLAYING_ROUND' && roundTimeRemaining > 0) {
      interval = setInterval(() => {
        setRoundTimeRemaining(prev => {
          if (prev <= 0.1) {
            clearInterval(interval);
            submitGuess(''); // Auto skip on timeout
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [gameState, roundTimeRemaining]);

  useEffect(() => {
    if (searchQuery && fuseRef.current) {
      const results = fuseRef.current.search(searchQuery).slice(0, 5).map(r => r.item);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const startGame = async () => {
    audioEngine.unlock();
    
    // Phase 2: Start session securely
    if (challenge) {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: challenge.id })
      });
      const data = await res.json();
      setSessionToken(data.sessionToken);
    }

    setGameState('PLAYING_ROUND');
    setRoundTimeRemaining(10);
    timerStartRef.current = performance.now();
  };

  const playCurrentSnippet = () => {
    if (!challenge) return;
    const track = challenge.track_pool[currentRound];
    const buffer = audioEngine.getBuffer(track.id);
    if (buffer) {
      setIsPlaying(true);
      audioEngine.playSlice(buffer, track.slice_offset_sec, 0.5);
      setTimeout(() => setIsPlaying(false), 500);
    }
  };
  
  const playFullPreview = () => {
    if (!challenge) return;
    const track = challenge.track_pool[currentRound];
    const buffer = audioEngine.getBuffer(track.id);
    if (buffer) {
      setIsPlaying(true);
      audioEngine.playSlice(buffer, 0, 30);
      setTimeout(() => setIsPlaying(false), 30000);
    }
  };

  const submitGuess = async (guess: string) => {
    if (!challenge) return;
    const track = challenge.track_pool[currentRound];
    const timeTaken = performance.now() - timerStartRef.current;
    
    const dateStr = new Date().toISOString().split('T')[0];
    const res = await fetch('/api/verify-guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        date: dateStr, 
        trackId: track.id, 
        guess,
        testArtist
      })
    });
    const result = await res.json();
    
    const isCorrect = result.isCorrect;
    const fb: TrackFeedback = { 
      isCorrect, 
      actualTitle: result.actualTitle,
      album: result.album,
      year: result.year,
      sliceStart: result.sliceStart,
      timeTaken,
      guess: guess || 'Skipped'
    };
    
    setFeedback(fb);
    
    let newScore = score + (isCorrect ? 1 : 0);
    let newTime = totalTimeMs + (guess === '' ? 10000 : timeTaken);
    let newHistory = [...guessHistory, fb];

    setScore(newScore);
    setTotalTimeMs(newTime);
    setGuessHistory(newHistory);
    setGameState('ROUND_FEEDBACK');
  };

  const nextRound = async () => {
    if (currentRound < 4) {
      setCurrentRound(prev => prev + 1);
      setSearchQuery('');
      setRoundTimeRemaining(10);
      setGameState('PLAYING_ROUND');
      timerStartRef.current = performance.now();
    } else {
      // End of game, submit score
      if (sessionToken && challenge) {
        const dateStr = new Date().toISOString().split('T')[0];
        try {
          await fetch('/api/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              date: dateStr, 
              score, 
              totalTimeMs,
              sessionToken,
              challengeId: challenge.id
            })
          });
        } catch (e) {
          console.error('Submission failed', e);
        }
      }
      setGameState('GAME_OVER');
    }
  };

  if (!challenge && gameState !== 'GAME_OVER') {
    return <div className="text-white text-center mt-20 font-mono" suppressHydrationWarning>INITIALIZING PROTOCOL...</div>;
  }

  return (
    <div className="w-full min-h-screen bg-[#0a0a0a] text-zinc-300 font-sans selection:bg-green-500/30">
      {/* Top Navbar */}
      <nav className="w-full border-b border-zinc-800 bg-[#111] px-6 py-3 flex items-center justify-between text-xs tracking-wider">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-white text-lg">
            <span className="w-4 h-4 bg-white block rounded-sm" /> HALFSEC
          </div>
          <div className="flex items-center gap-2 bg-zinc-800/50 px-3 py-1 rounded">
            <span>DAILY #14</span>
            <span className="text-zinc-500" suppressHydrationWarning>RESET IN {resetTimer}</span>
          </div>
          <div className="flex items-center gap-2 bg-zinc-800/50 px-3 py-1 rounded">
            <span className="text-zinc-500">ARTIST:</span>
            <span className="text-white">{challenge?.artist_name?.toUpperCase()}</span>
          </div>
        </div>
        <div className="flex items-center gap-6 font-bold">
          <button className="text-white hover:text-green-400 transition-colors">GAME</button>
          <button className="text-zinc-500 hover:text-white transition-colors">ARCHIVE</button>
        </div>
        <div className="flex items-center gap-4 text-zinc-400">
          <HelpCircle size={16} className="cursor-pointer hover:text-white" />
          <div className="flex items-center gap-1 text-green-500">
            <Flame size={16} /> 7
          </div>
          <BarChart2 size={16} className="cursor-pointer hover:text-white" />
          <Volume2 size={16} className="cursor-pointer hover:text-white" />
          <div className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center cursor-pointer">
            <User size={16} />
          </div>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto pt-12 pb-24">
        {gameState === 'START_SCREEN' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex justify-between items-center mb-6 text-xs font-bold tracking-widest text-zinc-500">
              <span className="flex items-center gap-2 text-green-500"><div className="w-2 h-2 rounded-full bg-green-500"/> AUDIO ENGINE READY</span>
              <span>UTC {currentTime}</span>
            </div>
            
            <div className="bg-[#111] border border-zinc-800 rounded-xl overflow-hidden p-8 shadow-2xl relative">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="text-xs font-bold tracking-widest text-zinc-500 mb-1 bg-zinc-800 inline-block px-2 py-1 rounded">DAILY PROTOCOL #14</div>
                  <div className="text-sm tracking-widest text-zinc-400 mt-4">FEATURED CATALOG</div>
                  <h1 className="text-5xl font-black text-white uppercase tracking-tighter mt-1">{challenge?.artist_name}</h1>
                </div>
                <div className="text-xs font-bold tracking-widest text-green-500">500MS SNIPPET / ROUND</div>
              </div>
              
              <div className="relative w-full h-64 bg-zinc-900 rounded-lg overflow-hidden mb-8 group flex items-center justify-center">
                <img src={challenge?.artist_image_url} alt="Artist" className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-luminosity grayscale group-hover:grayscale-0 group-hover:opacity-60 transition-all duration-700" />
                <div className="relative z-10 w-20 h-20 bg-black/80 backdrop-blur-md rounded-2xl flex items-center justify-center shadow-2xl border border-white/10">
                  <div className="flex gap-1">
                    {[1,2,3,4].map(i => <div key={i} className="w-1.5 h-6 bg-white rounded-full animate-pulse" style={{ animationDelay: `${i*0.1}s` }} />)}
                  </div>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                {[
                  { step: '01', title: 'Listen to a sharp 0.5-second audio snippet', icon: <Volume2 size={20} /> },
                  { step: '02', title: 'Guess the track within 10 seconds or skip', icon: <Search size={20} /> },
                  { step: '03', title: '5 songs to test your mastery & claim rank', icon: <Flame size={20} /> }
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-4 bg-zinc-900/50 p-4 rounded-lg border border-zinc-800">
                    <div className="w-12 h-12 bg-zinc-800 rounded flex items-center justify-center text-white">{s.icon}</div>
                    <div>
                      <div className="text-xs font-bold tracking-widest text-zinc-500">STEP {s.step}</div>
                      <div className="text-white font-medium">{s.title}</div>
                    </div>
                  </div>
                ))}
              </div>
              
              <button onClick={startGame} className="w-full py-5 bg-white text-black font-black tracking-widest text-lg rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2">
                START TODAY'S GAME <FastForward size={20} />
              </button>
            </div>
          </div>
        )}

        {gameState === 'PLAYING_ROUND' && (
          <div className="animate-in fade-in duration-300">
            {/* Progression Bar */}
            <div className="flex justify-between text-xs font-bold tracking-widest text-zinc-500 mb-2">
              <span>GUESS PROGRESSION</span>
              <span>ROUND {currentRound + 1} / 5</span>
            </div>
            <div className="flex gap-2 mb-8">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className={`flex-1 h-1.5 rounded-full ${i < currentRound ? 'bg-zinc-700' : i === currentRound ? 'bg-white' : 'bg-zinc-800'}`} />
              ))}
            </div>

            {/* Timer Box */}
            <div className="bg-[#111] border border-zinc-800 rounded-lg p-4 flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <Clock className="text-zinc-500" size={24} />
                <div>
                  <div className="text-xs tracking-widest text-zinc-500 font-bold mb-1">TIME REMAINING</div>
                  <div className="text-2xl font-mono text-white">0{roundTimeRemaining.toFixed(1)}s</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs tracking-widest text-zinc-500 font-bold mb-1">BURST WINDOW</div>
                <div className="text-xs font-bold text-green-500 flex items-center gap-1 justify-end"><div className="w-1.5 h-1.5 bg-green-500 rounded-full"/> 500 MS LOCKED</div>
              </div>
            </div>

            {/* Audio Engine Box */}
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-6 mb-6">
              <div className="flex justify-between text-xs font-bold tracking-widest text-zinc-500 mb-6">
                <span><span className="text-zinc-700 mr-2">●</span>SRC: {challenge?.artist_name.toUpperCase()} • DISCOGRAPHY SLICE</span>
                <span>SAMPLE RATE: 48kHz</span>
              </div>
              
              {/* Fake Visualizer */}
              <div className="h-24 flex items-end justify-between gap-1 mb-6 px-4">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div key={i} className={`w-full bg-zinc-700 rounded-t-sm transition-all duration-75`} style={{ height: isPlaying ? `${Math.random() * 100}%` : '10%' }} />
                ))}
              </div>
              
              <div className="flex justify-between items-center bg-zinc-900 p-2 pl-4 rounded-lg">
                <div>
                  <div className="text-xl font-bold text-white">Snippet 0{currentRound + 1}</div>
                  <div className="text-xs text-zinc-500">Artist: {challenge?.artist_name} • 0.5s audio slice</div>
                </div>
                <button onClick={playCurrentSnippet} className="bg-white text-black px-6 py-3 rounded font-bold text-sm flex items-center gap-2 hover:bg-zinc-200">
                  <Play size={16} fill="currentColor" /> PLAY SNIPPET (0.5s) <span className="bg-zinc-200 text-zinc-500 text-[10px] px-1.5 py-0.5 rounded ml-2">SPACE</span>
                </button>
              </div>
            </div>

            {/* Search Box */}
            <div className="mb-2 flex justify-between text-xs font-bold tracking-widest text-zinc-500">
              <span>IDENTIFY TRACK</span>
              <span>SEARCH DISCOGRAPHY ({challenge?.all_searchable_titles.length} SONGS)</span>
            </div>
            <div className="relative mb-6">
              <Search className="absolute left-4 top-4 text-zinc-500" size={20} />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Type to search..."
                className="w-full bg-[#111] border border-zinc-800 rounded-lg py-4 pl-12 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 font-medium"
              />
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 w-full mt-2 bg-[#111] border border-zinc-800 rounded-lg overflow-hidden z-20 shadow-2xl">
                  {searchResults.map((res, i) => (
                    <button
                      key={i}
                      onClick={() => submitGuess(res)}
                      className="w-full text-left p-4 hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-0 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-zinc-500 group-hover:text-white"><Play size={16} /></div>
                        <div>
                          <div className="text-white font-medium">{res}</div>
                          <div className="text-xs text-zinc-500">{challenge?.artist_name}</div>
                        </div>
                      </div>
                      <div className="text-xs font-bold text-zinc-600 group-hover:text-zinc-400 tracking-widest">READY ↵</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button onClick={() => submitGuess('')} className="flex-1 bg-zinc-900 border border-zinc-800 py-4 rounded-lg font-bold text-zinc-500 hover:text-white transition-colors flex items-center justify-center gap-2">
                <SkipForward size={18} /> SKIP ROUND (+0.5s)
              </button>
              <button disabled={!searchQuery} onClick={() => submitGuess(searchResults[0] || searchQuery)} className="flex-1 bg-white text-black py-4 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                SUBMIT GUESS →
              </button>
            </div>
          </div>
        )}

        {gameState === 'ROUND_FEEDBACK' && feedback && (
          <div className="animate-in slide-in-from-bottom-8 duration-500">
            {/* Top Indicator */}
            <div className="flex justify-between text-xs font-bold tracking-widest text-zinc-500 mb-4">
              <span className="flex items-center gap-2"><span className="text-green-500">●</span> ROUND 0{currentRound + 1} / 05 REVEAL</span>
              <span>STREAK: 7 DAYS</span>
            </div>
            
            {/* Banner */}
            <div className="bg-white rounded-xl p-6 flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <div className="bg-black text-white p-3 rounded-lg"><Flame size={24} /></div>
                <div>
                  <h2 className="text-3xl font-black text-black tracking-tighter">SPLIT-SECOND!</h2>
                  <div className="text-xs font-bold text-zinc-500 tracking-widest mt-1">GUESS {currentRound + 1}: {feedback.isCorrect ? 'ACCURATE HIT' : 'MISS'}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="bg-green-100 text-green-700 font-bold px-3 py-1 rounded text-xs inline-block mb-1">● {(feedback.timeTaken / 1000).toFixed(1)}s ELAPSED</div>
                <div className="text-xs text-zinc-500 font-medium block">Audio heard: 500ms</div>
              </div>
            </div>

            {/* Track Info Box */}
            <div className="bg-[#111] border border-zinc-800 rounded-xl p-6 mb-6">
              <div className="flex gap-6 mb-8">
                <div className="w-32 h-32 bg-zinc-800 rounded-lg overflow-hidden shrink-0 relative">
                   <img src={challenge?.artist_image_url} alt="Album" className="w-full h-full object-cover grayscale" />
                   <div className="absolute bottom-2 right-2 bg-white text-black p-1.5 rounded-full"><Volume2 size={12} /></div>
                </div>
                <div className="flex flex-col justify-center">
                  <div className="text-xs font-bold tracking-widest text-zinc-500 mb-2 bg-zinc-900 inline-block px-2 py-1 rounded-sm">{challenge?.artist_name.toUpperCase()} • TRACK 0{currentRound + 1}</div>
                  <h3 className="text-3xl font-bold text-white leading-none mb-2">{feedback.actualTitle}</h3>
                  <div className="text-sm text-zinc-400">{feedback.album} / {feedback.year}</div>
                  
                  <div className="mt-4 flex justify-between items-end border-t border-zinc-800 pt-4">
                    <div>
                      <div className="text-[10px] font-bold tracking-widest text-zinc-600 mb-1">~ SAMPLE WINDOW (500MS)</div>
                      <div className="font-mono text-zinc-300 text-sm">00:{String(feedback.sliceStart).padStart(2, '0')}.000 — [ 0.5s ] — 00:{String(feedback.sliceStart).padStart(2, '0')}.500</div>
                    </div>
                    <div className="text-green-500 font-bold text-xs tracking-widest">{feedback.isCorrect ? '100% MATCH' : '0% MATCH'}</div>
                  </div>
                </div>
              </div>

              {/* Playback Controls */}
              <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
                <div className="flex justify-between text-[10px] font-bold tracking-widest text-zinc-500 mb-2">
                  <span>AUDIO TIMELINE SLICE (30S PREVIEW WINDOW)</span>
                  <span>00:{String(feedback.sliceStart).padStart(2, '0')}.0 / 00:30.0</span>
                </div>
                <div className="h-12 bg-zinc-800 rounded mb-4 relative overflow-hidden flex items-center px-1">
                   {/* Fake waveform */}
                   {Array.from({ length: 60 }).map((_, i) => (
                      <div key={i} className="flex-1 h-full flex items-center justify-center">
                        <div className="w-[1px] bg-zinc-600" style={{ height: `${Math.random() * 80 + 20}%` }} />
                      </div>
                   ))}
                   {/* Slice indicator box */}
                   <div className="absolute top-0 bottom-0 bg-white/10 border-x border-white z-10 w-[5%] shadow-[0_0_15px_rgba(255,255,255,0.3)]" style={{ left: `${(feedback.sliceStart / 30) * 100}%` }}>
                     <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-black text-[9px] font-bold px-1 py-0.5 rounded z-20 whitespace-nowrap">0.5s SLICE</div>
                   </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={playCurrentSnippet} className="flex-1 bg-zinc-800 hover:bg-zinc-700 transition-colors py-3 rounded text-xs font-bold tracking-widest text-zinc-300 flex items-center justify-center gap-2">
                    <RefreshCw size={14} /> REPLAY 0.5s SLICE
                  </button>
                  <button onClick={playFullPreview} className="flex-1 bg-zinc-800 hover:bg-zinc-700 transition-colors py-3 rounded text-xs font-bold tracking-widest text-zinc-300 flex items-center justify-center gap-2">
                    <Play size={14} /> PLAY 30s PREVIEW
                  </button>
                </div>
              </div>
            </div>

            {/* Footer Summary */}
            <div className="flex justify-between items-center text-xs font-bold tracking-widest mb-6 px-2">
              <span className="text-zinc-500">CURRENT RUN: <span className="text-white">{score} / {currentRound + 1} PERFECT</span> • <span className="text-green-500">{Math.round((score/(currentRound + 1))*100)}% ACCURACY</span></span>
              <span className="text-zinc-500 flex items-center gap-1"><Clock size={12}/> TOTAL: {(totalTimeMs / 1000).toFixed(1)}s</span>
            </div>

            <button onClick={nextRound} className="w-full bg-white text-black py-5 rounded-xl font-black text-xl flex items-center justify-center gap-2 hover:bg-zinc-200 transition-transform">
              NEXT ROUND ({currentRound < 4 ? currentRound + 2 : 5}/5) →
            </button>
            <div className="text-center mt-4 text-xs tracking-widest text-zinc-600 font-bold">PRESS <span className="bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">ENTER ↵</span> TO CONTINUE</div>
          </div>
        )}

        {gameState === 'GAME_OVER' && (
          <ScoreDistribution 
            date={new Date().toISOString().split('T')[0]} 
            userScore={score} 
            userTimeMs={totalTimeMs} 
            guessHistory={guessHistory}
            artistName={challenge?.artist_name}
          />
        )}
      </main>
    </div>
  );
}
