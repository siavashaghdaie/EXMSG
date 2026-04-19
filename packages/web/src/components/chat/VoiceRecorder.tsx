import { useState, useRef, useEffect } from 'react';
import { Square, Send, Trash2 } from 'lucide-react';

interface VoiceRecorderProps {
  onSend: (blob: Blob, duration: number, transcript?: string) => void;
  onCancel: () => void;
}

// Browser SpeechRecognition types
const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const hasSpeechRecognition = !!SpeechRecognition;

export default function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(true);
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [manualTranscript, setManualTranscript] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout>();
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptRef = useRef('');
  const manualInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    startRecording();
    return () => {
      stopStream();
      stopSpeechRecognition();
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, []);

  // Auto-focus the manual transcript input when recording stops and no auto-transcript
  useEffect(() => {
    if (!isRecording && !transcript && !hasSpeechRecognition && manualInputRef.current) {
      manualInputRef.current.focus();
    }
  }, [isRecording, transcript]);

  const startSpeechRecognition = () => {
    if (!SpeechRecognition) return; // Browser doesn't support it

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          }
        }
        if (finalTranscript) {
          transcriptRef.current = finalTranscript.trim();
          setTranscript(finalTranscript.trim());
        }
      };

      recognition.onerror = (event: any) => {
        // Silently handle — transcription is best-effort
        if (event.error !== 'no-speech') {
          console.warn('[VoiceRecorder] Speech recognition error:', event.error);
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      console.warn('[VoiceRecorder] Speech recognition not available:', err);
    }
  };

  const stopSpeechRecognition = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Use a compatible mime type — Safari doesn't support webm
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'; // Safari fallback

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const actualMime = mimeType.includes('mp4') ? 'audio/mp4' : 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: actualMime });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stopStream();
      };

      mediaRecorder.start(100);
      setIsRecording(true);
      setDuration(0);

      // Start speech recognition in parallel
      startSpeechRecognition();

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
    stopSpeechRecognition();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  };

  const handleSend = () => {
    if (audioBlob) {
      // Use auto-transcript if available, otherwise use manually typed transcript
      const finalTranscript = transcriptRef.current || manualTranscript.trim() || undefined;
      onSend(audioBlob, duration, finalTranscript);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  // Whether to show manual transcript input (no auto-transcription available, recording stopped)
  const showManualInput = !isRecording && audioBlob && !transcript;

  return (
    <div className="flex flex-col gap-1">
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

      {/* Show auto-transcript preview if available */}
      {transcript && !isRecording && (
        <p className="text-xs text-slate-500 dark:text-slate-400 px-3 truncate">
          Transcript: {transcript}
        </p>
      )}

      {/* Manual transcript input — shown when auto-transcription is not available */}
      {showManualInput && (
        <div className="flex items-center gap-2 px-2">
          <input
            ref={manualInputRef}
            type="text"
            value={manualTranscript}
            onChange={(e) => setManualTranscript(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
            placeholder="Type what you said (for Linda to understand)..."
            className="flex-1 text-base bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 rounded-lg px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      )}
    </div>
  );
}
