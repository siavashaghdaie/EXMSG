import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { callService } from '@/services/callService';
import Avatar from '@/components/common/Avatar';

export default function CallModal() {
  const [callState, setCallState] = useState(callService.getState());
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    return callService.subscribe(setCallState);
  }, []);

  // Attach streams to video/audio elements
  useEffect(() => {
    const localStream = callService.getLocalStream();
    const remoteStream = callService.getRemoteStream();

    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }

    // For video calls, attach to video element
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }

    // For audio calls, attach to audio element
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(e => console.warn('[Call] Audio autoplay blocked:', e));
    }
  }, [callState]);

  // Timer
  useEffect(() => {
    if (callState.status !== 'connected' || !callState.startTime) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - callState.startTime!) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [callState.status, callState.startTime]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (callState.status === 'idle') return null;

  const isRinging = callState.status === 'ringing';
  const isCalling = callState.status === 'calling';
  const isConnected = callState.status === 'connected';
  const isVideo = callState.callType === 'video';

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      {/* Full-screen video for connected video calls */}
      {isVideo && isConnected && (
        <div className="absolute inset-0">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          {/* Local video PiP */}
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute top-4 right-4 w-32 h-44 object-cover rounded-2xl border-2 border-white/30 shadow-lg"
          />
        </div>
      )}

      {/* Overlay content */}
      <div className={`relative z-10 text-center ${isVideo && isConnected ? 'mt-auto mb-32' : ''}`}>
        {/* Avatar / Status - show when not in active video */}
        {!(isVideo && isConnected) && (
          <div className="mb-6">
            {/* Animated ring for ringing state */}
            <div className={`relative inline-block ${isRinging ? 'animate-pulse' : ''}`}>
              {isRinging && (
                <>
                  <div className="absolute -inset-3 rounded-full border-2 border-green-400/40 animate-ping" />
                  <div className="absolute -inset-6 rounded-full border border-green-400/20 animate-ping" style={{ animationDelay: '0.5s' }} />
                </>
              )}
              {isCalling && (
                <div className="absolute -inset-3 rounded-full border-2 border-blue-400/40 animate-ping" />
              )}
              <div className="relative">
                <Avatar
                  src={callState.remoteUserAvatar || undefined}
                  name={callState.remoteUserName}
                  size="xl"
                  className="ring-4 ring-white/20"
                />
              </div>
            </div>
          </div>
        )}

        <h2 className="text-2xl font-semibold text-white drop-shadow-lg">
          {callState.remoteUserName}
        </h2>
        <p className="text-white/70 mt-2 text-lg">
          {isRinging && (isVideo ? '📹 Incoming Video Call...' : '📞 Incoming Voice Call...')}
          {isCalling && 'Calling...'}
          {isConnected && formatTime(elapsed)}
        </p>
        {!isConnected && (
          <p className="text-white/40 text-sm mt-1">
            {isVideo ? 'Video Call' : 'Voice Call'}
          </p>
        )}
      </div>

      {/* Hidden audio element for remote stream (always present for audio playback) */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Controls bar */}
      <div className="absolute bottom-0 left-0 right-0 pb-10 pt-6 bg-gradient-to-t from-black/60 to-transparent">
        <div className="flex items-center justify-center gap-5">
          {isRinging ? (
            <>
              <button
                onClick={() => callService.rejectCall()}
                className="p-5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all shadow-lg shadow-red-500/30 active:scale-95"
                title="Decline"
              >
                <PhoneOff size={28} />
              </button>
              <button
                onClick={() => callService.acceptCall()}
                className="p-5 bg-green-500 text-white rounded-full hover:bg-green-600 transition-all shadow-lg shadow-green-500/30 active:scale-95 animate-bounce"
                title="Accept"
              >
                <Phone size={28} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => callService.toggleMute()}
                className={`p-4 rounded-full transition-all active:scale-95 ${
                  callState.isMuted
                    ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                    : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                }`}
                title={callState.isMuted ? 'Unmute' : 'Mute'}
              >
                {callState.isMuted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
              {isVideo && (
                <button
                  onClick={() => callService.toggleVideo()}
                  className={`p-4 rounded-full transition-all active:scale-95 ${
                    callState.isVideoOff
                      ? 'bg-red-500 text-white shadow-lg shadow-red-500/30'
                      : 'bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm'
                  }`}
                  title={callState.isVideoOff ? 'Turn on camera' : 'Turn off camera'}
                >
                  {callState.isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
                </button>
              )}
              <button
                onClick={() => callService.endCall()}
                className="p-5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all shadow-lg shadow-red-500/30 active:scale-95"
                title="End call"
              >
                <PhoneOff size={28} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
