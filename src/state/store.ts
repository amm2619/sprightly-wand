import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged } from 'firebase/auth';
import { create } from 'zustand';
import { auth } from '../net/firebase';

type AppState = {
  nickname: string;
  lastRoomCode: string | null;
  compactMode: boolean;
  takeBackEnabled: boolean;
  hydrated: boolean;
  setNickname: (name: string) => Promise<void>;
  setLastRoomCode: (code: string | null) => Promise<void>;
  setCompactMode: (enabled: boolean) => Promise<void>;
  setTakeBackEnabled: (enabled: boolean) => Promise<void>;
  hydrate: () => Promise<void>;
};

const KEY_NICK = 'sw.nickname';
const KEY_LAST_ROOM = 'sw.lastRoom';
const KEY_COMPACT = 'sw.compactMode';
const takeBackKey = (uid?: string | null) => uid ? `sw.takeBack.${uid}` : 'sw.takeBack';

export const useApp = create<AppState>((set) => ({
  nickname: '',
  lastRoomCode: null,
  compactMode: false,
  takeBackEnabled: false,
  hydrated: false,

  hydrate: async () => {
    const [nick, room, compact] = await Promise.all([
      AsyncStorage.getItem(KEY_NICK),
      AsyncStorage.getItem(KEY_LAST_ROOM),
      AsyncStorage.getItem(KEY_COMPACT),
    ]);
    set({ nickname: nick ?? '', lastRoomCode: room, compactMode: compact === '1', hydrated: true });

    // Load take-back once the UID is known so the setting is per-user.
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      const tb = await AsyncStorage.getItem(takeBackKey(user?.uid));
      set({ takeBackEnabled: tb === '1' });
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

  setTakeBackEnabled: async (enabled) => {
    await AsyncStorage.setItem(takeBackKey(auth.currentUser?.uid), enabled ? '1' : '0');
    set({ takeBackEnabled: enabled });
  },
}));
