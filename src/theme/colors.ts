export const theme = {
  // Deep mossy emerald — matches a printed card-table feel.
  felt: '#1b3d2a',
  feltDark: '#0e2317',
  feltLight: '#2a5a42',
  ink: '#ffffff',
  inkDim: 'rgba(255,255,255,0.72)',
  inkFaint: 'rgba(255,255,255,0.45)',
  accent: '#f5c34b',
  accentDark: '#b5891f',
  danger: '#e05252',
  cardFace: '#f4f0e0',
  suit: {
    // Saturated but not neon; closer to a printed Phase 10 deck.
    red: { base: '#c62828', grad: ['#e84646', '#a01c1c'] },
    blue: { base: '#1f5db3', grad: ['#3b7cd1', '#13408a'] },
    green: { base: '#2e8a3e', grad: ['#41a653', '#1f6e2d'] },
    yellow: { base: '#d4a830', grad: ['#e6bd48', '#a98220'] },
  },
} as const;

export type SuitColor = keyof typeof theme.suit;
