import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause } from 'lucide-react';

// ── Global single-playback: only one voice message plays at a time ──
const VOICE_PLAY_EVENT = 'voiceplayer:play';
let nextPlayerId = 0;

interface VoiceMessagePlayerProps {
  url: string;
  duration?: number;
}

/**
 * Generate a deterministic waveform pattern from a URL string.
 * This gives each voice message a unique-looking waveform without needing
 * to decode the actual audio data (which would require fetching the whole file).
 */
function generateWaveform(seed: string, bars: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const waveform: number[] = [];
  for (let i = 0; i < bars; i++) {
    // Simple pseudo-random based on seed hash + bar index
    hash = ((hash << 13) ^ hash) - 1;
    const val = ((hash >>> 0) % 100) / 100;
    // Shape it to look like a voice waveform (louder in the middle, quieter at edges)
    const position = i / bars;
    const envelope = Math.sin(position * Math.PI) * 0.5 + 0.5;
    waveform.push(0.15 + val * 0.85 * envelope);
  }
  return waveform;
}

export default function VoiceMessagePlayer({ url, duration: initialDuration }: VoiceMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformRef = useRef<HTMLDivElement>(null);
  const playerIdRef = useRef(++nextPlayerId);
  const animFrameRef = useRef<number>(0);
  const BAR_COUNT = 40;

  // Deterministic waveform from URL
  const waveform = useMemo(() => generateWaveform(url, BAR_COUNT), [url]);

  // ── Single-playback: listen for other players starting ──
  useEffect(() => {
    const handleOtherPlay = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.playerId !== playerIdRef.current && audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    };

    window.addEventListener(VOICE_PLAY_EVENT, handleOtherPlay);
    return () => window.removeEventListener(VOICE_PLAY_EVENT, handleOtherPlay);
  }, []);

  // ── Smooth progress tracking via requestAnimationFrame ──
  useEffect(() => {
    if (isPlaying) {
      const tick = () => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
        }
        animFrameRef.current = requestAnimationFrame(tick);
      };
      animFrameRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(animFrameRef.current);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying]);

  // ── Audio event listeners ──
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateDuration = () => {
      if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    // Multiple events to catch duration — some browsers fire one but not the other
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('canplaythrough', updateDuration);
    audio.addEventListener('ended', onEnded);

    // If metadata is already loaded (cached audio), grab duration immediately
    if (audio.duration && isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    }

    return () => {
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('canplaythrough', updateDuration);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = useCallback(async () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // Broadcast to pause all other players
      window.dispatchEvent(new CustomEvent(VOICE_PLAY_EVENT, {
        detail: { playerId: playerIdRef.current },
      }));
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.error('[VoicePlayer] Playback failed:', err);
        setIsPlaying(false);
      }
    }
  }, [isPlaying]);

  // Seek from a click/touch position on the waveform
  const seekFromPosition = useCallback((clientX: number) => {
    if (!audioRef.current || !waveformRef.current) return;
    // Use whichever duration we have — from audio element or fallback
    const dur = audioRef.current.duration && isFinite(audioRef.current.duration)
      ? audioRef.current.duration
      : duration;
    if (!dur) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audioRef.current.currentTime = pct * dur;
    setCurrentTime(pct * dur);
  }, [duration]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    seekFromPosition(e.clientX);
  }, [seekFromPosition]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.changedTouches.length > 0) {
      e.preventDefault();
      seekFromPosition(e.changedTouches[0].clientX);
    }
  }, [seekFromPosition]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="flex items-center gap-2.5 min-w-[220px] max-w-[320px] py-1">
      <audio ref={audioRef} src={url} preload="auto" playsInline />

      {/* Play/Pause button */}
      <button
        onClick={togglePlay}
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600 active:scale-95 transition-all"
      >
        {isPlaying
          ? <Pause size={18} fill="white" />
          : <Play size={18} fill="white" className="ml-0.5" />
        }
      </button>

      {/* Waveform + duration */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {/* Waveform bars */}
        <div
          ref={waveformRef}
          className="flex items-center gap-[2px] h-8 cursor-pointer"
          onClick={handleClick}
          onTouchEnd={handleTouchEnd}
        >
          {waveform.map((amplitude, i) => {
            const barProgress = i / BAR_COUNT;
            const isPlayed = barProgress <= progress;
            const height = Math.max(3, amplitude * 28);
            return (
              <div
                key={i}
                className={`rounded-full transition-colors duration-150 ${
                  isPlayed
                    ? 'bg-blue-500'
                    : 'bg-slate-300 dark:bg-slate-500'
                }`}
                style={{
                  width: '2.5px',
                  height: `${height}px`,
                  flexShrink: 0,
                }}
              />
            );
          })}
        </div>

        {/* Duration / current time */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums font-medium">
            {isPlaying || currentTime > 0
              ? formatTime(currentTime)
              : formatTime(duration)
            }
          </span>
          {duration > 0 && (isPlaying || currentTime > 0) && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
              {formatTime(duration)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
