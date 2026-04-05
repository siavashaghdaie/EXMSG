import { socket } from './socket';

export type CallType = 'audio' | 'video';
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

interface CallState {
  status: CallStatus;
  callType: CallType;
  conversationId: string;
  remoteUserId: string;
  remoteUserName: string;
  isMuted: boolean;
  isVideoOff: boolean;
  startTime: number | null;
}

type CallStateListener = (state: CallState) => void;

class CallService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private listeners: Set<CallStateListener> = new Set();

  private state: CallState = {
    status: 'idle',
    callType: 'audio',
    conversationId: '',
    remoteUserId: '',
    remoteUserName: '',
    isMuted: false,
    isVideoOff: false,
    startTime: null,
  };

  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  constructor() {
    this.setupSocketListeners();
  }

  private setupSocketListeners() {
    socket.on<any>('call:incoming', (data) => {
      this.handleIncomingCall(data);
    });

    socket.on<any>('call:accepted', (data) => {
      this.handleCallAccepted(data);
    });

    socket.on<any>('call:rejected', (data) => {
      this.handleCallRejected(data);
    });

    socket.on<any>('call:ended', (data) => {
      this.handleCallEnded(data);
    });

    socket.on<any>('call:ice-candidate', (data) => {
      this.handleIceCandidate(data);
    });

    socket.on<any>('call:signal', (data) => {
      this.handleSignal(data);
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

  async initiateCall(conversationId: string, targetUserId: string, targetUserName: string, callType: CallType) {
    try {
      this.updateState({
        status: 'calling',
        callType,
        conversationId,
        remoteUserId: targetUserId,
        remoteUserName: targetUserName,
      });

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

      // Create and send offer
      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);

      socket.getSocket()?.emit('call:initiate', {
        conversationId,
        targetUserId,
        callType,
        offer: this.peerConnection!.localDescription,
      });

    } catch (error) {
      console.error('Failed to initiate call:', error);
      this.endCall();
    }
  }

  async acceptCall() {
    try {
      const { conversationId, remoteUserId, callType } = this.state;

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

      this.updateState({ status: 'connected', startTime: Date.now() });

      socket.getSocket()?.emit('call:accept', {
        conversationId,
        targetUserId: remoteUserId,
      });

    } catch (error) {
      console.error('Failed to accept call:', error);
      this.rejectCall('media_error');
    }
  }

  rejectCall(reason?: string) {
    const { conversationId, remoteUserId } = this.state;
    socket.getSocket()?.emit('call:reject', {
      conversationId,
      targetUserId: remoteUserId,
      reason,
    });
    this.cleanup();
  }

  endCall() {
    const { conversationId, remoteUserId } = this.state;
    if (remoteUserId) {
      socket.getSocket()?.emit('call:end', {
        conversationId,
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
      this.listeners.forEach(l => l(this.state));
    };

    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection?.connectionState === 'disconnected' ||
          this.peerConnection?.connectionState === 'failed') {
        this.endCall();
      }
    };
  }

  private async handleIncomingCall(data: any) {
    this.updateState({
      status: 'ringing',
      callType: data.callType,
      conversationId: data.conversationId,
      remoteUserId: data.callerId,
      remoteUserName: data.callerName,
    });

    // Store the offer for later
    if (data.offer && this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    }
  }

  private async handleCallAccepted(data: any) {
    this.updateState({ status: 'connected', startTime: Date.now() });

    if (data.answer && this.peerConnection) {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  }

  private handleCallRejected(_data: any) {
    this.cleanup();
  }

  private handleCallEnded(_data: any) {
    this.cleanup();
  }

  private async handleIceCandidate(data: any) {
    if (data.candidate && this.peerConnection) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('Failed to add ICE candidate:', e);
      }
    }
  }

  private async handleSignal(data: any) {
    if (!this.peerConnection) return;

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
  }

  private cleanup() {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection?.close();
    this.peerConnection = null;
    this.updateState({
      status: 'idle',
      conversationId: '',
      remoteUserId: '',
      remoteUserName: '',
      isMuted: false,
      isVideoOff: false,
      startTime: null,
    });
  }
}

export const callService = new CallService();
