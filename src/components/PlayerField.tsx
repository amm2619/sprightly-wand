import { ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { theme } from '../theme/colors';

type Props = {
  orientation: 'top' | 'bottom';
  name: string;
  isMe?: boolean;
  connected?: boolean;
  wins?: number;
  score?: number;
  /** Absolutely-positioned pip over the avatar (e.g. Phase 10 phase badge). */
  badge?: ReactNode;
  /** Small label rendered in the avatar column below the score pill. */
  meta?: string;
  /** Game-specific board content: melds, phase slots, trash slot grid, etc. */
  children?: ReactNode;
};

const MIN_HEIGHT = 260;
const MAX_HEIGHT = 420;
const TARGET_RATIO = 0.48;

export function PlayerField({
  orientation, name, isMe, connected, wins, score, badge, meta, children,
}: Props) {
  const { height } = useWindowDimensions();
  const h = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, height * TARGET_RATIO));
  const isTop = orientation === 'top';
  const initial = (name[0] ?? '?').toUpperCase();
  const offline = connected === false;

  return (
    <View
      style={[
        styles.field,
        isTop && { height: h, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
      ]}
      collapsable={false}
    >
      <View style={styles.row}>
        <View style={styles.avatarCol}>
          <View style={styles.avatarWrap}>
            <View
              style={[
                styles.avatar,
                isMe && styles.avatarMe,
                offline && styles.avatarOffline,
              ]}
            >
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            {badge ? <View style={styles.badgeSlot}>{badge}</View> : null}
            {offline ? <View style={styles.offlineDot} /> : null}
          </View>
          <Text numberOfLines={1} style={styles.name}>
            {name}{wins && wins > 0 ? `  🏆${wins}` : ''}
          </Text>
          {typeof score === 'number' && (
            <View style={styles.scorePill}>
              <Text style={styles.scoreText}>{score} pts</Text>
            </View>
          )}
          {meta ? <Text numberOfLines={1} style={styles.meta}>{meta}</Text> : null}
        </View>
        <View style={styles.body}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCol: {
    alignItems: 'center',
    width: 72,
    marginRight: 4,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.feltLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: theme.feltDark,
  },
  avatarMe: { borderColor: theme.accent },
  avatarOffline: { opacity: 0.5, borderColor: theme.danger },
  avatarText: { color: theme.ink, fontWeight: '800', fontSize: 18 },
  badgeSlot: {
    position: 'absolute',
    top: -4,
    right: -6,
  },
  offlineDot: {
    position: 'absolute',
    bottom: 2, left: 2,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: theme.danger,
    borderWidth: 2, borderColor: theme.felt,
  },
  name: {
    color: theme.inkDim,
    fontSize: 10,
    marginTop: 2,
    maxWidth: 72,
    textAlign: 'center',
  },
  scorePill: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(245,195,75,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245,195,75,0.5)',
  },
  scoreText: { color: theme.accent, fontSize: 11, fontWeight: '800' },
  meta: {
    color: theme.inkFaint,
    fontSize: 10,
    marginTop: 3,
    maxWidth: 72,
    textAlign: 'center',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});

/** Small reusable pill — e.g. the Phase 10 phase number badge. */
export function PhaseBadge({ num }: { num: number }) {
  return (
    <View style={phaseBadgeStyles.badge}>
      <Text style={phaseBadgeStyles.text}>{num > 10 ? '★' : num}</Text>
    </View>
  );
}

const phaseBadgeStyles = StyleSheet.create({
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: theme.accent,
    paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  text: { color: theme.feltDark, fontSize: 11, fontWeight: '800' },
});
