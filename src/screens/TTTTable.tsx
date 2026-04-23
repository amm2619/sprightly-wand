import { useKeepAwake } from 'expo-keep-awake';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { GameCard } from '../components/Card';
import { FeltBackground } from '../components/FeltBackground';
import { rankLabel, StdCard, Suit } from '../games/standard/types';
import { GroupKind, isValidRun, isValidSet, LaidGroup } from '../games/ttt/rules';
import { IconToggle } from '../components/IconToggle';
import { PhaseSlot } from '../components/PhaseSlot';
import { RootStackParamList } from '../navigation/types';
import { db, ensureSignedIn } from '../net/firebase';
import { markConnected, RoomDoc, subscribeRoom } from '../net/room';
import { scaleStyles, useLayoutScale } from '../theme/responsive';
import {
  discardTTT,
  drawFromDeckTTT,
  drawFromDiscardTTT,
  extendOwnMeld,
  finalizeTTTHand,
  layMelds,
  resetTTTForRematch,
  startNextTTTHand,
  startTTTHand,
  TTTHand,
  TTTHandResult,
  TTTProgress,
} from '../net/tttActions';
import { theme } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Table'>;

type FullRoom = RoomDoc & {
  hand?: TTTHand | null;
  progress?: Record<string, TTTProgress>;
  handResult?: TTTHandResult | null;
  seriesWins?: Record<string, number>;
  lastWinner?: string;
};

