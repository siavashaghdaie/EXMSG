import { socket } from './socket';
import { api } from './api';

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

// Ringtone helper
let ringtoneAudio: HTMLAudioElement | null = null;

function playRingtone(type: 'incoming' | 'outgoing') {
  stopRingtone();
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

    if (type === 'incoming') {
      // Incoming: single 440 Hz tone pulsing 0.5s on / 0.5s off
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      gain.gain.value = 0.15;
      osc.frequency.value = 440;
      osc.type = 'sine';
      osc.start();

      const pulseInterval = setInterval(() => {
        gain.gain.value = gain.gain.value > 0 ? 0 : 0.15;
      }, 500);

      (ringtoneAudio as any) = { stop: () => { osc.stop(); audioCtx.close(); clearInterval(pulseInterval); } };
    } else {
      // Outgoing: North American ringback tone — 440 Hz + 480 Hz dual tone
      // Cadence: 2 seconds ON, 4 seconds OFF (clearly distinct from busy tone
      // which is 480+620 Hz with 0.5s on / 0.5s off)
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);
      gain.gain.value = 0.12;
      osc1.frequency.value = 440;
      osc2.frequency.value = 480;
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.start();
      osc2.start();

      // 2s on, 4s off cadence using recursive timeouts for accurate timing
      let cadenceTimer: ReturnType<typeof setTimeout>;
      const doCadence = (on: boolean) => {
        gain.gain.value = on ? 0.12 : 0;
        cadenceTimer = setTimeout(() => doCadence(!on), on ? 2000 : 4000);
      };
      doCadence(true);

      (ringtoneAudio as any) = {
        stop: () => {
          clearTimeout(cadenceTimer);
          osc1.stop();
          osc2.stop();
          audioCtx.close();
        },
      };
    }
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
  private pendingCandidates: RTCIceCandidateInit[] = []; // Buffer ICE candidates until peer connection + remote desc ready
  private isCaller: boolean = false;
  // Speaker state is tracked in CallState.isSpeakerOn and handled by CallModal
  private _remoteUserId: string = '';

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

  // ICE servers fetched from backend (short-lived TURN credentials)
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  private iceServersFetchedAt: number = 0;

  constructor() {
    this.setupSocketListeners();
  }

  // Fetch fresh TURN credentials from backend (cached for 1 hour)
  private async fetchIceServers(): Promise<void> {
    const ONE_HOUR = 3600000;
    if (Date.now() - this.iceServersFetchedAt < ONE_HOUR) return;

    try {
      const response = await api.getTurnCredentials();
      if (response?.iceServers) {
        this.iceServers = response.iceServers;
        this.iceServersFetchedAt = Date.now();
        console.log('[Call] TURN credentials fetched:', this.iceServers.length, 'servers');
      }
    } catch (e) {
      console.warn('[Call] Failed to fetch TURN credentials, using STUN only:', e);
    }
  }

  private setupSocketListeners() {
    const s = socket;

    // Remove any previous listeners to prevent duplicate events on reconnect
    s.off('call:initiated');
    s.off('call:incoming');
    s.off('call:accepted');
    s.off('call:accepted-elsewhere');
    s.off('call:rejected');
    s.off('call:ended');
    s.off('call:expired');
    s.off('call:missed');
    s.off('call:offer');
    s.off('call:answer');
    s.off('call:ice-candidate');
    s.off('call:signal');

    // Caller receives confirmation with callId
    socket.on<any>('call:initiated', (data) => {
      console.log('[Call] call:initiated received, callId:', data.callId, 'status:', this.state.status);
      // Only accept if we're actually in a calling state
      if (this.state.status === 'calling') {
        this.updateState({ callId: data.callId });
      }
    });

    // Callee receives incoming call
    socket.on<any>('call:incoming', (data) => {
      console.log('[Call] call:incoming received from', data.callerName, '(', data.callerId, ')');
      this.handleIncomingCall(data);
    });

    // Caller receives acceptance
    socket.on<any>('call:accepted', (data) => {
      console.log('[Call] call:accepted received, data callId:', data?.callId, 'our callId:', this.state.callId, 'status:', this.state.status);
      // If we're in 'calling' state, this is almost certainly for our current call
      // even if callId doesn't match yet (call:initiated may not have arrived yet)
      if (this.state.status === 'calling') {
        // Accept it — update our callId if we didn't have one yet
        if (data?.callId && !this.state.callId) {
          console.log('[Call] Setting callId from call:accepted (call:initiated not yet received):', data.callId);
          this.updateState({ callId: data.callId });
        }
        this.handleCallAccepted(data);
        return;
      }
      // For any other state, use strict callId matching
      if (data?.callId && this.state.callId && data.callId !== this.state.callId) {
        console.log('[Call] Ignoring call:accepted — callId mismatch (ours:', this.state.callId, 'theirs:', data.callId, ')');
        return;
      }
      if (this.state.status === 'idle') {
        console.log('[Call] Ignoring call:accepted — already idle');
        return;
      }
      this.handleCallAccepted(data);
    });

    // Another device of the same user accepted this call — stop ringing on this device
    socket.on<any>('call:accepted-elsewhere', (data) => {
      console.log('[Call] call:accepted-elsewhere received, callId:', data?.callId, 'our callId:', this.state.callId, 'status:', this.state.status);
      if (this.state.status === 'ringing' && (!data?.callId || data.callId === this.state.callId)) {
        console.log('[Call] Call was accepted on another device — cleaning up');
        stopRingtone();
        this.cleanup();
      }
    });

    socket.on<any>('call:rejected', (data) => {
      console.log('[Call] call:rejected received, current status:', this.state.status, 'data callId:', data?.callId, 'our callId:', this.state.callId);
      // Only act on rejection if we're still in 'calling' state AND the callId matches
      if (this.state.status !== 'calling') {
        console.log('[Call] Ignoring call:rejected — not in calling state');
        return;
      }
      if (data?.callId && data.callId !== this.state.callId) {
        console.log('[Call] Ignoring call:rejected — callId mismatch (ours:', this.state.callId, 'theirs:', data.callId, ')');
        return;
      }
      stopRingtone();
      this.cleanup();
    });

    socket.on<any>('call:ended', (data) => {
      console.log('[Call] call:ended received from remote, data callId:', data?.callId, 'our callId:', this.state.callId, 'status:', this.state.status, 'enderId:', data?.enderId);
      if (this.state.status === 'idle') {
        console.log('[Call] Ignoring call:ended — already idle');
        return;
      }
      // System-initiated cleanup (enderId === 'system') always forces cleanup
      if (data?.enderId === 'system') {
        console.log('[Call] System-initiated call cleanup — forcing cleanup');
        this.cleanup();
        return;
      }
      // Ignore stale call:ended events from previous calls
      if (data?.callId && this.state.callId && data.callId !== this.state.callId) {
        console.log('[Call] Ignoring call:ended — callId mismatch (ours:', this.state.callId, 'theirs:', data.callId, ')');
        return;
      }
      this.cleanup();
    });

    socket.on<any>('call:expired', (data) => {
      console.log('[Call] call:expired received, data callId:', data?.callId, 'our callId:', this.state.callId);
      if (data?.callId && data.callId !== this.state.callId) {
        console.log('[Call] Ignoring call:expired — callId mismatch (ours:', this.state.callId, 'theirs:', data.callId, ')');
        return;
      }
      if (this.state.status === 'idle') return;
      stopRingtone();
      this.cleanup();
    });

    socket.on<any>('call:missed', (data) => {
      console.log('[Call] call:missed received, data callId:', data?.callId, 'our callId:', this.state.callId);
      if (data?.callId && data.callId !== this.state.callId) {
        console.log('[Call] Ignoring call:missed — callId mismatch (ours:', this.state.callId, 'theirs:', data.callId, ')');
        return;
      }
      if (this.state.status === 'idle') return;
      stopRingtone();
      this.cleanup();
    });

    // WebRTC SDP offer from caller (fallback path — usually offer comes with call:incoming)
    socket.on<any>('call:offer', async (data) => {
      console.log('[Call] Received separate offer from', data.senderId, 'peerConnection:', !!this.peerConnection);
      if (this.peerConnection && data.offer) {
        try {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
          console.log('[Call] Remote description set (offer), processing buffered candidates...');
          await this.processPendingCandidates();
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          console.log('[Call] Sending answer to', data.senderId);
          socket.getSocket()?.emit('call:answer', {
            targetUserId: data.senderId,
            answer: this.peerConnection.localDescription,
          });
        } catch (e) {
          console.error('[Call] Failed to handle offer:', e);
        }
      } else {
        console.log('[Call] No peer connection yet, storing pending offer');
        this.pendingOffer = data.offer;
      }
    });

    // WebRTC SDP answer from callee
    socket.on<any>('call:answer', async (data) => {
      console.log('[Call] Received answer from', data.senderId, 'peerConnection:', !!this.peerConnection, 'status:', this.state.status);
      if (this.peerConnection && data.answer) {
        try {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
          console.log('[Call] Remote description set (answer), processing buffered candidates...');
          await this.processPendingCandidates();

          // If we're still in 'calling' state (call:accepted was missed or came out of order),
          // transition to 'connected' now since we have the SDP answer — the call IS accepted
          if (this.state.status === 'calling') {
            console.log('[Call] Transitioning to connected from call:answer (call:accepted may have been missed)');
            stopRingtone();
            this.updateState({ status: 'connected', startTime: Date.now() });
          }
        } catch (e) {
          console.error('[Call] Failed to handle answer:', e);
        }
      }
    });

    // ICE candidates — BUFFER if peer connection or remote description not ready yet
    socket.on<any>('call:ice-candidate', async (data) => {
      if (!data.candidate) return;

      // Can only add ICE candidates after remote description is set
      if (this.peerConnection && this.peerConnection.remoteDescription) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error('[Call] Failed to add ICE candidate:', e);
        }
      } else {
        // Buffer — will be processed after setRemoteDescription
        console.log('[Call] Buffering ICE candidate (pc:', !!this.peerConnection, 'remoteDesc:', !!this.peerConnection?.remoteDescription, ')');
        this.pendingCandidates.push(data.candidate);
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

  // Process buffered ICE candidates after remote description is set
  private async processPendingCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;

    const candidates = [...this.pendingCandidates];
    this.pendingCandidates = [];

    if (candidates.length > 0) {
      console.log(`[Call] Processing ${candidates.length} buffered ICE candidates`);
    }
    for (const candidate of candidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('[Call] Failed to add buffered ICE candidate:', e);
      }
    }
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
    if (this.state.status === 'connected') {
      console.warn('[Call] Cannot initiate — already in active call');
      return;
    }
    // If stuck in a non-idle state from a previous call, force cleanup first
    if (this.state.status !== 'idle') {
      console.warn('[Call] Was in state:', this.state.status, '— force cleaning up before new call');
      this.cleanup();
    }

    try {
      this.isCaller = true;
      this._remoteUserId = targetUserId;
      this.pendingCandidates = [];

      this.updateState({
        status: 'calling',
        callType,
        conversationId,
        remoteUserId: targetUserId,
        remoteUserName: targetUserName,
        remoteUserAvatar: targetUserAvatar || null,
      });

      playRingtone('outgoing');

      // Fetch fresh TURN credentials before starting the call
      await this.fetchIceServers();

      // SAFETY: If cleanup happened during the await (e.g. stale socket event), bail out
      if (this.state.status !== 'calling') {
        console.warn('[Call] State changed to', this.state.status, 'during fetchIceServers — aborting initiateCall');
        return;
      }

      // Get local media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });

      // SAFETY: If cleanup happened during getUserMedia prompt, bail out
      if (this.state.status !== 'calling') {
        console.warn('[Call] State changed to', this.state.status, 'during getUserMedia — aborting initiateCall');
        this.localStream?.getTracks().forEach(t => t.stop());
        this.localStream = null;
        return;
      }

      console.log('[Call] Local media acquired:', this.localStream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(', '));

      // Create peer connection
      this.createPeerConnection();

      // Add local tracks
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // Create SDP offer IMMEDIATELY (don't wait for callee to accept)
      const offer = await this.peerConnection!.createOffer();
      await this.peerConnection!.setLocalDescription(offer);
      console.log('[Call] Offer created upfront, sending with call:initiate');

      // Tell the server to ring the callee — include the offer so it's relayed immediately
      socket.getSocket()?.emit('call:initiate', {
        conversationId,
        targetUserId,
        callType,
        offer: this.peerConnection!.localDescription,
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

      // Fetch fresh TURN credentials
      await this.fetchIceServers();

      // Get local media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      });
      console.log('[Call] Local media acquired:', this.localStream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(', '));

      // Create peer connection
      this.createPeerConnection();

      // Add local tracks
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // Tell the server we accepted FIRST (so DB gets updated)
      socket.getSocket()?.emit('call:accept', {
        callId,
        targetUserId: remoteUserId,
      });

      // If we have a pending offer (new flow: offer came with call:incoming), process it
      if (this.pendingOffer) {
        console.log('[Call] Processing pending SDP offer from caller');
        await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(this.pendingOffer));
        this.pendingOffer = null;

        // CRITICAL: Process buffered ICE candidates NOW that remote description is set
        await this.processPendingCandidates();

        const answer = await this.peerConnection!.createAnswer();
        await this.peerConnection!.setLocalDescription(answer);
        console.log('[Call] Sending SDP answer to', remoteUserId);
        socket.getSocket()?.emit('call:answer', {
          targetUserId: remoteUserId,
          answer: this.peerConnection!.localDescription,
        });
      } else {
        console.log('[Call] No pending offer yet, waiting for call:offer event');
      }

      this.updateState({ status: 'connected', startTime: Date.now() });
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
    console.log('[Call] endCall() called, status:', this.state.status);
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

  toggleSpeaker() {
    const newState = !this.state.isSpeakerOn;
    this.updateState({ isSpeakerOn: newState });
    // Speaker toggle is handled by the CallModal via audio element sinkId
  }

  private createPeerConnection() {
    console.log('[Call] Creating PeerConnection with ICE servers:', JSON.stringify(this.iceServers.map(s => typeof s === 'string' ? s : s.urls)));
    this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[Call] Sending ICE candidate:', event.candidate.type, event.candidate.protocol);
        socket.getSocket()?.emit('call:ice-candidate', {
          targetUserId: this._remoteUserId,
          candidate: event.candidate,
        });
      } else {
        console.log('[Call] ICE gathering complete');
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      console.log('[Call] ICE connection state:', state, '(call status:', this.state.status, ')');
      if (state === 'connected' || state === 'completed') {
        console.log('[Call] ICE connected! Audio/video should be flowing.');
        // If we're still in 'calling' state when ICE connects, the call definitely succeeded
        if (this.state.status === 'calling') {
          console.log('[Call] ICE connected while still in calling state — transitioning to connected');
          stopRingtone();
          this.updateState({ status: 'connected', startTime: Date.now() });
        }
      }
    };

    this.peerConnection.onicegatheringstatechange = () => {
      console.log('[Call] ICE gathering state:', this.peerConnection?.iceGatheringState);
    };

    this.peerConnection.ontrack = (event) => {
      console.log('[Call] Remote track received:', event.track.kind, event.track.readyState);
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        console.log('[Call] Remote stream set, tracks:', this.remoteStream.getTracks().map(t => `${t.kind}:${t.readyState}`).join(', '));
      } else {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }
        this.remoteStream.addTrack(event.track);
        console.log('[Call] Added track to manual remote stream:', event.track.kind);
      }
      // CRITICAL: must call updateState to create a NEW state object reference
      // so React's useState triggers a re-render and the stream attachment useEffect runs
      this.updateState({});
    };

    this.peerConnection.onnegotiationneeded = async () => {
      console.log('[Call] negotiationneeded fired (isCaller:', this.isCaller, ')');
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('[Call] Connection state:', state, '(call status:', this.state.status, ')');
      if (state === 'connected') {
        console.log('[Call] WebRTC connection established successfully!');
      }
      if (state === 'failed') {
        // ONLY auto-end if we were actually connected (media was flowing).
        // During 'calling' phase, connection can temporarily fail while ICE gathers
        // and the callee hasn't even accepted yet — don't kill the call prematurely.
        if (this.state.status === 'connected') {
          console.error('[Call] Connection FAILED during active call — ending');
          this.endCall();
        } else {
          console.warn('[Call] Connection state "failed" during', this.state.status, '— NOT auto-ending (callee may not have accepted yet)');
        }
      }
      // NOTE: Do NOT auto-end on 'disconnected' (temporary ICE reconnect)
      // or 'closed' (triggered by our own cleanup — would cause infinite loop).
    };
  }

  private handleIncomingCall(data: any) {
    // If already in a CONNECTED call, auto-reject as busy
    if (this.state.status === 'connected') {
      console.log('[Call] Already in active call — auto-rejecting as busy');
      socket.getSocket()?.emit('call:reject', {
        callId: data.callId,
        targetUserId: data.callerId,
        reason: 'busy',
      });
      return;
    }

    // If in any other non-idle state (e.g. stuck from a previous call), force cleanup first
    if (this.state.status !== 'idle') {
      console.log('[Call] Was in state', this.state.status, '— force cleaning up before accepting incoming call');
      this.cleanup();
    }

    playRingtone('incoming');
    this.isCaller = false;
    this._remoteUserId = data.callerId;
    this.pendingCandidates = []; // Clear stale candidates from previous calls

    // Store the offer if it came with the incoming call (new flow)
    if (data.offer) {
      console.log('[Call] Incoming call has SDP offer attached');
      this.pendingOffer = data.offer;
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

  private async handleCallAccepted(_data: any) {
    console.log('[Call] Call accepted by remote user, peerConnection:', !!this.peerConnection, 'status:', this.state.status);
    stopRingtone();

    // If peerConnection was destroyed (e.g. by a stale rejection), DON'T cleanup —
    // the call:answer event might still come and we need to stay visible
    if (!this.peerConnection) {
      console.warn('[Call] call:accepted received but peerConnection is null — waiting for WebRTC setup');
      // Don't cleanup here. Stay in current state. The call:answer handler will work
      // once peerConnection is available, or the 45s timeout will clean up naturally.
    }

    // Only transition to connected if we're still in a valid pre-connected state
    if (this.state.status === 'calling' || this.state.status === 'ringing') {
      this.updateState({ status: 'connected', startTime: Date.now() });
    } else {
      console.log('[Call] Ignoring call:accepted — already in state:', this.state.status);
    }
    // Offer was already sent with call:initiate — callee will respond with answer directly
  }

  private cleanup() {
    // Always allow cleanup to run — never block it.
    // Multiple calls to cleanup are safe since everything is null-checked.
    console.log('[Call] Cleaning up call state (status was:', this.state.status, ')');

    stopRingtone();
    this.isCaller = false;
    this._remoteUserId = '';
    this.pendingOffer = null;
    this.pendingCandidates = [];

    // Stop and release all local media tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => {
        try { t.stop(); } catch (e) { /* ignore */ }
      });
      this.localStream = null;
    }
    this.remoteStream = null;

    // Close peer connection — remove event handlers first to prevent re-entrant calls
    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.oniceconnectionstatechange = null;
      this.peerConnection.onicegatheringstatechange = null;
      this.peerConnection.onnegotiationneeded = null;
      try {
        this.peerConnection.close();
      } catch (e) {
        // Ignore close errors
      }
      this.peerConnection = null;
    }

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
