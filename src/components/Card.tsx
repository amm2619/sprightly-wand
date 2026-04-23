import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card as Phase10CardT, SuitColor } from '../games/phase10/types';
import { StdCard, rankLabel, suitColor, suitGlyph } from '../games/standard/types';
import { theme } from '../theme/colors';
import { useLayoutScale } from '../theme/responsive';

export const CARD_W = 68;
export const CARD_H = 98;

export type AnyCard = Phase10CardT | StdCard;

type Props = {
  card?: AnyCard;
  selected?: boolean;
  dimmed?: boolean;
  small?: boolean;
  onPress?: () => void;
};

/** Bright → deep gradient pair per suit for the card backdrop. */
/** Variant A palette: solid saturated base + darker rim + highlight. */
const SUIT_PALETTE: Record<SuitColor, { base: string; deep: string; highlight: string }> = {
  red:    { base: '#e11d48', deep: '#9f1239', highlight: '#ffb4bf' },
  blue:   { base: '#2563eb', deep: '#1e40af', highlight: '#bfdbfe' },
  green:  { base: '#16a34a', deep: '#15803d', highlight: '#bbf7d0' },
  yellow: { base: '#e8b923', deep: '#9a7a14', highlight: '#fce58c' },
};
/** Legacy gradient lookup (still used by wild-card stripes). */
const SUIT_GRAD: Record<SuitColor, [string, string]> = {
  red:    [SUIT_PALETTE.red.base,    SUIT_PALETTE.red.deep],
  blue:   [SUIT_PALETTE.blue.base,   SUIT_PALETTE.blue.deep],
  green:  [SUIT_PALETTE.green.base,  SUIT_PALETTE.green.deep],
  yellow: [SUIT_PALETTE.yellow.base, SUIT_PALETTE.yellow.deep],
};

export function GameCard({ card, selected, dimmed, small, onPress }: Props) {
  const scale = useLayoutScale();
  const sizeMult = small ? 0.72 : 1;
  const w = CARD_W * sizeMult * scale;
  const h = CARD_H * sizeMult * scale;

  const content = (
    <View
      style={[
        styles.shell,
        { width: w, height: h },
        selected && styles.selectedShell,
        dimmed && { opacity: 0.35 },
      ]}
    >
      <View style={[styles.card, selected && styles.cardSelectedInner]}>
        {renderFace(card, w, h)}
        <View pointerEvents="none" style={styles.gloss} />
      </View>
    </View>
  );

  return onPress ? (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.88 : 1 })}
    >
      {content}
    </Pressable>
  ) : content;
}