export default function TTTTable({ route, navigation }: Props) {
  const { roomCode } = route.params;
  const [room, setRoom] = useState<FullRoom | null>(null);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [myHand, setMyHand] = useState<StdCard[]>([]);
  const [myUid, setMyUid] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'normal' | 'lay' | 'extend'>('normal');
  const [layStaging, setLayStaging] = useState<{ kind: GroupKind; cardIds: string[] }[]>([]);

  const [handOrder, setHandOrder] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useKeepAwake();
  const scale = useLayoutScale();
  const s = useMemo(() => scaleStyles(styles, scale), [scale]);

  useEffect(() => {
    let unsubRoom: (() => void) | undefined;
    let unsubHand: (() => void) | undefined;
    (async () => {
      const uid = await ensureSignedIn();
      setMyUid(uid);
      unsubRoom = subscribeRoom(roomCode, (r) => {
        setRoom(r as FullRoom | null);
        setRoomLoaded(true);
      });
      unsubHand = onSnapshot(
        doc(db, 'rooms', roomCode, 'privateHands', uid),
        (snap) => setMyHand((snap.data()?.cards ?? []) as StdCard[]),
      );
      markConnected(roomCode, true).catch(() => undefined);
    })();
    return () => {
      unsubRoom?.(); unsubHand?.();
      markConnected(roomCode, false).catch(() => undefined);
    };
  }, [roomCode]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      markConnected(roomCode, s === 'active').catch(() => undefined);
    });
    return () => sub.remove();
  }, [roomCode]);

  const opponentUid = useMemo(() => {
    if (!room || !myUid) return null;
    return Object.keys(room.players).find((u) => u !== myUid) ?? null;
  }, [room, myUid]);

  // Reconcile hand order
  useEffect(() => {
    setHandOrder((prev) => {
      const present = new Set(myHand.map((c) => c.id));
      const kept = prev.filter((id) => present.has(id));
      const keptSet = new Set(kept);
      const added = myHand.filter((c) => !keptSet.has(c.id)).map((c) => c.id);
      return [...kept, ...added];
    });
  }, [myHand]);

  const orderedHand = useMemo(() => {
    const byId = new Map(myHand.map((c) => [c.id, c]));
    return handOrder.map((id) => byId.get(id)).filter(Boolean) as StdCard[];
  }, [handOrder, myHand]);

  const sortByRank = () => {
    const sorted = [...orderedHand].sort((a, b) => a.rank - b.rank || suitOrder(a.suit) - suitOrder(b.suit));
    setHandOrder(sorted.map((c) => c.id));
  };
  const sortBySuit = () => {
    const sorted = [...orderedHand].sort((a, b) => suitOrder(a.suit) - suitOrder(b.suit) || a.rank - b.rank);
    setHandOrder(sorted.map((c) => c.id));
  };

  const me = myUid && room ? room.players[myUid] : null;
  const opp = opponentUid && room ? room.players[opponentUid] : null;
  const hand = room?.hand ?? null;
  const isMyTurn = hand?.turn === myUid;
  const myLaid: LaidGroup[] = myUid && hand?.laid?.[myUid] ? hand.laid[myUid] : [];
  const oppLaid: LaidGroup[] = opponentUid && hand?.laid?.[opponentUid] ? hand.laid[opponentUid] : [];
  const alreadyLaid = myLaid.length > 0;

  // Host auto-start
  useEffect(() => {
    if (!room || !myUid) return;
    if (room.hostUid !== myUid) return;
    if (room.gameType !== 'three-thirteen') return;
    if (room.status === 'waiting' && Object.keys(room.players).length === 2) {
      startTTTHand(roomCode).catch((e) => setError(e.message));
    }
  }, [room, myUid, roomCode]);

  // Host auto-finalize
  useEffect(() => {
    if (!room || !myUid) return;
    if (room.hostUid !== myUid) return;
    if (room.gameType !== 'three-thirteen') return;
    if (room.status === 'handOver' && room.hand?.wentOut && !room.handResult) {
      finalizeTTTHand(roomCode).catch((e) => setError(e.message));
    }
  }, [room, myUid, roomCode]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const doAction = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const stagedIds = new Set(layStaging.flatMap((g) => g.cardIds));

  // Lay mode helpers — Phase-10-style: create empty slots, then drop cards
  const onStartLay = () => {
    setMode('lay'); setLayStaging([]); setSelected(new Set()); setError(null);
  };
  const onCancelLay = () => {
    setMode('normal'); setLayStaging([]); setSelected(new Set()); setError(null);
  };
  const onAddEmptySlot = (kind: GroupKind) => {
    setLayStaging((g) => [...g, { kind, cardIds: [] }]);
    setError(null);
  };
  const onTapStagedSlot = (i: number) => {
    const slot = layStaging[i];
    if (!slot || !hand) return;

    if (slot.cardIds.length > 0) {
      // Filled → clear, return cards to hand.
      setLayStaging((g) => g.map((s, idx) => (idx === i ? { ...s, cardIds: [] } : s)));
      setError(null);
      return;
    }
    // Empty slot.
    if (selected.size === 0) {
      // No selection → remove this empty slot.
      setLayStaging((g) => g.filter((_, idx) => idx !== i));
      setError(null);
      return;
    }
    // Fill with selection, validating against the chosen kind.
    if (selected.size < 3) { setError('Melds need at least 3 cards'); return; }
    const cardsById = new Map(myHand.map((c) => [c.id, c]));
    const cards = Array.from(selected).map((id) => cardsById.get(id)!).filter(Boolean);
    const wildRank = hand.wildRank as 3;
    if (slot.kind === 'set' && !isValidSet(cards, wildRank)) {
      setError(`Those cards aren't a valid set (need same rank, wilds OK, at least 1 natural)`);
      return;
    }
    if (slot.kind === 'run' && !isValidRun(cards, wildRank)) {
      setError(`Those cards aren't a valid run (need same suit, consecutive, Ace low only)`);
      return;
    }
    setLayStaging((g) => g.map((s, idx) => (idx === i ? { ...s, cardIds: Array.from(selected) } : s)));
    setSelected(new Set());
    setError(null);
  };
  const onConfirmLay = () => {
    const filled = layStaging.filter((g) => g.cardIds.length > 0);
    if (filled.length === 0) { setError('Fill at least one meld before confirming'); return; }
    doAction(async () => {
      await layMelds(roomCode, filled);
      setMode('normal'); setLayStaging([]);
    });
  };

  // Extend mode
  const onStartExtend = () => { setMode('extend'); setSelected(new Set()); setError(null); };
  const onCancelExtend = () => { setMode('normal'); setSelected(new Set()); setError(null); };
  const onTapMyMeld = async (groupIdx: number) => {
    if (mode !== 'extend') return;
    if (selected.size !== 1) { setError('Pick one card, then a meld'); return; }
    const cardId = Array.from(selected)[0];
    await doAction(async () => {
      await extendOwnMeld(roomCode, groupIdx, cardId);
      setSelected(new Set()); setMode('normal');
    });
  };

  const onDiscard = () => {
    if (selected.size !== 1) { setError('Pick one card to discard'); return; }
    const id = Array.from(selected)[0];
    doAction(async () => { await discardTTT(roomCode, id); setSelected(new Set()); });
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

  const showHandOver = room.status === 'handOver' && room.handResult;
  const showGameOver = room.status === 'gameOver';
  const canGoOut = alreadyLaid;

  return (
    <FeltBackground>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={s.topBar}>
          <View>
            <Text style={s.topBarCode}>ROOM · {roomCode} · 3 TO 13</Text>
            {hand && (
              <Text style={s.topBarMeta}>
                HAND {hand.handNumber}/11 · <Text style={{ color: theme.accent }}>{rankLabel(hand.wildRank as 1)}s WILD</Text>
              </Text>
            )}
          </View>
          <Pressable onPress={() => navigation.popToTop()} style={({ pressed }) => [s.quitBtn, pressed && { opacity: 0.7 }]}>
            <Text style={s.quitText}>✕ Quit</Text>
          </Pressable>
        </View>

        {opp && !opp.connected && (
          <View style={s.offlineBanner}>
            <Text style={s.offlineText}>{opp.nickname} is offline — game paused.</Text>
          </View>
        )}

        {/* Opponent row */}
        <View style={s.playerBlock}>
          <Avatar
            name={opp?.nickname ?? '?'}
            wins={opponentUid ? room.seriesWins?.[opponentUid] ?? 0 : 0}
            score={opponentUid ? room.progress?.[opponentUid]?.totalScore : undefined}
          />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.playerName}>{opp?.nickname ?? '?'}</Text>
            <Text style={s.playerMeta}>
              {opponentUid && hand ? `${hand.counts[opponentUid] ?? 0} cards` : '—'}
              {' · '}
              {opponentUid ? `${room.progress?.[opponentUid]?.totalScore ?? 0} pts total` : ''}
            </Text>
          </View>
        </View>
        {oppLaid.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.meldRow}>
            {oppLaid.map((g, i) => <MeldDisplay key={i} group={g} />)}
          </ScrollView>
        )}

        {/* Piles + wild banner */}
        <View style={s.midRow}>
          <Pressable onPress={isMyTurn && !hand?.hasDrawn && !busy ? () => doAction(() => drawFromDeckTTT(roomCode)) : undefined} style={s.pile}>
            <GameCard />
            <Text style={s.pileLabel}>Deck · {hand?.deck?.length ?? 0}</Text>
          </Pressable>
          <Pressable
            onPress={isMyTurn && !hand?.hasDrawn && hand?.discard?.length && !busy ? () => doAction(() => drawFromDiscardTTT(roomCode)) : undefined}
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
            : hand?.wentOut && hand.wentOut !== myUid && isMyTurn
              ? '⏱ Last chance! One more turn before scoring'
              : hand?.wentOut && hand.wentOut === myUid
                ? `You went out — ${opp?.nickname ?? 'opponent'} gets one last turn`
                : isMyTurn
                  ? hand?.hasDrawn
                    ? alreadyLaid ? 'Extend melds or discard to end turn' : 'Lay melds or discard to end turn'
                    : 'Your turn — draw a card'
                  : `Waiting for ${opp?.nickname ?? 'opponent'}…`}
        </Text>

        {/* My laid melds — visible whenever laid, tappable in extend mode */}
        {alreadyLaid && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.meldsScroll}>
            {myLaid.map((g, i) => (
              <PhaseSlot
                key={i}
                slot={{ kind: g.kind, size: g.cards.length, label: `${g.kind} of ${g.cards.length}` }}
                cards={g.cards}
                locked
                target={mode === 'extend'}
                onPress={mode === 'extend' ? () => onTapMyMeld(i) : undefined}
              />
            ))}
          </ScrollView>
        )}

        {/* Lay staging panel */}
        {mode === 'lay' && (
          <View style={s.layPanel}>
            <View style={s.layHeaderRow}>
              <Text style={s.layTitle}>Build your melds</Text>
              <Text style={s.laySelectedCount}>
                {selected.size} card{selected.size === 1 ? '' : 's'} selected
              </Text>
            </View>
            <Text style={s.layHint}>
              Tap <Text style={{ color: theme.accent, fontWeight: '800' }}>+ Set</Text> or <Text style={{ color: theme.accent, fontWeight: '800' }}>+ Run</Text> to add a slot. Select 3+ cards, tap an empty slot to drop them in. Tap a filled slot to clear it.
            </Text>

            {/* Staged slots (same visual as Phase 10) */}
            {layStaging.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.meldsScroll}>
                {layStaging.map((g, i) => {
                  const byId = new Map(myHand.map((c) => [c.id, c]));
                  const cardsInSlot = g.cardIds
                    .map((id) => byId.get(id))
                    .filter(Boolean) as StdCard[];
                  const filled = cardsInSlot.length > 0;
                  return (
                    <PhaseSlot
                      key={i}
                      slot={{
                        kind: g.kind,
                        size: Math.max(3, cardsInSlot.length),
                        label: filled ? `${g.kind} of ${cardsInSlot.length}` : 'Tap to fill',
                      }}
                      cards={filled ? cardsInSlot : undefined}
                      locked={filled}
                      target={!filled && selected.size >= 3}
                      onPress={() => onTapStagedSlot(i)}
                    />
                  );
                })}
              </ScrollView>
            )}

            <View style={s.layButtons}>
              <Button label="+ Set" variant="secondary" size="md" onPress={() => onAddEmptySlot('set')} />
              <Button label="+ Run" variant="secondary" size="md" onPress={() => onAddEmptySlot('run')} />
              <Button
                label="Confirm lay"
                variant="primary"
                size="md"
                onPress={onConfirmLay}
                disabled={!layStaging.some((g) => g.cardIds.length > 0) || busy}
              />
              <Button label="Cancel" variant="ghost" size="md" onPress={onCancelLay} />
            </View>
          </View>
        )}
        {mode === 'extend' && (
          <View style={s.layPanel}>
            <Text style={s.layHint}>Pick one card, then tap one of your melds above.</Text>
            <View style={s.layButtons}>
              <Button label="Cancel" variant="ghost" size="md" onPress={onCancelExtend} />
            </View>
          </View>
        )}

        {/* My hand row */}
        <View style={s.handWrap}>
          <View style={s.handToolbar}>
            <IconToggle
              icon="1·2·3"
              onPress={sortByRank}
              disabled={mode !== 'normal' && mode !== 'lay'}
            />
            <IconToggle
              icon="♠♥♦♣"
              onPress={sortBySuit}
              disabled={mode !== 'normal' && mode !== 'lay'}
            />
          </View>
          <View style={s.meRow}>
            <Text style={s.playerName}>{me?.nickname ?? 'You'}  {myUid && room.seriesWins?.[myUid] ? `🏆${room.seriesWins[myUid]}` : ''}</Text>
            <Text style={s.playerMeta}>{myHand.length} cards · {myUid ? room.progress?.[myUid]?.totalScore ?? 0 : 0} pts total</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hand}>
            {orderedHand.filter((c) => !stagedIds.has(c.id)).map((c, i) => (
              <Pressable key={c.id} onPress={() => toggle(c.id)} style={[s.handCard, i > 0 && s.handCardOverlap]}>
                <GameCard card={c} selected={selected.has(c.id)} />
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={s.actionBar}>
          {mode === 'normal' && (
            <>
              <Button
                label="Discard"
                variant="primary"
                size="lg"
                onPress={onDiscard}
                disabled={!isMyTurn || !hand?.hasDrawn || selected.size !== 1 || busy || (myHand.length === 1 && !canGoOut)}
              />
              {!alreadyLaid && (
                <Button
                  label="Lay melds"
                  variant="secondary"
                  size="lg"
                  onPress={onStartLay}
                  disabled={!isMyTurn || !hand?.hasDrawn || busy}
                />
              )}
              {alreadyLaid && (
                <Button
                  label="Extend"
                  variant="secondary"
                  size="lg"
                  onPress={onStartExtend}
                  disabled={!isMyTurn || !hand?.hasDrawn || busy}
                />
              )}
            </>
          )}
        </View>

        {showHandOver && !showGameOver && (
          <HandOverModal
            room={room}
            myUid={myUid}
            isHost={room.hostUid === myUid}
            onNext={() => doAction(() => startNextTTTHand(roomCode))}
            busy={busy}
          />
        )}
        {showGameOver && (
          <GameOverModal
            room={room}
            myUid={myUid}
            isHost={room.hostUid === myUid}
            onRematch={() => doAction(() => resetTTTForRematch(roomCode))}
            onHome={() => navigation.popToTop()}
            busy={busy}
          />
        )}
      </SafeAreaView>
    </FeltBackground>
  );
}

function suitOrder(s: Suit): number {
  return { spade: 0, heart: 1, club: 2, diamond: 3 }[s];
}

function Avatar({ name, wins, score }: { name: string; wins: number; score?: number }) {
  const initial = (name[0] ?? '?').toUpperCase();
  return (
    <View style={{ width: 56, alignItems: 'center' }}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      {wins > 0 && <Text style={styles.winBadge}>🏆{wins}</Text>}
      {typeof score === 'number' && (
        <View style={styles.avatarScorePill}>
          <Text style={styles.avatarScoreText}>{score} pts</Text>
        </View>
      )}
    </View>
  );
}

function MeldDisplay({ group }: { group: LaidGroup }) {
  return (
    <View style={styles.meld}>
      <Text style={styles.meldLabel}>{group.kind.toUpperCase()}</Text>
      <View style={styles.meldCards}>
        {group.cards.map((c, i) => (
          <View key={c.id} style={i > 0 ? { marginLeft: -24 } : undefined}>
            <GameCard card={c} small />
          </View>
        ))}
      </View>
    </View>
  );
}


function HandOverModal({ room, myUid, isHost, onNext, busy }: { room: FullRoom; myUid: string; isHost: boolean; onNext: () => void; busy: boolean }) {
  const result = room.handResult!;
  const opp = Object.keys(room.players).find((u) => u !== myUid)!;
  return (
    <Modal transparent animationType="fade">
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Hand {room.hand?.handNumber} over</Text>
          <Text style={styles.modalLine}>
            {result.wentOut === myUid ? 'You went out!' : `${room.players[result.wentOut].nickname} went out.`}
          </Text>
          <View style={styles.scoreRow}>
            <View style={styles.scoreCell}>
              <Text style={styles.modalLabel}>You</Text>
              <Text style={styles.modalVal}>+{result.scoreDelta[myUid]}</Text>
              <Text style={styles.modalMeta}>{room.progress![myUid].totalScore} pts total</Text>
            </View>
            <View style={styles.scoreCell}>
              <Text style={styles.modalLabel}>{room.players[opp].nickname}</Text>
              <Text style={styles.modalVal}>+{result.scoreDelta[opp]}</Text>
              <Text style={styles.modalMeta}>{room.progress![opp].totalScore} pts total</Text>
            </View>
          </View>
          {isHost ? (
            <Pressable style={styles.modalBtn} onPress={onNext} disabled={busy}>
              <Text style={styles.modalBtnText}>Next hand</Text>
            </Pressable>
          ) : (
            <Text style={styles.dim}>Waiting for host to start next hand…</Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function GameOverModal({ room, myUid, isHost, onRematch, onHome, busy }: { room: FullRoom; myUid: string; isHost: boolean; onRematch: () => void; onHome: () => void; busy: boolean }) {
  const winner = room.lastWinner ?? Object.keys(room.players)[0];
  const uids = Object.keys(room.players);
  return (
    <Modal transparent animationType="fade">
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Game over</Text>
          <Text style={styles.modalLine}>
            {winner === myUid ? '🏆 You win! Lowest score.' : `${room.players[winner].nickname} wins.`}
          </Text>
          <View style={styles.scoreRow}>
            {uids.map((u) => (
              <View key={u} style={styles.scoreCell}>
                <Text style={styles.modalLabel}>{u === myUid ? 'You' : room.players[u].nickname}</Text>
                <Text style={styles.modalVal}>{room.progress![u].totalScore}</Text>
                <Text style={styles.modalMeta}>Series · {room.seriesWins?.[u] ?? 0}</Text>
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
  topBarMeta: { color: theme.inkDim, fontSize: 10, letterSpacing: 1, fontWeight: '700', marginTop: 1 },
  quitBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: theme.inkFaint },
  quitText: { color: theme.inkDim, fontSize: 11, fontWeight: '700' },
  offlineBanner: { backgroundColor: '#3a1a1a', paddingVertical: 6, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: theme.danger },
  offlineText: { color: '#ffb3b3', fontSize: 12, textAlign: 'center', fontWeight: '600' },
  playerBlock: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.feltLight, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: theme.feltDark,
  },
  avatarText: { color: theme.ink, fontWeight: '800', fontSize: 16 },
  winBadge: { color: theme.accent, fontSize: 10, marginTop: 2, fontWeight: '700' },
  avatarScorePill: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(245,195,75,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245,195,75,0.5)',
  },
  avatarScoreText: { color: theme.accent, fontSize: 11, fontWeight: '800' },
  playerName: { color: theme.ink, fontSize: 14, fontWeight: '700' },
  playerMeta: { color: theme.inkDim, fontSize: 11, marginTop: 1 },
  meldRow: { paddingHorizontal: 12, paddingBottom: 6, gap: 8 },
  meldsScroll: { paddingHorizontal: 8, paddingVertical: 6, gap: 8, alignItems: 'flex-start' },
  layHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  laySelectedCount: { color: theme.accent, fontSize: 11, fontWeight: '700' },
  meld: {
    padding: 6, borderRadius: 10,
    backgroundColor: theme.feltDark, borderWidth: 1, borderColor: theme.feltLight,
    marginRight: 8,
  },
  meldLabel: { color: theme.inkDim, fontSize: 9, letterSpacing: 1, fontWeight: '800', marginBottom: 2 },
  meldCards: { flexDirection: 'row' },
  meldTarget: { borderWidth: 2, borderColor: theme.accent, borderRadius: 12 },
  midRow: { flexDirection: 'row', gap: 24, justifyContent: 'center', marginVertical: 10 },
  pile: { alignItems: 'center' },
  pileEmpty: { width: 68, height: 98, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.feltLight },
  pileLabel: { color: theme.inkDim, fontSize: 11, marginTop: 4 },
  wildBanner: {
    marginHorizontal: 12, marginTop: 4, padding: 10, borderRadius: 10,
    backgroundColor: theme.feltDark, borderWidth: 1, borderColor: theme.feltLight,
  },
  wildBannerKicker: { color: theme.inkDim, fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  wildBannerText: { color: theme.ink, fontSize: 13, marginTop: 2, fontWeight: '600' },
  turnBanner: {
    color: theme.accent, textAlign: 'center', fontSize: 13, fontWeight: '600',
    marginTop: 4, paddingHorizontal: 16, minHeight: 34,
  },
  error: { color: theme.danger, fontSize: 12, textAlign: 'center', paddingHorizontal: 16, marginTop: 4 },
  layPanel: { marginHorizontal: 12, marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: theme.feltDark, borderWidth: 1, borderColor: theme.accent },
  layTitle: { color: theme.ink, fontSize: 14, fontWeight: '700' },
  layHint: { color: theme.inkDim, fontSize: 11, marginTop: 4 },
  stagingList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  stagingPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: theme.feltLight },
  stagingText: { color: theme.ink, fontSize: 11, fontWeight: '700' },
  layButtons: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  handWrap: { marginTop: 'auto', paddingBottom: 4 },
  handToolbar: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 4 },
  iconBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.feltLight, backgroundColor: theme.feltDark },
  iconBtnText: { color: theme.inkDim, fontSize: 11, fontWeight: '700' },
  meRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 4 },
  hand: { paddingLeft: 40, paddingRight: 16, paddingVertical: 8, minHeight: 110 },
  handCard: {},
  handCardOverlap: { marginLeft: -36 },
  actionBar: { flexDirection: 'row', gap: 8, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10, flexWrap: 'wrap' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: theme.feltDark, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: theme.feltLight, alignItems: 'center' },
  modalTitle: { color: theme.ink, fontSize: 22, fontWeight: '800' },
  modalLine: { color: theme.inkDim, fontSize: 14, marginTop: 6, textAlign: 'center' },
  scoreRow: { flexDirection: 'row', gap: 24, marginTop: 14 },
  scoreCell: { alignItems: 'center' },
  modalLabel: { color: theme.inkDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  modalVal: { color: theme.accent, fontSize: 18, fontWeight: '700', marginTop: 4 },
  modalMeta: { color: theme.inkDim, fontSize: 11, marginTop: 2 },
  modalBtn: { backgroundColor: theme.accent, paddingVertical: 12, paddingHorizontal: 32, borderRadius: 12, marginTop: 20 },
  modalBtnText: { color: theme.feltDark, fontWeight: '700', fontSize: 16 },
  modalBtnSecondary: { paddingVertical: 10, marginTop: 8 },
  modalBtnSecondaryText: { color: theme.inkDim, fontSize: 14 },
});
