import { socket } from './socket';

export type CallType = 'audio' | 'video';
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

interface CallState {
  status: CallStatus;
  callId: string;
  callType: CallType;
  conversationId: string;
  remoteUserId: string;
  remoteUserName: string;
  remoteUserAvatar: string | null;
  isMuted: boolean;
  isVideoOff: boolean;
  startTime: number | null;
}

type CallStateListener = (state: CallState) => void;

// Ringtone helper
let ringtoneAudio: HTMLAudioElement | null = null;

function playRingtone(type: 'incoming' | 'outgoing') {
  stopRingtone();
  try {
    // Use OscillatorNode for reliable ringtone (no external files needed)
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    gain.gain.value = 0.15;
    osc.frequency.value = type === 'incoming' ? 440 : 480;
    osc.type = 'sine';
    osc.start();

    // Pulse pattern
    const pulseInterval = setInterval(() => {
      gain.gain.value = gain.gain.value > 0 ? 0 : 0.15;
    }, type === 'incoming' ? 500 : 1500);

    // Store cleanup
    (ringtoneAudio as any) = { stop: () => { osc.stop(); audioCtx.close(); clearInterval(pulseInterval); } };
  } catch {}
}

function stopRingtone() {
  if (ringtoneAudio && (ringtoneAudio as any).stop) {
    (ringtoneAudio as any).stop();
  }
  ringtoneAudio = null;
}

