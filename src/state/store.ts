import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

type AppState = {
  nickname: string;
  lastRoomCode: string | null;
  compactMode: boolean;
  hydrated: boolean;
  setNickname: (name: string) => Promise<void>;
  setLastRoomCode: (code: string | null) => Promise<void>;
  setCompactMode: (enabled: boolean) => Promise<void>;
  hydrate: () => Promise<void>;
};

const KEY_NICK = 'sw.nickname';
const KEY_LAST_ROOM = 'sw.lastRoom';
const KEY_COMPACT = 'sw.compactMode';

export const useApp = create<AppState>((set) => ({
  nickname: '',
  lastRoomCode: null,
  compactMode: false,
  hydrated: false,

  hydrate: async () => {
    const [nick, room, compact] = await Promise.all([
      AsyncStorage.getItem(KEY_NICK),
      AsyncStorage.getItem(KEY_LAST_ROOM),
      AsyncStorage.getItem(KEY_COMPACT),
    ]);
    set({
      nickname: nick ?? '',
      lastRoomCode: room,
      compactMode: compact === '1',
      hydrated: true,
    });
  },

  setNickname: async (name) => {
    const trimmed = name.trim();
    await AsyncStorage.setItem(KEY_NICK, trimmed);
    set({ nickname: trimmed });
  },

  setLastRoomCode: async (code) => {
    if (code) await AsyncStorage.setItem(KEY_LAST_ROOM, code);
    else await AsyncStorage.removeItem(KEY_LAST_ROOM);
    set({ lastRoomCode: code });
  },

  setCompactMode: async (enabled) => {
    await AsyncStorage.setItem(KEY_COMPACT, enabled ? '1' : '0');
    set({ compactMode: enabled });
  },
}));
