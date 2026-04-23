import { useWindowDimensions } from 'react-native';

/**
 * A single scale factor the app uses to shrink its chrome on smaller phones.
 * Reference device ≈ 390×800. Smaller screens scale down proportionally.
 * Clamped at 0.72 so things don't get unreadable; capped at 1.0 so larger
 * phones never "blow up" the layout.
 */
export function useLayoutScale(): number {
  const { width, height } = useWindowDimensions();
  const w = Math.min(width / 390, 1);
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