function renderFace(card: AnyCard | undefined, w: number, h: number) {
  if (!card) {
    return (
      <LinearGradient
        colors={['#1a4d3a', '#0b2e22']}
        style={styles.face}
      >
        <View style={styles.backBorder}>
          <View style={styles.backDiamond} />
          <Text style={[styles.backMark, { fontSize: w * 0.28 }]}>✦</Text>
        </View>
      </LinearGradient>
    );
  }

  // Standard-deck card (Trash, 3-to-13)
  if ('suit' in card) {
    return renderStandardFace(card, w, h);
  }

  if (card.kind === 'num') {
    const { base, deep, highlight } = SUIT_PALETTE[card.color];
    const twoDigit = card.value >= 10;
    const centerFontSize = w * (twoDigit ? 0.68 : 0.86);
    const cornerFontSize = w * (twoDigit ? 0.18 : 0.22);
    return (
      <View style={[styles.face, { backgroundColor: base }]}>
        {/* Inner deep-color rim for a printed-card feel */}
        <View style={[styles.innerRim, { borderColor: deep }]} pointerEvents="none" />
        {/* Top-half sheen */}
        <View
          pointerEvents="none"
          style={[
            styles.topSheen,
            { backgroundColor: highlight, opacity: 0.18, height: h * 0.4 },
          ]}
        />
        {/* Top-left corner number */}
        <View style={[styles.cornerWrap, styles.cornerTL]}>
          <Text style={[styles.varAcornerNum, { fontSize: cornerFontSize }]}>
            {card.value}
          </Text>
        </View>
        {/* Big center number — auto-shrinks for 11/12 so nothing clips */}
        <Text
          style={[
            styles.varAcenterNum,
            { fontSize: centerFontSize, textShadowRadius: Math.max(w * 0.03, 1.5) },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {card.value}
        </Text>
        {/* Bottom-right corner (rotated 180°) */}
        <View style={[styles.cornerWrap, styles.cornerBR]}>
          <Text style={[styles.varAcornerNum, { fontSize: cornerFontSize }]}>
            {card.value}
          </Text>
        </View>
      </View>
    );
  }

  if (card.kind === 'wild') {
    const dv = (card as { declaredValue?: number }).declaredValue;
    return (
      <LinearGradient colors={['#1c1c1c', '#000']} style={styles.face}>
        <View style={styles.wildBars}>
          <View style={[styles.wildBar, { backgroundColor: SUIT_GRAD.red[0] }]} />
          <View style={[styles.wildBar, { backgroundColor: SUIT_GRAD.yellow[0] }]} />
          <View style={[styles.wildBar, { backgroundColor: SUIT_GRAD.green[0] }]} />
          <View style={[styles.wildBar, { backgroundColor: SUIT_GRAD.blue[0] }]} />
        </View>
        {dv !== undefined ? (
          <>
            <View style={[styles.cornerWrap, styles.cornerTL]}>
              <Text style={[styles.cornerNum, { fontSize: w * 0.22 }]}>{dv}</Text>
              <Text style={{ color: '#ffd84d', fontSize: w * 0.15, fontWeight: '900', marginTop: 1 }}>★</Text>
            </View>
            <Text style={[styles.centerNum, { fontSize: w * 0.56, textShadowRadius: Math.max(w * 0.04, 2) }]}>
              {dv}
            </Text>
            <View style={[styles.cornerWrap, styles.cornerBR]}>
              <Text style={[styles.cornerNum, { fontSize: w * 0.22 }]}>{dv}</Text>
              <Text style={{ color: '#ffd84d', fontSize: w * 0.15, fontWeight: '900', marginTop: 1 }}>★</Text>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.wildStar, { fontSize: w * 0.6 }]}>★</Text>
            <Text style={[styles.wildLabel, { fontSize: w * 0.15 }]}>WILD</Text>
          </>
        )}
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#ffffff', '#d9d9d9']} style={styles.face}>
      <Text style={[styles.skipGlyph, { fontSize: w * 0.6 }]}>⊘</Text>
      <Text style={[styles.skipLabel, { fontSize: w * 0.15 }]}>SKIP</Text>
    </LinearGradient>
  );
}

function renderStandardFace(card: StdCard, w: number, _h: number) {
  const color = suitColor(card.suit) === 'red' ? '#c8102e' : '#1c1c1c';
  const glyph = suitGlyph(card.suit);
  const label = rankLabel(card.rank);
  const isFaceCard = card.rank >= 11;
  return (
    <LinearGradient colors={['#fafafa', '#e2e2e2']} style={styles.face}>
      <View style={[styles.stdCornerWrap, styles.stdCornerTL]}>
        <Text style={[styles.stdCornerRank, { color, fontSize: w * 0.22 }]}>{label}</Text>
        <Text style={[styles.stdCornerSuit, { color, fontSize: w * 0.18 }]}>{glyph}</Text>
      </View>
      {isFaceCard ? (
        <Text
          style={[
            styles.stdFaceLetter,
            { color, fontSize: w * 0.62 },
          ]}
        >
          {label}
        </Text>
      ) : (
        <Text style={[styles.stdCenterGlyph, { color, fontSize: w * 0.62 }]}>{glyph}</Text>
      )}
      <View style={[styles.stdCornerWrap, styles.stdCornerBR]}>
        <Text style={[styles.stdCornerRank, { color, fontSize: w * 0.22 }]}>{label}</Text>
        <Text style={[styles.stdCornerSuit, { color, fontSize: w * 0.18 }]}>{glyph}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 12,
    padding: 1,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedShell: {
    padding: 5,
    backgroundColor: theme.accent,
    shadowColor: theme.accent,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  card: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 11,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  cardSelectedInner: {
    borderRadius: 8,
  },
  face: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  gloss: {
    position: 'absolute',
    top: 1, left: 1, right: 1,
    height: '40%',
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },

  cornerWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  cornerTL: { top: 4, left: 5 },
  cornerBR: { bottom: 4, right: 5, transform: [{ rotate: '180deg' }] },
  cornerNum: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  pip: {
    width: 6, height: 6, borderRadius: 3,
    marginTop: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  centerNum: {
    color: '#ffffff',
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 },
  },

  // Variant A (polished Phase 10 number cards)
  innerRim: {
    position: 'absolute',
    top: 2, left: 2, right: 2, bottom: 2,
    borderRadius: 9,
    borderWidth: 1,
  },
  topSheen: {
    position: 'absolute',
    top: 3, left: 3, right: 3,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
  },
  varAcornerNum: {
    color: '#ffffff',
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  varAcenterNum: {
    color: '#ffffff',
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
  },
  wildBars: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    opacity: 0.35,
  },
  wildBar: { flex: 1 },
  wildStar: {
    color: '#ffd84d',
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  wildLabel: {
    color: '#ffd84d',
    fontWeight: '800',
    letterSpacing: 3,
    position: 'absolute',
    bottom: 7,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  skipGlyph: {
    color: '#c8102e',
    fontWeight: '900',
  },
  skipLabel: {
    color: '#c8102e',
    fontWeight: '800',
    letterSpacing: 3,
    position: 'absolute',
    bottom: 7,
  },

  backBorder: {
    alignItems: 'center', justifyContent: 'center',
    width: '82%', height: '82%',
    borderWidth: 2,
    borderColor: 'rgba(245,195,75,0.35)',
    borderRadius: 6,
  },
  backDiamond: {
    position: 'absolute',
    width: '58%', height: '58%',
    borderWidth: 1.5,
    borderColor: 'rgba(245,195,75,0.2)',
    borderRadius: 4,
    transform: [{ rotate: '45deg' }],
  },
  backMark: {
    color: 'rgba(245,195,75,0.6)',
  },

  // Standard-deck face styles
  stdCornerWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  stdCornerTL: { top: 4, left: 5 },
  stdCornerBR: { bottom: 4, right: 5, transform: [{ rotate: '180deg' }] },
  stdCornerRank: { fontWeight: '900', letterSpacing: -0.5 },
  stdCornerSuit: { fontWeight: '700', marginTop: -2 },
  stdCenterGlyph: { fontWeight: '900' },
  stdFaceLetter: {
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

export { SUIT_GRAD };
