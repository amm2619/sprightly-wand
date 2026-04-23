import { useEffect, useRef, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { useDragCtx, type DropTarget } from './DragContext';

type Props = {
  id: string;
  target: DropTarget;
  children?: ReactNode;
  style?: ViewStyle;
  enabled?: boolean;
};

export function DropZoneView({ id, target, children, style, enabled = true }: Props) {
  const { register, unregister } = useDragCtx();
  const ref = useRef<View>(null);
  // Keep latest target/enabled in a ref so onLayout closes over current values
  // without needing to rebind layout listeners.
  const latest = useRef({ target, enabled });
  latest.current = { target, enabled };

  useEffect(() => () => unregister(id), [id, unregister]);

  useEffect(() => {
    if (!enabled) {
      unregister(id);
      return;
    }
    ref.current?.measureInWindow((x, y, w, h) => {
      register({ id, target, x, y, w, h });
    });
  }, [enabled, id, register, unregister, target.kind, (target as { slotIndex?: number }).slotIndex, (target as { ownerUid?: string }).ownerUid, (target as { groupIndex?: number }).groupIndex]);

  const onLayout = (_: LayoutChangeEvent) => {
    if (!latest.current.enabled) return;
    ref.current?.measureInWindow((x, y, w, h) => {
      register({ id, target: latest.current.target, x, y, w, h });
    });
  };

  return (
    <View ref={ref} onLayout={onLayout} style={style} collapsable={false}>
      {children}
    </View>
  );
}
