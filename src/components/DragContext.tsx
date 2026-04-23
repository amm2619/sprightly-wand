import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import type { Card } from '../games/phase10/types';

export type DropTarget =
  | { kind: 'slot'; slotIndex: number }
  | { kind: 'hit'; ownerUid: string; groupIndex: number }
  | { kind: 'discard' };

export type DropZone = {
  id: string;
  target: DropTarget;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Handler = (card: Card, target: DropTarget) => void;

type DragContextValue = {
  register: (zone: DropZone) => void;
  unregister: (id: string) => void;
  zoneAt: (x: number, y: number) => DropZone | null;
  onDrop: Handler;
  setHandler: (h: Handler) => void;
};

const Ctx = createContext<DragContextValue | null>(null);

export function DragProvider({ children }: { children: ReactNode }) {
  const zonesRef = useRef<Map<string, DropZone>>(new Map());
  const handlerRef = useRef<Handler>(() => {});

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

  const value = useMemo(
    () => ({ register, unregister, zoneAt, onDrop, setHandler }),
    [register, unregister, zoneAt, onDrop, setHandler],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDragCtx(): DragContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDragCtx must be used inside <DragProvider>');
  return v;
}
