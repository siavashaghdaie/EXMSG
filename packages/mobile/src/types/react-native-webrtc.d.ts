declare module 'react-native-webrtc' {
  import { Component } from 'react';
  import { ViewStyle } from 'react-native';

  export class RTCPeerConnection {
    constructor(config?: { iceServers?: RTCIceServer[] });
    addTrack(track: any, stream: MediaStream): void;
    createOffer(options?: any): Promise<RTCSessionDescriptionInit>;
    createAnswer(): Promise<RTCSessionDescriptionInit>;
    setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void>;
    setRemoteDescription(desc: RTCSessionDescription): Promise<void>;
    addIceCandidate(candidate: RTCIceCandidate): Promise<void>;
    close(): void;
    addEventListener(event: string, handler: (...args: any[]) => void): void;
    removeEventListener(event: string, handler: (...args: any[]) => void): void;
    localDescription: RTCSessionDescriptionInit | null;
    connectionState: string;
  }

  export class RTCSessionDescription {
    constructor(desc: any);
    type: string;
    sdp: string;
  }

  export class RTCIceCandidate {
    constructor(candidate: any);
  }

  export interface RTCIceServer {
    urls: string | string[];
    username?: string;
    credential?: string;
  }

  export interface RTCSessionDescriptionInit {
    type: string;
    sdp: string;
  }

  export class MediaStream {
    getTracks(): any[];
    getAudioTracks(): any[];
    getVideoTracks(): any[];
    toURL(): string;
  }

  export const mediaDevices: {
    getUserMedia(constraints: {
      audio?: boolean | object;
      video?: boolean | object;
    }): Promise<MediaStream>;
    enumerateDevices(): Promise<any[]>;
  };

  interface RTCViewProps {
    streamURL: string;
    style?: ViewStyle;
    objectFit?: 'contain' | 'cover';
    mirror?: boolean;
    zOrder?: number;
  }

  export class RTCView extends Component<RTCViewProps> {}
}
