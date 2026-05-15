import { useWindowDimensions } from 'react-native';
import { useApp } from '../state/store';

/**
 * A single scale factor the app uses to shrink its chrome on smaller phones.
 * Reference device ≈ 390×800. Smaller screens scale down proportionally.
 * Clamped at 0.72 so things don't get unreadable; capped at 1.0 so larger
 * phones never "blow up" the layout.
 *
 * In compact mode the floor drops to 0.5 so chrome (padding, gaps, banners)
 * keeps tightening when the window is short — e.g. the game running in the
 * top half of a split screen.
 */
export function useLayoutScale(): number {
  const { width, height } = useWindowDimensions();
  const compact = useApp((s) => s.compactMode);
  const w = Math.min(width / 390, 1);
  const h = Math.min(height / 800, 1);
  return Math.max(compact ? 0.5 : 0.72, Math.min(w, h));
}

/**
 * Scale factor for cards and phase slots. Normally tracks the layout scale,
 * but in compact mode it sizes off window *width* only. Splitting the screen
 * vertically shrinks height, not width — so cards stay readable while the
 * surrounding chrome tightens via `useLayoutScale`.
 */
export function useCardScale(): number {
  const { width, height } = useWindowDimensions();
  const compact = useApp((s) => s.compactMode);
  const w = Math.min(width / 390, 1);
  if (compact) return Math.max(0.85, w);
  const h = Math.min(height / 800, 1);
  return Math.max(0.72, Math.min(w, h));
}

/**
 * Properties whose numeric values should scale with the layout. Font size is
 * intentionally excluded — we scale containers and spacing, but leave text
 * readable at its original sizes.
 */
const SCALABLE_PROPS = new Set([
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'paddingVertical', 'paddingHorizontal',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginVertical', 'marginHorizontal',
  'gap', 'rowGap', 'columnGap',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'borderRadius', 'borderWidth',
  'top', 'bottom', 'left', 'right',
]);

/** Multiply every scalable numeric property in a styles object by `scale`. */
export function scaleStyles<T extends Record<string, Record<string, unknown>>>(
  styles: T,
  scale: number,
): T {
  if (scale >= 0.99) return styles;
  const out: Record<string, Record<string, unknown>> = {};
  for (const key of Object.keys(styles)) {
    const style = styles[key];
    const next: Record<string, unknown> = {};
    for (const prop of Object.keys(style)) {
      const val = style[prop];
      if (SCALABLE_PROPS.has(prop) && typeof val === 'number') {
        next[prop] = val * scale;
      } else {
        next[prop] = val;
      }
    }
    out[key] = next;
  }
  return out as T;
}
