import { useState, useRef, useEffect } from 'react';
import { Square, Send, Trash2 } from 'lucide-react';

interface VoiceRecorderProps {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}

export default function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(true);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout>();
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    startRecording();
    return () => {
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stopStream();
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone access denied:', err);
      onCancel();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob, duration);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
      {/* Cancel */}
      <button
        onClick={() => { stopRecording(); onCancel(); }}
        className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-100 rounded-full transition"
        title="Cancel"
      >
        <Trash2 size={18} />
      </button>

      {/* Recording indicator / Playback */}
      <div className="flex-1 flex items-center gap-3">
        {isRecording ? (
          <>
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <div className="flex-1 flex items-center gap-1">
              {/* Simple waveform visualization */}
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 bg-red-400 rounded-full"
                  style={{
                    height: `${Math.random() * 20 + 4}px`,
                    animation: `wave 0.5s ease-in-out ${i * 0.05}s infinite alternate`,
                  }}
                />
              ))}
            </div>
          </>
        ) : audioUrl ? (
          <audio src={audioUrl} controls className="flex-1 h-8" />
        ) : null}

        <span className="text-sm font-mono text-red-600 dark:text-red-400 tabular-nums min-w-[45px]">
          {formatTime(duration)}
        </span>
      </div>

      {/* Stop / Send */}
      {isRecording ? (
        <button
          onClick={stopRecording}
          className="p-2.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition"
          title="Stop recording"
        >
          <Square size={16} fill="white" />
        </button>
      ) : (
        <button
          onClick={handleSend}
          className="p-2.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition"
          title="Send voice message"
        >
          <Send size={16} />
        </button>
      )}
    </div>
  );
}
