import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Vibration,
  Platform,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { callService, CallStatus, CallType } from '@/services/callService';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const COLORS = {
  bg: '#0F172A',
  bgGradientMid: '#1E293B',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.6)',
  textFaint: 'rgba(255,255,255,0.35)',
  green: '#22C55E',
  red: '#EF4444',
  controlBg: 'rgba(255,255,255,0.12)',
  controlActive: '#EF4444',
  primary: '#7C3AED',
  blue: '#3B82F6',
};

interface CallScreenState {
  status: CallStatus;
  callType: CallType;
  remoteUserName: string;
  remoteUserAvatar: string | null;
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;
  startTime: number | null;
}

export default function CallScreen() {
  const [callState, setCallState] = useState<CallScreenState>(callService.getState());
  const [elapsed, setElapsed] = useState(0);
  const vibrationRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return callService.subscribe((state) => {
      setCallState(state);
    });
  }, []);

  // Vibrate on ringing
  useEffect(() => {
    if (callState.status === 'ringing') {
      // Vibrate pattern: vibrate 500ms, pause 1000ms
      const doVibrate = () => {
        Vibration.vibrate(Platform.OS === 'ios' ? 500 : [0, 500, 1000, 500]);
      };
      doVibrate();
      vibrationRef.current = setInterval(doVibrate, 3000);
    } else {
      if (vibrationRef.current) {
        clearInterval(vibrationRef.current);
        vibrationRef.current = null;
      }
      Vibration.cancel();
    }
    return () => {
      if (vibrationRef.current) {
        clearInterval(vibrationRef.current);
        vibrationRef.current = null;
      }
      Vibration.cancel();
    };
  }, [callState.status]);

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

  const localStream = callService.getLocalStream();
  const remoteStream = callService.getRemoteStream();

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* Full-screen remote video */}
      {isVideo && isConnected && remoteStream && (
        <RTCView
          streamURL={(remoteStream as any).toURL()}
          style={styles.fullVideo}
          objectFit="cover"
          mirror={false}
        />
      )}

      {/* Local video PiP */}
      {isVideo && isConnected && localStream && !callState.isVideoOff && (
        <View style={styles.pipContainer}>
          <RTCView
            streamURL={(localStream as any).toURL()}
            style={styles.pipVideo}
            objectFit="cover"
            mirror={true}
          />
        </View>
      )}

      {/* Call info overlay */}
      <View style={[
        styles.overlay,
        isVideo && isConnected ? styles.overlayVideoConnected : null,
      ]}>
        {/* Avatar area — show when NOT in active video */}
        {!(isVideo && isConnected) && (
          <View style={styles.avatarSection}>
            {/* Animated ring indicators */}
            {isRinging && (
              <>
                <View style={[styles.ringIndicator, styles.ring1]} />
                <View style={[styles.ringIndicator, styles.ring2]} />
              </>
            )}
            {isCalling && (
              <View style={[styles.ringIndicator, styles.ringCalling]} />
            )}
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {getInitials(callState.remoteUserName)}
              </Text>
            </View>
          </View>
        )}

        {/* Name & status */}
        <Text style={styles.userName}>{callState.remoteUserName}</Text>
        <Text style={styles.callStatus}>
          {isRinging && (isVideo ? 'Incoming Video Call...' : 'Incoming Voice Call...')}
          {isCalling && 'Calling...'}
          {isConnected && formatTime(elapsed)}
        </Text>
        {!isConnected && (
          <Text style={styles.callTypeLabel}>
            {isVideo ? 'Video Call' : 'Voice Call'}
          </Text>
        )}
      </View>

      {/* Controls */}
      <View style={styles.controlsBar}>
        {isRinging ? (
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={[styles.controlBtn, styles.rejectBtn]}
              onPress={() => callService.rejectCall()}
              activeOpacity={0.7}
            >
              <Text style={styles.controlIcon}>✕</Text>
              <Text style={styles.controlLabel}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlBtn, styles.acceptBtn]}
              onPress={() => callService.acceptCall()}
              activeOpacity={0.7}
            >
              <Text style={styles.controlIcon}>✓</Text>
              <Text style={styles.controlLabel}>Accept</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.controlsRow}>
            {/* Mute */}
            <TouchableOpacity
              style={[styles.controlBtn, styles.smallBtn, callState.isMuted && styles.activeBtn]}
              onPress={() => callService.toggleMute()}
              activeOpacity={0.7}
            >
              <Text style={styles.controlIconSmall}>
                {callState.isMuted ? '🔇' : '🎤'}
              </Text>
              <Text style={styles.controlLabelSmall}>
                {callState.isMuted ? 'Unmute' : 'Mute'}
              </Text>
            </TouchableOpacity>

            {/* Speaker */}
            <TouchableOpacity
              style={[styles.controlBtn, styles.smallBtn, callState.isSpeakerOn && styles.activeBtn]}
              onPress={() => callService.toggleSpeaker()}
              activeOpacity={0.7}
            >
              <Text style={styles.controlIconSmall}>
                {callState.isSpeakerOn ? '🔊' : '🔈'}
              </Text>
              <Text style={styles.controlLabelSmall}>Speaker</Text>
            </TouchableOpacity>

            {/* Camera toggle (video calls only) */}
            {isVideo && (
              <TouchableOpacity
                style={[styles.controlBtn, styles.smallBtn, callState.isVideoOff && styles.activeBtn]}
                onPress={() => callService.toggleVideo()}
                activeOpacity={0.7}
              >
                <Text style={styles.controlIconSmall}>
                  {callState.isVideoOff ? '📷' : '📹'}
                </Text>
                <Text style={styles.controlLabelSmall}>
                  {callState.isVideoOff ? 'Camera On' : 'Camera Off'}
                </Text>
              </TouchableOpacity>
            )}

            {/* Flip camera (video calls only) */}
            {isVideo && (
              <TouchableOpacity
                style={[styles.controlBtn, styles.smallBtn]}
                onPress={() => callService.switchCamera()}
                activeOpacity={0.7}
              >
                <Text style={styles.controlIconSmall}>🔄</Text>
                <Text style={styles.controlLabelSmall}>Flip</Text>
              </TouchableOpacity>
            )}

            {/* End call */}
            <TouchableOpacity
              style={[styles.controlBtn, styles.endBtn]}
              onPress={() => callService.endCall()}
              activeOpacity={0.7}
            >
              <Text style={styles.controlIcon}>✕</Text>
              <Text style={styles.controlLabelSmall}>End</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
    zIndex: 9999,
  },
  fullVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  pipContainer: {
    position: 'absolute',
    top: 60,
    right: 16,
    width: 100,
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 10,
    elevation: 10,
  },
  pipVideo: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  overlayVideoConnected: {
    justifyContent: 'flex-end',
    paddingBottom: 180,
  },
  avatarSection: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  ringIndicator: {
    position: 'absolute',
    borderRadius: 100,
    borderWidth: 2,
  },
  ring1: {
    width: 140,
    height: 140,
    borderColor: 'rgba(34,197,94,0.4)',
  },
  ring2: {
    width: 170,
    height: 170,
    borderColor: 'rgba(34,197,94,0.2)',
  },
  ringCalling: {
    width: 140,
    height: 140,
    borderColor: 'rgba(59,130,246,0.4)',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '700',
    color: COLORS.text,
  },
  userName: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  callStatus: {
    fontSize: 17,
    color: COLORS.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  callTypeLabel: {
    fontSize: 14,
    color: COLORS.textFaint,
    marginTop: 4,
    textAlign: 'center',
  },
  controlsBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 50 : 30,
    paddingTop: 20,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtn: {
    width: 60,
    height: 75,
    borderRadius: 30,
    backgroundColor: COLORS.controlBg,
    paddingTop: 10,
  },
  activeBtn: {
    backgroundColor: COLORS.controlActive,
  },
  rejectBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.red,
    shadowColor: COLORS.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  acceptBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.green,
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  endBtn: {
    width: 60,
    height: 75,
    borderRadius: 30,
    backgroundColor: COLORS.red,
    paddingTop: 10,
    shadowColor: COLORS.red,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  controlIcon: {
    fontSize: 28,
    color: COLORS.text,
    fontWeight: '700',
  },
  controlIconSmall: {
    fontSize: 22,
  },
  controlLabel: {
    fontSize: 13,
    color: COLORS.text,
    marginTop: 6,
    fontWeight: '500',
  },
  controlLabelSmall: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
});
