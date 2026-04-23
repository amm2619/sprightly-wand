import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { Card as Phase10Card } from '../games/phase10/types';
import type { StdCard } from '../games/standard/types';

export type AnyDragCard = Phase10Card | StdCard;

export type DropTarget =
  // Phase 10 targets
  | { kind: 'slot'; slotIndex: number }
  | { kind: 'hit'; ownerUid: string; groupIndex: number }
  // 3-to-13 targets
  | { kind: 'staged'; stagedIndex: number }
  | { kind: 'extend'; groupIndex: number }
  // Trash targets
  | { kind: 'trashSlot'; slotIndex: number }
  // Shared
  | { kind: 'discard' };

export type DropZone = {
  id: string;
  target: DropTarget;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Handler = (card: AnyDragCard, target: DropTarget) => void;
type PulseCb = (kind: 'success' | 'fail') => void;

type DragContextValue = {
  register: (zone: DropZone) => void;
  unregister: (id: string) => void;
  zoneAt: (x: number, y: number) => DropZone | null;
  onDrop: Handler;
  setHandler: (h: Handler) => void;

  // Active drag card lives in a ref — worklets can set it without triggering
  // a re-render cascade that would tear down in-flight gesture handlers.
  // Drop zones read it from the ref at render time when they detect hover.
  activeCardRef: MutableRefObject<AnyDragCard | null>;
  setActiveCard: (c: AnyDragCard | null) => void;
  dragX: SharedValue<number>;
  dragY: SharedValue<number>;

  // Pulse events: zones subscribe, dragger fires outcome.
  registerPulse: (id: string, cb: PulseCb) => void;
  unregisterPulse: (id: string) => void;
  firePulse: (id: string, kind: 'success' | 'fail') => void;
};

const Ctx = createContext<DragContextValue | null>(null);

export function DragProvider({ children }: { children: ReactNode }) {
  const zonesRef = useRef<Map<string, DropZone>>(new Map());
  const handlerRef = useRef<Handler>(() => {});
  const pulseMapRef = useRef<Map<string, PulseCb>>(new Map());
  const activeCardRef = useRef<AnyDragCard | null>(null);

  const dragX = useSharedValue(-1);
  const dragY = useSharedValue(-1);

  const register = useCallback((zone: DropZone) => {
    zonesRef.current.set(zone.id, zone);
  }, []);
  const unregister = useCallback((id: string) => {
    zonesRef.current.delete(id);
  }, []);
  const zoneAt = useCallback((x: number, y: number) => {
    for (const z of zonesRef.current.values()) {
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z;
    }
    return null;
  }, []);
  const onDrop = useCallback<Handler>((card, target) => {
    handlerRef.current(card, target);
  }, []);
  const setHandler = useCallback((h: Handler) => {
    handlerRef.current = h;
  }, []);

  const setActiveCard = useCallback((c: AnyDragCard | null) => {
    activeCardRef.current = c;
    if (c === null) {
      dragX.value = -1;
      dragY.value = -1;
    }
  }, [dragX, dragY]);

  const registerPulse = useCallback((id: string, cb: PulseCb) => {
    pulseMapRef.current.set(id, cb);
  }, []);
  const unregisterPulse = useCallback((id: string) => {
    pulseMapRef.current.delete(id);
  }, []);
  const firePulse = useCallback((id: string, kind: 'success' | 'fail') => {
    pulseMapRef.current.get(id)?.(kind);
  }, []);

  const value = useMemo<DragContextValue>(
    () => ({
      register, unregister, zoneAt, onDrop, setHandler,
      activeCardRef, setActiveCard,
      dragX, dragY,
      registerPulse, unregisterPulse, firePulse,
    }),
    [register, unregister, zoneAt, onDrop, setHandler, setActiveCard, dragX, dragY, registerPulse, unregisterPulse, firePulse],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDragCtx(): DragContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDragCtx must be used inside <DragProvider>');
  return v;
}
