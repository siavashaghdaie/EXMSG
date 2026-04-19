import { create } from 'zustand';
import { socket } from '../services/socket';

interface PresenceState {
  onlineUsers: Set<string>;
  lastSeen: Map<string, string>;

  setUserOnline: (userId: string) => void;
  setUserOffline: (userId: string, lastSeenAt?: string) => void;
  setOnlineList: (userIds: string[]) => void;
  isUserOnline: (userId: string) => boolean;
  getLastSeen: (userId: string) => string | undefined;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineUsers: new Set(),
  lastSeen: new Map(),

  setUserOnline: (userId: string) => {
    set((state) => {
      const onlineUsers = new Set(state.onlineUsers);
      onlineUsers.add(userId);
      return { onlineUsers };
    });
  },

  setUserOffline: (userId: string, lastSeenAt?: string) => {
    set((state) => {
      const onlineUsers = new Set(state.onlineUsers);
      onlineUsers.delete(userId);
      const lastSeen = new Map(state.lastSeen);
      if (lastSeenAt) {
        lastSeen.set(userId, lastSeenAt);
      } else {
        lastSeen.set(userId, new Date().toISOString());
      }
      return { onlineUsers, lastSeen };
    });
  },

  setOnlineList: (userIds: string[]) => {
    set(() => ({
      onlineUsers: new Set(userIds),
    }));
  },

  isUserOnline: (userId: string) => {
    return get().onlineUsers.has(userId);
  },

  getLastSeen: (userId: string) => {
    return get().lastSeen.get(userId);
  },
}));

// Setup socket listeners for presence
export function setupPresenceSocketListeners() {
  const unsubscribe: (() => void)[] = [];

  unsubscribe.push(
    socket.on<{ userId: string }>('user:online', (data) => {
      usePresenceStore.getState().setUserOnline(data.userId);
    })
  );

  unsubscribe.push(
    socket.on<{ userId: string }>('user:offline', (data) => {
      usePresenceStore.getState().setUserOffline(data.userId);
    })
  );

  unsubscribe.push(
    socket.on<{ userId: string; status: string; lastSeen?: string }>('user:status', (data) => {
      if (data.status === 'online') {
        usePresenceStore.getState().setUserOnline(data.userId);
      } else {
        usePresenceStore.getState().setUserOffline(data.userId, data.lastSeen);
      }
    })
  );

  // Receive the full list of currently online users on connect
  unsubscribe.push(
    socket.on<{ userIds: string[] }>('users:online-list', (data) => {
      usePresenceStore.getState().setOnlineList(data.userIds);
    })
  );

  return () => {
    unsubscribe.forEach(fn => fn());
  };
}
