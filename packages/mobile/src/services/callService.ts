import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
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
  isSpeakerOn: boolean;
  startTime: number | null;
}

type CallStateListener = (state: CallState) => void;

class CallService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private listeners: Set<CallStateListener> = new Set();
  private pendingOffer: any | null = null;
  private unsubscribers: (() => void)[] = [];

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
    isSpeakerOn: false,
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
    // Clean up any previous listeners
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    // Caller receives confirmation with callId
    this.unsubscribers.push(
      socket.on<any>('call:initiated', (data) => {
        this.updateState({ callId: data.callId });
      })
    );

    // Callee receives incoming call
    this.unsubscribers.push(
      socket.on<any>('call:incoming', (data) => {
        this.handleIncomingCall(data);
      })
    );

    // Caller receives acceptance
    this.unsubscribers.push(
      socket.on<any>('call:accepted', (_data) => {
        this.handleCallAccepted();
      })
    );

    this.unsubscribers.push(
      socket.on<any>('call:rejected', () => {
        this.cleanup();
      })
    );

    this.unsubscribers.push(
      socket.on<any>('call:ended', () => {
        this.cleanup();
      })
    );

    this.unsubscribers.push(
      socket.on<any>('call:expired', () => {
        this.cleanup();
      })
    );

    this.unsubscribers.push(
      socket.on<any>('call:missed', () => {
        this.cleanup();
      })
    );

    // WebRTC SDP offer from caller
    this.unsubscribers.push(
      socket.on<any>('call:offer', async (data) => {
        if (this.peerConnection && data.offer) {
          try {
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription(data.offer)
            );
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            socket.emitCallAnswer({
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
      })
    );

    // WebRTC SDP answer from callee
    this.unsubscribers.push(
      socket.on<any>('call:answer', async (data) => {
        if (this.peerConnection && data.answer) {
          try {
            await this.peerConnection.setRemoteDescription(
              new RTCSessionDescription(data.answer)
            );
          } catch (e) {
            console.error('[Call] Failed to handle answer:', e);
          }
        }
      })
    );

    // ICE candidates
    this.unsubscribers.push(
      socket.on<any>('call:ice-candidate', async (data) => {
        if (data.candidate && this.peerConnection) {
          try {
            await this.peerConnection.addIceCandidate(
              new RTCIceCandidate(data.candidate)
            );
          } catch (e) {
            console.error('[Call] Failed to add ICE candidate:', e);
          }
        }
      })
    );
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
  async initiateCall(
    conversationId: string,
    targetUserId: string,
    targetUserName: string,
    callType: CallType,
    targetUserAvatar?: string | null
  ) {
    if (this.state.status !== 'idle') return;

    try {
      this.updateState({
        status: 'calling',
        callType,
        conversationId,
        remoteUserId: targetUserId,
        remoteUserName: targetUserName,
        remoteUserAvatar: targetUserAvatar || null,
      });

      // Get local media
      this.localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video'
          ? { facingMode: 'user', width: 640, height: 480 }
          : false,
      }) as MediaStream;

      // Create peer connection
      this.createPeerConnection();

      // Add local tracks
      this.localStream.getTracks().forEach((track: any) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // Tell server to ring the callee
      socket.emitCallInitiate({
        conversationId,
        targetUserId,
        callType,
      });
    } catch (error) {
      console.error('Failed to initiate call:', error);
      this.cleanup();
    }
  }

  // Callee accepts
  async acceptCall() {
    if (this.state.status !== 'ringing') return;

    try {
      const { remoteUserId, callType, callId } = this.state;

      // Get local media
      this.localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video'
          ? { facingMode: 'user', width: 640, height: 480 }
          : false,
      }) as MediaStream;

      // Create peer connection
      this.createPeerConnection();

      // Add local tracks
      this.localStream.getTracks().forEach((track: any) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // If we already have a pending offer, process it
      if (this.pendingOffer) {
        await this.peerConnection!.setRemoteDescription(
          new RTCSessionDescription(this.pendingOffer)
        );
        const answer = await this.peerConnection!.createAnswer();
        await this.peerConnection!.setLocalDescription(answer);
        socket.emitCallAnswer({
          targetUserId: remoteUserId,
          answer: this.peerConnection!.localDescription,
        });
        this.pendingOffer = null;
      }

      this.updateState({ status: 'connected', startTime: Date.now() });

      // Tell server we accepted
      socket.emitCallAccept({
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
    socket.emitCallReject({
      callId,
      targetUserId: remoteUserId,
      reason,
    });
    this.cleanup();
  }

  // Either party ends
  endCall() {
    const { remoteUserId, callId } = this.state;
    if (remoteUserId) {
      socket.emitCallEnd({
        callId,
        targetUserId: remoteUserId,
      });
    }
    this.cleanup();
  }

  toggleMute() {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const audioTrack = audioTracks[0];
        audioTrack.enabled = !audioTrack.enabled;
        this.updateState({ isMuted: !audioTrack.enabled });
      }
    }
  }

  toggleVideo() {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const videoTrack = videoTracks[0];
        videoTrack.enabled = !videoTrack.enabled;
        this.updateState({ isVideoOff: !videoTrack.enabled });
      }
    }
  }

  toggleSpeaker() {
    // Speaker toggle — handled via InCallManager in production
    this.updateState({ isSpeakerOn: !this.state.isSpeakerOn });
  }

  async switchCamera() {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        (videoTracks[0] as any)._switchCamera?.();
      }
    }
  }

  private createPeerConnection() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    this.peerConnection.addEventListener('icecandidate' as any, (event: any) => {
      if (event.candidate) {
        socket.emitCallIceCandidate({
          targetUserId: this.state.remoteUserId,
          candidate: event.candidate,
        });
      }
    });

    this.peerConnection.addEventListener('track' as any, (event: any) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        // Force re-render
        this.listeners.forEach(l => l(this.state));
      }
    });

    this.peerConnection.addEventListener('negotiationneeded' as any, async () => {
      // Caller creates offer when negotiation is needed
      if (this.state.status === 'calling' || this.state.status === 'connected') {
        try {
          const offer = await this.peerConnection!.createOffer({});
          await this.peerConnection!.setLocalDescription(offer);
          socket.emitCallOffer({
            targetUserId: this.state.remoteUserId,
            offer: this.peerConnection!.localDescription,
          });
        } catch (e) {
          console.error('[Call] Negotiation error:', e);
        }
      }
    });

    this.peerConnection.addEventListener('connectionstatechange' as any, () => {
      const connState = (this.peerConnection as any)?.connectionState;
      if (connState === 'disconnected' || connState === 'failed' || connState === 'closed') {
        this.endCall();
      }
    });
  }

  private handleIncomingCall(data: any) {
    // If already in a call, auto-reject as busy
    if (this.state.status !== 'idle') {
      socket.emitCallReject({
        callId: data.callId,
        targetUserId: data.callerId,
        reason: 'busy',
      });
      return;
    }

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

  private handleCallAccepted() {
    this.updateState({ status: 'connected', startTime: Date.now() });
    // The onnegotiationneeded handler will fire when we add tracks
  }

  private cleanup() {
    this.pendingOffer = null;
    if (this.localStream) {
      this.localStream.getTracks().forEach((t: any) => t.stop());
      this.localStream = null;
    }
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
      isSpeakerOn: false,
      startTime: null,
    });
  }
}

export const callService = new CallService();
