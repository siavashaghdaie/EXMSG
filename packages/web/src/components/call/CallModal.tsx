import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2, Volume1 } from 'lucide-react';
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

    if (remoteStream) {
      // Always attach to audio element for playback
      if (remoteAudioRef.current) {
        if (remoteAudioRef.current.srcObject !== remoteStream) {
          remoteAudioRef.current.srcObject = remoteStream;
        }
        const playPromise = remoteAudioRef.current.play();
        if (playPromise) {
          playPromise.catch(e => {
            console.warn('[CallModal] Audio autoplay blocked:', e);
          });
        }
      }

      // For video calls, also attach to video element
      if (remoteVideoRef.current) {
        if (remoteVideoRef.current.srcObject !== remoteStream) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      }
    }
  }, [callState]);

  // Timer
  useEffect(() => {
    if (callState.status !== 'connected' || !callState.startTime) return;
    setElapsed(0);
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

  // iOS-style control button component
  const ControlButton = ({ active, activeColor, icon, label, onClick, size = 'normal' }: {
    active?: boolean;
    activeColor?: string;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    size?: 'normal' | 'large';
  }) => (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={onClick}
        className={`rounded-full transition-all active:scale-95 ${
          size === 'large' ? 'p-5' : 'p-4'
        } ${
          active
            ? `${activeColor || 'bg-white text-slate-900'}`
            : 'bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm'
        }`}
      >
        {icon}
      </button>
      <span className="text-white/60 text-xs font-medium">{label}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-between">
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

      {/* Top section: Avatar and caller info */}
      <div className={`relative z-10 text-center pt-16 ${isVideo && isConnected ? 'mt-auto' : ''}`}>
        {!(isVideo && isConnected) && (
          <div className="mb-6">
            <div className={`relative inline-block ${isRinging ? 'animate-pulse' : ''}`}>
              {isRinging && (
                <>
                  <div className="absolute -inset-4 rounded-full border-2 border-green-400/30 animate-ping" />
                  <div className="absolute -inset-8 rounded-full border border-green-400/15 animate-ping" style={{ animationDelay: '0.5s' }} />
                </>
              )}
              {isCalling && (
                <div className="absolute -inset-4 rounded-full border-2 border-blue-400/30 animate-ping" />
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
        <p className="text-white/60 mt-2 text-base">
          {isRinging && 'Incoming Call...'}
          {isCalling && 'Calling...'}
          {isConnected && formatTime(elapsed)}
        </p>
        {!isConnected && (
          <p className="text-white/40 text-sm mt-1">
            {isVideo ? 'Video Call' : 'Voice Call'}
          </p>
        )}
      </div>

      {/* Hidden audio element for remote stream playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

      {/* Bottom controls section */}
      <div className="relative z-10 w-full pb-12 pt-8 bg-gradient-to-t from-black/40 to-transparent">
        {isRinging ? (
          /* Incoming call: Decline and Accept */
          <div className="flex items-center justify-center gap-16">
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => callService.rejectCall()}
                className="p-5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all shadow-lg shadow-red-500/30 active:scale-95"
              >
                <PhoneOff size={28} />
              </button>
              <span className="text-white/60 text-xs font-medium">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => callService.acceptCall()}
                className="p-5 bg-green-500 text-white rounded-full hover:bg-green-600 transition-all shadow-lg shadow-green-500/30 active:scale-95 animate-bounce"
              >
                <Phone size={28} />
              </button>
              <span className="text-white/60 text-xs font-medium">Accept</span>
            </div>
          </div>
        ) : (
          /* Active call or calling: Grid of controls + end button */
          <div className="flex flex-col items-center gap-8">
            {/* Top row: mute, video, speaker */}
            <div className="flex items-start justify-center gap-8">
              <ControlButton
                active={callState.isMuted}
                activeColor="bg-white text-slate-900"
                icon={callState.isMuted ? <MicOff size={22} /> : <Mic size={22} />}
                label={callState.isMuted ? 'Unmute' : 'Mute'}
                onClick={() => callService.toggleMute()}
              />
              {isVideo && (
                <ControlButton
                  active={callState.isVideoOff}
                  activeColor="bg-white text-slate-900"
                  icon={callState.isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
                  label={callState.isVideoOff ? 'Camera On' : 'Camera Off'}
                  onClick={() => callService.toggleVideo()}
                />
              )}
              <ControlButton
                active={callState.isSpeakerOn}
                activeColor="bg-white text-slate-900"
                icon={callState.isSpeakerOn ? <Volume2 size={22} /> : <Volume1 size={22} />}
                label="Speaker"
                onClick={() => callService.toggleSpeaker()}
              />
            </div>

            {/* End call button */}
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={() => callService.endCall()}
                className="p-5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all shadow-lg shadow-red-500/30 active:scale-95"
              >
                <PhoneOff size={28} />
              </button>
              <span className="text-white/60 text-xs font-medium">End</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
