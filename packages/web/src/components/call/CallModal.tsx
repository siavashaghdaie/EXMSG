import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { callService } from '@/services/callService';

export default function CallModal() {
  const [callState, setCallState] = useState(callService.getState());
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    return callService.subscribe(setCallState);
  }, []);

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current) {
      const stream = callService.getLocalStream();
      if (stream) localVideoRef.current.srcObject = stream;
    }
    if (remoteVideoRef.current) {
      const stream = callService.getRemoteStream();
      if (stream) remoteVideoRef.current.srcObject = stream;
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
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-slate-900 rounded-2xl w-full max-w-md mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 text-center">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-700 flex items-center justify-center text-3xl font-bold text-white">
            {callState.remoteUserName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <h2 className="text-xl font-semibold text-white">
            {callState.remoteUserName}
          </h2>
          <p className="text-slate-400 mt-1">
            {isRinging && 'Incoming call...'}
            {isCalling && 'Calling...'}
            {isConnected && formatTime(elapsed)}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            {isVideo ? 'Video Call' : 'Voice Call'}
          </p>
        </div>

        {/* Video area */}
        {isVideo && isConnected && (
          <div className="relative bg-black aspect-video mx-4 rounded-lg overflow-hidden mb-4">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-2 right-2 w-24 h-32 object-cover rounded-lg border-2 border-white/30"
            />
          </div>
        )}

        {/* Controls */}
        <div className="p-6 flex items-center justify-center gap-4">
          {isRinging ? (
            <>
              <button
                onClick={() => callService.rejectCall()}
                className="p-4 bg-red-500 text-white rounded-full hover:bg-red-600 transition"
              >
                <PhoneOff size={24} />
              </button>
              <button
                onClick={() => callService.acceptCall()}
                className="p-4 bg-green-500 text-white rounded-full hover:bg-green-600 transition animate-pulse"
              >
                <Phone size={24} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => callService.toggleMute()}
                className={`p-3 rounded-full transition ${
                  callState.isMuted
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-slate-700 text-white hover:bg-slate-600'
                }`}
              >
                {callState.isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              {isVideo && (
                <button
                  onClick={() => callService.toggleVideo()}
                  className={`p-3 rounded-full transition ${
                    callState.isVideoOff
                      ? 'bg-red-500/20 text-red-400'
                      : 'bg-slate-700 text-white hover:bg-slate-600'
                  }`}
                >
                  {callState.isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                </button>
              )}
              <button
                onClick={() => callService.endCall()}
                className="p-4 bg-red-500 text-white rounded-full hover:bg-red-600 transition"
              >
                <PhoneOff size={24} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
