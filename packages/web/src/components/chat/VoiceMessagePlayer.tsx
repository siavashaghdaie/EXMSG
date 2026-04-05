import { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface VoiceMessagePlayerProps {
  url: string;
  duration?: number;
}

export default function VoiceMessagePlayer({ url, duration: initialDuration }: VoiceMessagePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = pct * duration;
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      <audio ref={audioRef} src={url} preload="metadata" />

      <button
        onClick={togglePlay}
        className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600 transition"
      >
        {isPlaying ? <Pause size={16} fill="white" /> : <Play size={16} fill="white" className="ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-0.5">
        {/* Progress bar */}
        <div
          className="h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full cursor-pointer relative overflow-hidden"
          onClick={handleSeek}
        >
          <div
            className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[10px] text-slate-500 tabular-nums">
          {isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