class CallService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private listeners: Set<CallStateListener> = new Set();
  private pendingOffer: RTCSessionDescriptionInit | null = null;

  private state: CallState = {
    status: 'idle',
    callId: '',
    callType: 'audio',
    conversationId: '',
    remoteUserId: '',
    remoteUserName: '',
    remoteUserAvatar: null,
    isMuted: false,
    isVideoOff: false,
    startTime: null,
  };

  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  constructor() {
    this.setupSocketListeners();
  }

  private setupSocketListeners() {
    // Caller receives confirmation with callId
    socket.on<any>('call:initiated', (data) => {
      this.updateState({ callId: data.callId });
    });

    // Callee receives incoming call
    socket.on<any>('call:incoming', (data) => {
      this.handleIncomingCall(data);
    });

    // Caller receives acceptance
    socket.on<any>('call:accepted', (data) => {
      this.handleCallAccepted(data);
    });

    socket.on<any>('call:rejected', () => {
      stopRingtone();
      this.cleanup();
    });

    socket.on<any>('call:ended', () => {
      this.cleanup();
    });

    socket.on<any>('call:expired', () => {
      stopRingtone();
      this.cleanup();
    });

    socket.on<any>('call:missed', () => {
      stopRingtone();
      this.cleanup();
    });

    // WebRTC SDP offer from caller
    socket.on<any>('call:offer', async (data) => {
      if (this.peerConnection && data.offer) {
        try {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          socket.getSocket()?.emit('call:answer', {
            targetUserId: data.senderId,
            answer: this.peerConnection.localDescription,
          });
        } catch (e) {
          console.error('[Call] Failed to handle offer:', e);
        }
      } else {
        // Store offer for when we accept
        this.pendingOffer = data.offer;
      }
    });

    // WebRTC SDP answer from callee
    socket.on<any>('call:answer', async (data) => {
      if (this.peerConnection && data.answer) {
        try {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (e) {
          console.error('[Call] Failed to handle answer:', e);
        }
      }
    });

    // ICE candidates
    socket.on<any>('call:ice-candidate', async (data) => {
      if (data.candidate && this.peerConnection) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('[Call] Failed to add ICE candidate:', e);
        }
      }
    });

    // Legacy signal relay
    socket.on<any>('call:signal', async (data) => {
      if (!this.peerConnection) return;
      try {
        if (data.signal.type === 'offer') {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          socket.getSocket()?.emit('call:signal', {
            targetUserId: data.senderId,
            signal: this.peerConnection.localDescription,
          });
        } else if (data.signal.type === 'answer') {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal));
        }
      } catch (e) {
        console.error('[Call] Signal error:', e);
      }
    });
  }

  subscribe(listener: CallStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private updateState(partial: Partial<CallState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(l => l(this.state));
  }

  getState(): CallState {
    return { ...this.state };
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  // Caller initiates
  async initiateCall(conversationId: string, targetUserId: string, targetUserName: string, callType: CallType, targetUserAvatar?: string | null) {
    if (this.state.status !== 'idle') return; // Already in a call

    try {
      this.updateState({
        status: 'calling',
        callType,
        conversationId,
        remoteUserId: targetUserId,
        remoteUserName: targetUserName,
        remoteUserAvatar: targetUserAvatar || null,
      });

      playRingtone('outgoing');

      // Get local media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });

      // Create peer connection
      this.createPeerConnection();

      // Add local tracks
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // Tell the server to ring the callee (no offer yet — we'll send it after they accept)
      socket.getSocket()?.emit('call:initiate', {
        conversationId,
        targetUserId,
        callType,
      });
    } catch (error) {
      console.error('Failed to initiate call:', error);
      stopRingtone();
      this.cleanup();
    }
  }

  // Callee accepts
  async acceptCall() {
    if (this.state.status !== 'ringing') return;

    try {
      const { remoteUserId, callType, callId } = this.state;

      stopRingtone();

      // Get local media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });

      // Create peer connection
      this.createPeerConnection();

      // Add local tracks
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // If we already have a pending offer, process it
      if (this.pendingOffer) {
        await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(this.pendingOffer));
        const answer = await this.peerConnection!.createAnswer();
        await this.peerConnection!.setLocalDescription(answer);
        socket.getSocket()?.emit('call:answer', {
          targetUserId: remoteUserId,
          answer: this.peerConnection!.localDescription,
        });
        this.pendingOffer = null;
      }

      this.updateState({ status: 'connected', startTime: Date.now() });

      // Tell the server we accepted
      socket.getSocket()?.emit('call:accept', {
        callId,
        targetUserId: remoteUserId,
      });
    } catch (error) {
      console.error('Failed to accept call:', error);
      this.rejectCall('media_error');
    }
  }

  // Callee rejects
  rejectCall(reason?: string) {
    const { remoteUserId, callId } = this.state;
    stopRingtone();
    socket.getSocket()?.emit('call:reject', {
      callId,
      targetUserId: remoteUserId,
      reason,
    });
    this.cleanup();
  }

  // Either party ends
  endCall() {
    const { remoteUserId, callId } = this.state;
    stopRingtone();
    if (remoteUserId) {
      socket.getSocket()?.emit('call:end', {
        callId,
        targetUserId: remoteUserId,
      });
    }
    this.cleanup();
  }

  toggleMute() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        this.updateState({ isMuted: !audioTrack.enabled });
      }
    }
  }

  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        this.updateState({ isVideoOff: !videoTrack.enabled });
      }
    }
  }

  private createPeerConnection() {
    this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.getSocket()?.emit('call:ice-candidate', {
          targetUserId: this.state.remoteUserId,
          candidate: event.candidate,
        });
      }
    };

    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      // Force re-render
      this.listeners.forEach(l => l(this.state));
    };

    this.peerConnection.onnegotiationneeded = async () => {
      // Caller creates offer when negotiation is needed
      if (this.state.status === 'calling' || this.state.status === 'connected') {
        try {
          const offer = await this.peerConnection!.createOffer();
          await this.peerConnection!.setLocalDescription(offer);
          socket.getSocket()?.emit('call:offer', {
            targetUserId: this.state.remoteUserId,
            offer: this.peerConnection!.localDescription,
          });
        } catch (e) {
          console.error('[Call] Negotiation error:', e);
        }
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.endCall();
      }
    };
  }

  private handleIncomingCall(data: any) {
    // If already in a call, auto-reject as busy
    if (this.state.status !== 'idle') {
      socket.getSocket()?.emit('call:reject', {
        callId: data.callId,
        targetUserId: data.callerId,
        reason: 'busy',
      });
      return;
    }

    playRingtone('incoming');

    this.updateState({
      status: 'ringing',
      callId: data.callId,
      callType: data.callType,
      conversationId: data.conversationId,
      remoteUserId: data.callerId,
      remoteUserName: data.callerName,
      remoteUserAvatar: data.callerAvatar || null,
    });
  }

  private handleCallAccepted(_data: any) {
    stopRingtone();
    this.updateState({ status: 'connected', startTime: Date.now() });

    // The callee accepted — the onnegotiationneeded handler will fire
    // when we add tracks, creating and sending the offer automatically
  }

  private cleanup() {
    stopRingtone();
    this.pendingOffer = null;
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection?.close();
    this.peerConnection = null;
    this.updateState({
      status: 'idle',
      callId: '',
      conversationId: '',
      remoteUserId: '',
      remoteUserName: '',
      remoteUserAvatar: null,
      isMuted: false,
      isVideoOff: false,
      startTime: null,
    });
  }
}

export const callService = new CallService();
