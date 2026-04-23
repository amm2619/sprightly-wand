import { useKeepAwake } from 'expo-keep-awake';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { GameCard } from '../components/Card';
import { FeltBackground } from '../components/FeltBackground';
import { canPlaceAtSlot, slotLabel } from '../games/trash/rules';
import { StdCard } from '../games/standard/types';
import { RootStackParamList } from '../navigation/types';
import { ensureSignedIn } from '../net/firebase';
import { markConnected, RoomDoc, subscribeRoom } from '../net/room';
import { scaleStyles, useLayoutScale } from '../theme/responsive';
import {
  discardTrashHeld,
  drawTrashDeck,
  drawTrashDiscard,
  placeTrashHeld,
  resetTrashForRematch,
  startTrashRound,
  TrashHand,
} from '../net/trashActions';
import { theme } from '../theme/colors';
import { useMemo as useMemoReact } from 'react';

type Props = NativeStackScreenProps<RootStackParamList, 'Table'>;

type FullRoom = RoomDoc & {
  hand?: TrashHand | null;
  handResult?: { winner: string } | null;
  seriesWins?: Record<string, number>;
  lastWinner?: string;
};

export default function TrashTable({ route, navigation }: Props) {
  const { roomCode } = route.params;
  const [room, setRoom] = useState<FullRoom | null>(null);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [myUid, setMyUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useKeepAwake();
  const scale = useLayoutScale();
  const s = useMemoReact(() => scaleStyles(styles, scale), [scale]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const uid = await ensureSignedIn();
      setMyUid(uid);
      unsub = subscribeRoom(roomCode, (r) => {
        setRoom(r as FullRoom | null);
        setRoomLoaded(true);
      });
      markConnected(roomCode, true).catch(() => undefined);
    })();
    return () => {
      unsub?.();
      markConnected(roomCode, false).catch(() => undefined);
    };
  }, [roomCode]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      markConnected(roomCode, state === 'active').catch(() => undefined);
    });
    return () => sub.remove();
  }, [roomCode]);

  const opponentUid = useMemo(() => {
    if (!room || !myUid) return null;
    return Object.keys(room.players).find((u) => u !== myUid) ?? null;
  }, [room, myUid]);

  const me = myUid && room ? room.players[myUid] : null;
  const opp = opponentUid && room ? room.players[opponentUid] : null;
  const hand = room?.hand ?? null;
  const isMyTurn = hand?.turn === myUid;

  // Host auto-start when both seated (or roundOver transitions into next round)
  useEffect(() => {
    if (!room || !myUid) return;
    if (room.hostUid !== myUid) return;
    if (room.status === 'waiting' && Object.keys(room.players).length === 2) {
      startTrashRound(roomCode).catch((e) => setError(e.message));
    }
  }, [room, myUid, roomCode]);

  const doAction = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  if (roomLoaded && !room) {
    return (
      <FeltBackground><SafeAreaView style={{ flex: 1 }}>
        <View style={s.center}>
          <Text style={s.dim}>Room {roomCode} doesn't exist anymore.</Text>
          <Button label="Back to home" variant="primary" size="lg" onPress={() => navigation.popToTop()} />
        </View>
      </SafeAreaView></FeltBackground>
    );
  }
  if (!room || !myUid) {
    return (
      <FeltBackground><SafeAreaView style={{ flex: 1 }}>
        <View style={s.center}><Text style={s.dim}>Loading…</Text></View>
      </SafeAreaView></FeltBackground>
    );
  }

  const roundOver = room.status === 'roundOver' && room.handResult;
  const gameOver = room.status === 'gameOver';

  return (
    <FeltBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.topBar}>
          <Text style={s.topBarCode}>ROOM · {roomCode} · TRASH</Text>
          <Pressable onPress={() => navigation.popToTop()} style={({ pressed }) => [s.quitBtn, pressed && { opacity: 0.7 }]}>
            <Text style={s.quitText}>✕ Quit</Text>
          </Pressable>
        </View>

        {/* Opponent offline banner */}
        {opp && !opp.connected && (
          <View style={s.offlineBanner}>
            <Text style={s.offlineText}>{opp.nickname} is offline — game paused.</Text>
          </View>
        )}

        {/* Opponent */}
        <View style={s.playerBlock}>
          <PlayerHeader
            name={opp?.nickname ?? '?'}
            roundSize={opponentUid ? hand?.roundSizes?.[opponentUid] ?? 10 : 10}
            wins={opponentUid ? room.seriesWins?.[opponentUid] ?? 0 : 0}
            connected={opp?.connected !== false}
          />
          <SlotGrid
            slots={opponentUid && hand?.faceUp?.[opponentUid] ? hand.faceUp[opponentUid] : []}
            roundSize={opponentUid ? hand?.roundSizes?.[opponentUid] ?? 0 : 0}
            opponent
          />
        </View>

        {/* Middle: Deck, Held (if any), Discard */}
        <View style={s.midRow}>
          <Pressable
            onPress={isMyTurn && !hand?.held && !busy ? () => doAction(() => drawTrashDeck(roomCode)) : undefined}
            style={s.pile}
          >
            <GameCard />
            <Text style={s.pileLabel}>Deck · {hand?.deck?.length ?? 0}</Text>
          </Pressable>

          <View style={s.heldSpot}>
            {hand?.held ? (
              <View style={s.heldWrap}>
                <Text style={s.heldLabel}>PLAY →</Text>
                <GameCard card={hand.held} selected />
              </View>
            ) : (
              <View style={s.heldEmpty}>
                <Text style={s.heldEmptyText}>Draw a{'\n'}card</Text>
              </View>
            )}
          </View>

          <Pressable
            onPress={
              isMyTurn && !hand?.held && hand?.discard?.length && !busy
                ? () => doAction(() => drawTrashDiscard(roomCode))
                : undefined
            }
            style={s.pile}
          >
            {hand?.discard?.length
              ? <GameCard card={hand.discard[hand.discard.length - 1]} />
              : <View style={s.pileEmpty} />}
            <Text style={s.pileLabel}>Discard</Text>
          </Pressable>
        </View>

        <Text
          style={[s.turnBanner, error ? { color: theme.danger } : undefined]}
          numberOfLines={2}
        >
          {error
            ? error
            : isMyTurn
              ? hand?.held
                ? 'Tap one of your slots to place, or Discard if you can\'t'
                : 'Your turn — draw a card'
              : `Waiting for ${opp?.nickname ?? 'opponent'}…`}
        </Text>

        {/* My slots */}
        <View style={s.playerBlock}>
          <PlayerHeader
            name={me?.nickname ?? '?'}
            roundSize={myUid ? hand?.roundSizes?.[myUid] ?? 10 : 10}
            wins={myUid ? room.seriesWins?.[myUid] ?? 0 : 0}
            me
            connected
          />
          <SlotGrid
            slots={myUid && hand?.faceUp?.[myUid] ? hand.faceUp[myUid] : []}
            roundSize={myUid ? hand?.roundSizes?.[myUid] ?? 0 : 0}
            heldCard={isMyTurn ? hand?.held ?? null : null}
            onTapSlot={
              isMyTurn && hand?.held
                ? (i) => doAction(() => placeTrashHeld(roomCode, i))
                : undefined
            }
          />
        </View>

        {/* Action bar */}
        <View style={s.actionBar}>
          <Button
            label="Discard held"
            variant="primary"
            size="lg"
            onPress={() => doAction(() => discardTrashHeld(roomCode))}
            disabled={!isMyTurn || !hand?.held || busy}
          />
        </View>

        {/* Modals */}
        {roundOver && !gameOver && (
          <RoundOverModal
            room={room}
            myUid={myUid}
            isHost={room.hostUid === myUid}
            onNext={() => doAction(() => startTrashRound(roomCode))}
            busy={busy}
          />
        )}
        {gameOver && (
          <GameOverModal
            room={room}
            myUid={myUid}
            isHost={room.hostUid === myUid}
            onRematch={() => doAction(() => resetTrashForRematch(roomCode))}
            onHome={() => navigation.popToTop()}
            busy={busy}
          />
        )}
      </SafeAreaView>
    </FeltBackground>
  );
}

