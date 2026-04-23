import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

type AppState = {
  nickname: string;
  lastRoomCode: string | null;
  hydrated: boolean;
  setNickname: (name: string) => Promise<void>;
  setLastRoomCode: (code: string | null) => Promise<void>;
  hydrate: () => Promise<void>;
};

const KEY_NICK = 'sw.nickname';
const KEY_LAST_ROOM = 'sw.lastRoom';

export const useApp = create<AppState>((set) => ({
  nickname: '',
  lastRoomCode: null,
  hydrated: false,

  hydrate: async () => {
    const [nick, room] = await Promise.all([
      AsyncStorage.getItem(KEY_NICK),
      AsyncStorage.getItem(KEY_LAST_ROOM),
    ]);
    set({ nickname: nick ?? '', lastRoomCode: room, hydrated: true });
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
}));
