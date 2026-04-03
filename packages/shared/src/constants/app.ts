export const APP_NAME = 'Exclusive Messenger';
export const APP_VERSION = '0.1.0';

export const MESSAGE_MAX_LENGTH = 10000;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const PASSWORD_MIN_LENGTH = 8;
export const DISPLAY_NAME_MAX_LENGTH = 50;
export const BIO_MAX_LENGTH = 200;
export const GROUP_NAME_MAX_LENGTH = 100;
export const GROUP_MAX_MEMBERS = 200000;
export const CHANNEL_MAX_MEMBERS = 500000;

export const FILE_MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB (Telegram parity)
export const IMAGE_MAX_SIZE = 20 * 1024 * 1024; // 20MB
export const VOICE_MAX_DURATION = 60 * 60; // 1 hour in seconds

export const MESSAGES_PER_PAGE = 50;
export const CONVERSATIONS_PER_PAGE = 20;

export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const SUPPORTED_AUDIO_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'];