/* ---------- Subcomponents ---------- */

function PlayerHeader({
  name, roundSize, wins, me, connected,
}: { name: string; roundSize: number; wins: number; me?: boolean; connected?: boolean }) {
  const initial = (name[0] ?? '?').toUpperCase();
  return (
    <View style={styles.headerRow}>
      <View style={[styles.avatar, me && styles.avatarMe, connected === false && styles.avatarOffline]}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <View style={{ marginLeft: 10 }}>
        <Text style={styles.playerName}>
          {name}{wins > 0 ? `  🏆${wins}` : ''}
        </Text>
        <Text style={styles.playerMeta}>Round to {roundSize} · {roundSize} slots left</Text>
      </View>
    </View>
  );
}

function SlotGrid({
  slots, roundSize, opponent, onTapSlot, heldCard,
}: {
  slots: (StdCard | null)[];
  roundSize: number;
  opponent?: boolean;
  onTapSlot?: (i: number) => void;
  heldCard?: StdCard | null;
}) {
  const safeSlots = Array.isArray(slots) ? slots : [];
  const rows = [
    safeSlots.slice(0, Math.min(5, roundSize)),
    safeSlots.slice(5, Math.min(10, roundSize)),
  ];
  let flatIndex = -1;
  return (
    <View style={styles.grid}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.gridRow}>
          {row.map((_, ci) => {
            flatIndex += 1;
            const i = flatIndex;
            const slotCard = row[ci];
            const faceUp = !!slotCard;
            const canPlace = !!heldCard && !faceUp
              && canPlaceAtSlot(heldCard, i, roundSize, safeSlots);
            const targetable = !!onTapSlot && canPlace;
            return (
              <Pressable
                key={i}
                onPress={targetable ? () => onTapSlot!(i) : undefined}
                style={[
                  styles.slot,
                  faceUp && styles.slotFaceUp,
                  targetable && styles.slotTarget,
                ]}
              >
                {!faceUp && (
                  <Text style={[styles.slotRank, opponent && { opacity: 0.4 }]}>
                    {slotLabel(i)}
                  </Text>
                )}
                {faceUp
                  ? <GameCard card={slotCard!} small />
                  : <GameCard small />}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function RoundOverModal({
  room, myUid, isHost, onNext, busy,
}: { room: FullRoom; myUid: string; isHost: boolean; onNext: () => void; busy: boolean }) {
  const winner = room.handResult!.winner;
  const isMe = winner === myUid;
  return (
    <Modal transparent animationType="fade">
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Round over</Text>
          <Text style={styles.modalLine}>
            {isMe ? '🏆 You won the round!' : `${room.players[winner].nickname} won the round.`}
          </Text>
          <Text style={styles.modalMeta}>
            {isMe
              ? `Next round you play for ${Math.max((room.hand?.roundSizes?.[myUid] ?? 10) - 1, 0)} slots.`
              : 'You stay at the same slot count next round.'}
          </Text>
          {isHost ? (
            <Pressable style={styles.modalBtn} onPress={onNext} disabled={busy}>
              <Text style={styles.modalBtnText}>Next round</Text>
            </Pressable>
          ) : (
            <Text style={styles.dim}>Waiting for host to start next round…</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function GameOverModal({
  room, myUid, isHost, onRematch, onHome, busy,
}: { room: FullRoom; myUid: string; isHost: boolean; onRematch: () => void; onHome: () => void; busy: boolean }) {
  const winner = room.lastWinner ?? Object.keys(room.players)[0];
  const seriesWins = room.seriesWins ?? {};
  const uids = Object.keys(room.players);
  return (
    <Modal transparent animationType="fade">
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Game over</Text>
          <Text style={styles.modalLine}>
            {winner === myUid ? '🏆 You win the game!' : `${room.players[winner].nickname} wins.`}
          </Text>
          <View style={styles.scoreRow}>
            {uids.map((u) => (
              <View key={u} style={styles.scoreCell}>
                <Text style={styles.modalLabel}>{u === myUid ? 'You' : room.players[u].nickname}</Text>
                <Text style={styles.modalVal}>Series · {seriesWins[u] ?? 0}</Text>
              </View>
            ))}
          </View>
          {isHost ? (
            <Pressable style={styles.modalBtn} onPress={onRematch} disabled={busy}>
              <Text style={styles.modalBtnText}>Rematch</Text>
            </Pressable>
          ) : (
            <Text style={styles.dim}>Waiting for host to rematch…</Text>
          )}
          <Pressable style={styles.modalBtnSecondary} onPress={onHome}>
            <Text style={styles.modalBtnSecondaryText}>Back to home</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  dim: { color: theme.inkDim, fontSize: 14 },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 2,
    borderBottomWidth: 1, borderBottomColor: theme.feltLight,
  },
  topBarCode: { color: theme.inkDim, fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  quitBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
    borderWidth: 1, borderColor: theme.inkFaint,
  },
  quitText: { color: theme.inkDim, fontSize: 11, fontWeight: '700' },
  offlineBanner: {
    backgroundColor: '#3a1a1a',
    paddingVertical: 6, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: theme.danger,
  },
  offlineText: { color: '#ffb3b3', fontSize: 12, textAlign: 'center', fontWeight: '600' },

  playerBlock: { paddingHorizontal: 12, paddingVertical: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.feltLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: theme.feltDark,
  },
  avatarMe: { borderColor: theme.accent },
  avatarOffline: { opacity: 0.5, borderColor: theme.danger },
  avatarText: { color: theme.ink, fontWeight: '800', fontSize: 16 },
  playerName: { color: theme.ink, fontSize: 14, fontWeight: '700' },
  playerMeta: { color: theme.inkDim, fontSize: 11, marginTop: 1 },

  grid: { gap: 4, alignItems: 'center' },
  gridRow: { flexDirection: 'row', gap: 4 },
  slot: {
    alignItems: 'center',
    padding: 3,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  slotFaceUp: {
    borderColor: 'rgba(255,255,255,0.18)',
  },
  slotTarget: {
    borderColor: theme.accent,
    backgroundColor: 'rgba(245,195,75,0.15)',
    shadowColor: theme.accent,
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  slotRank: {
    color: theme.accent,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 2,
  },

  midRow: {
    flexDirection: 'row', gap: 18, justifyContent: 'center',
    paddingVertical: 10, alignItems: 'center',
  },
  pile: { alignItems: 'center' },
  pileEmpty: {
    width: 68, height: 98, borderRadius: 12,
    borderWidth: 1, borderStyle: 'dashed', borderColor: theme.feltLight,
  },
  pileLabel: { color: theme.inkDim, fontSize: 11, marginTop: 4 },
  heldSpot: { alignItems: 'center', justifyContent: 'center' },
  heldWrap: { alignItems: 'center', gap: 2 },
  heldLabel: { color: theme.accent, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  heldEmpty: {
    width: 68, height: 98, borderRadius: 12,
    borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(245,195,75,0.3)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  heldEmptyText: { color: theme.inkDim, fontSize: 10, textAlign: 'center', fontWeight: '600' },

  turnBanner: {
    color: theme.accent, textAlign: 'center', fontSize: 13, fontWeight: '600',
    marginTop: 4, paddingHorizontal: 16, minHeight: 34,
  },
  error: { color: theme.danger, fontSize: 12, textAlign: 'center', paddingHorizontal: 16, marginTop: 4 },

  actionBar: {
    flexDirection: 'row', justifyContent: 'center',
    paddingHorizontal: 12, paddingVertical: 12, marginTop: 'auto',
  },

  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: {
    width: '100%', maxWidth: 360, backgroundColor: theme.feltDark, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: theme.feltLight, alignItems: 'center',
  },
  modalTitle: { color: theme.ink, fontSize: 22, fontWeight: '800' },
  modalLine: { color: theme.inkDim, fontSize: 14, marginTop: 6, textAlign: 'center' },
  modalMeta: { color: theme.inkDim, fontSize: 12, marginTop: 4, textAlign: 'center' },
  modalLabel: { color: theme.inkDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  modalVal: { color: theme.accent, fontSize: 16, fontWeight: '700', marginTop: 4 },
  scoreRow: { flexDirection: 'row', gap: 24, marginTop: 14 },
  scoreCell: { alignItems: 'center' },
  modalBtn: { backgroundColor: theme.accent, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, marginTop: 20 },
  modalBtnText: { color: theme.feltDark, fontWeight: '700', fontSize: 16 },
  modalBtnSecondary: { paddingVertical: 10, marginTop: 8 },
  modalBtnSecondaryText: { color: theme.inkDim, fontSize: 14 },
});
