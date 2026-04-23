import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useKeepAwake } from 'expo-keep-awake';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { GameCard } from '../components/Card';
import { useDragCtx, type DropTarget } from '../components/DragContext';
import { DraggableHand } from '../components/DraggableHand';
import { DropZoneView } from '../components/DropZoneView';
import { FeltBackground } from '../components/FeltBackground';
import { IconToggle as SharedIconToggle } from '../components/IconToggle';
import { MyField } from '../components/MyField';
import { PhaseSlot, PhaseSlotInfo } from '../components/PhaseSlot';
import {
  isValidColorGroup,
  isValidColorParity,
  isValidColorRun,
  isValidParitySet,
  isValidRun,
  isValidSet,
} from '../games/phase10/rules';
import { PHASES } from '../games/phase10/types';
import type { Card as CardT, GroupKind, LaidGroup } from '../games/phase10/types';
import { getVariant, type PhaseVariantId } from '../games/phase10/variants';
import { RootStackParamList } from '../navigation/types';
import {
  discardCard,
  drawFromDeck,
  drawFromDiscard,
  finalizeHand,
  HandState,
  hitGroupMulti,
  layPhase,
  Progress,
  resetForRematch,
  startGame,
  startNextHand,
} from '../net/actions';
import { db, ensureSignedIn } from '../net/firebase';
import { markConnected, RoomDoc, subscribeRoom } from '../net/room';
import { scaleStyles, useLayoutScale } from '../theme/responsive';
import { theme } from '../theme/colors';
import TrashTable from './TrashTable';
import TTTTable from './TTTTable';

type Props = NativeStackScreenProps<RootStackParamList, 'Table'>;

type FullRoom = RoomDoc & {
  hand?: HandState | null;
  progress?: Record<string, Progress>;
  handResult?: { wentOut: string; scoreDelta: Record<string, number>; completedPhase: Record<string, boolean> } | null;
  seriesWins?: Record<string, number>;
  lastWinner?: string;
};

function phaseSlots(phaseNum: number, variantId?: PhaseVariantId): PhaseSlotInfo[] {
  if (phaseNum < 1 || phaseNum > 10) return [];
  const phase = getVariant(variantId).phases[phaseNum - 1];
  const out: PhaseSlotInfo[] = [];
  (phase.sets ?? []).forEach((n) => out.push({ kind: 'set', size: n, label: `Set of ${n}` }));
  (phase.runs ?? []).forEach((n) => out.push({ kind: 'run', size: n, label: `Run of ${n}` }));
  (phase.colors ?? []).forEach((n) => out.push({ kind: 'color', size: n, label: `${n} of a color` }));
  (phase.parities ?? []).forEach((n) => out.push({ kind: 'parity', size: n, label: `Even or odd of ${n}` }));
  (phase.colorRuns ?? []).forEach((n) => out.push({ kind: 'colorRun', size: n, label: `Color run of ${n}` }));
  (phase.colorParities ?? []).forEach((n) => out.push({ kind: 'colorParity', size: n, label: `Color even/odd of ${n}` }));
  return out;
}

function validateSlot(slot: PhaseSlotInfo, cards: CardT[]): boolean {
  switch (slot.kind) {
    case 'set': return isValidSet(cards, slot.size);
    case 'run': return isValidRun(cards, slot.size);
    case 'color': return isValidColorGroup(cards, slot.size);
    case 'parity': return isValidParitySet(cards, slot.size);
    case 'colorRun': return isValidColorRun(cards, slot.size);
    case 'colorParity': return isValidColorParity(cards, slot.size);
  }
}

export default function Table({ route, navigation }: Props) {
  const { roomCode } = route.params;
  const [room, setRoom] = useState<FullRoom | null>(null);
  const [roomLoaded, setRoomLoaded] = useState(false);
  const [myHand, setMyHand] = useState<CardT[]>([]);
  const [myUid, setMyUid] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'normal' | 'lay' | 'hit'>('normal');

  // During lay mode: cards staged into each slot (parallel to phase slots).
  const [staged, setStaged] = useState<string[][]>([]);

  // User-controlled ordering of cards in hand. Reconciled with server hand.
  const [handOrder, setHandOrder] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wildPrompt, setWildPrompt] = useState<{
    wilds: CardT[];
    options: number[];
    onResolve: (values: Record<string, number>) => Promise<void> | void;
  } | null>(null);

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
        (snap) => setMyHand((snap.data()?.cards ?? []) as CardT[]),
      );
      markConnected(roomCode, true).catch(() => undefined);
    })();
    return () => {
      unsubRoom?.();
      unsubHand?.();
      markConnected(roomCode, false).catch(() => undefined);
    };
  }, [roomCode]);

  // Track foreground/background to flip our connected flag.
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

  // Reconcile handOrder with server-side hand: keep user's order for cards
  // still present, append any new cards at the end, drop missing ones.
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
    return handOrder.map((id) => byId.get(id)).filter(Boolean) as CardT[];
  }, [handOrder, myHand]);

  const sortByValue = () => {
    const rank = (c: CardT): number => {
      if (c.kind === 'num') return c.value * 10 + colorOrder(c.color);
      if (c.kind === 'skip') return 1000;
      return 2000; // wild last
    };
    const sorted = [...orderedHand].sort((a, b) => rank(a) - rank(b));
    setHandOrder(sorted.map((c) => c.id));
  };

  const sortByColor = () => {
    const sorted = [...orderedHand].sort((a, b) => {
      if (a.kind !== 'num' && b.kind === 'num') return 1;
      if (a.kind === 'num' && b.kind !== 'num') return -1;
      if (a.kind === 'num' && b.kind === 'num') {
        const ca = colorOrder(a.color), cb = colorOrder(b.color);
        if (ca !== cb) return ca - cb;
        return a.value - b.value;
      }
      if (a.kind === 'skip' && b.kind === 'wild') return -1;
      if (a.kind === 'wild' && b.kind === 'skip') return 1;
      return 0;
    });
    setHandOrder(sorted.map((c) => c.id));
  };

  const me = myUid && room ? room.players[myUid] : null;
  const opp = opponentUid && room ? room.players[opponentUid] : null;
  const hand = room?.hand ?? null;
  const isPhase10 = !room?.gameType || room.gameType === 'phase10';
  const myProgress = myUid ? room?.progress?.[myUid] : undefined;
  const oppProgress = opponentUid ? room?.progress?.[opponentUid] : undefined;
  const isMyTurn = hand?.turn === myUid;
  const myLaid: LaidGroup[] = isPhase10 && myUid && hand?.laid?.[myUid] ? hand.laid[myUid] : [];
  const oppLaid: LaidGroup[] = isPhase10 && opponentUid && hand?.laid?.[opponentUid] ? hand.laid[opponentUid] : [];
  const myPhaseNum = myProgress?.phase ?? 1;
  const oppPhaseNum = oppProgress?.phase ?? 1;
  const variantId = (room?.phase10Variant as PhaseVariantId | undefined);
  const mySlots = phaseSlots(myPhaseNum, variantId);
  const oppSlots = phaseSlots(oppPhaseNum, variantId);
  const alreadyLaid = myLaid.length > 0;

  // Auto-start the game as host — Phase 10 only
  useEffect(() => {
    if (!room || !myUid) return;
    if (room.hostUid !== myUid) return;
    if (room.gameType && room.gameType !== 'phase10') return;
    if (room.status === 'waiting' && Object.keys(room.players).length === 2) {
      startGame(roomCode).catch((e) => setError(e.message));
    }
  }, [room, myUid, roomCode]);

  // Host auto-finalizes hand — Phase 10 only
  useEffect(() => {
    if (!room || !myUid) return;
    if (room.hostUid !== myUid) return;
    if (room.gameType && room.gameType !== 'phase10') return;
    if (room.status === 'handOver' && room.hand?.wentOut && !room.handResult) {
      finalizeHand(roomCode).catch((e) => setError(e.message));
    }
  }, [room, myUid, roomCode]);

  const toggleSelect = (id: string) => {
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

  const onDrawDeck = () => doAction(() => drawFromDeck(roomCode));
  const onDrawDiscard = () => doAction(() => drawFromDiscard(roomCode));

  // Drag a hand card into a phase slot during lay mode. Appends to staged[slotIdx];
  // if the slot is now full, validates the group locally.
  const onDropIntoSlot = (card: CardT, slotIdx: number) => {
    const slot = mySlots[slotIdx];
    if (!slot) return;
    setStaged((prev) => {
      const arr = prev.length ? prev.map((a) => [...a]) : mySlots.map(() => [] as string[]);
      if (arr[slotIdx].includes(card.id)) return prev;
      if (arr[slotIdx].length >= slot.size) {
        setError(`${slot.label} is full — tap it to clear.`);
        return prev;
      }
      for (let i = 0; i < arr.length; i++) arr[i] = arr[i].filter((id) => id !== card.id);
      arr[slotIdx] = [...arr[slotIdx], card.id];
      if (arr[slotIdx].length === slot.size) {
        const byId = new Map(myHand.map((c) => [c.id, c]));
        const cards = arr[slotIdx].map((id) => byId.get(id)!).filter(Boolean);
        if (!validateSlot(slot, cards)) {
          setError(`Those cards don't form a valid ${slot.label.toLowerCase()}.`);
        } else {
          setError(null);
        }
      } else {
        setError(null);
      }
      return arr;
    });
  };

  // Drag a hand card onto a laid meld during hit mode — single-card hit with
  // wild-value prompt when dropping a wild onto a 2-end-open run.
  const onDropHit = (card: CardT, ownerUid: string, idx: number) => {
    if (!hand) return;
    const target = hand.laid[ownerUid]?.[idx];
    if (!target) return;

    const submit = async (declaredValue?: number) => {
      await doAction(async () => {
        await hitGroupMulti(roomCode, ownerUid, idx, [
          { cardId: card.id, declaredValue: card.kind === 'wild' ? declaredValue : undefined },
        ]);
        setSelected(new Set());
        setMode('normal');
        setWildPrompt(null);
      });
    };

    if (card.kind === 'wild' && target.kind === 'run') {
      const naturals = target.cards.filter((c) => c.kind === 'num') as Array<{ value: number }>;
      const N = target.cards.length;
      let start = 1;
      for (let s = 1; s <= 13 - N + 1; s++) {
        const slots = new Set<number>();
        for (let i = 0; i < N; i++) slots.add(s + i);
        if (naturals.every((c) => slots.has(c.value))) { start = s; break; }
      }
      const lowVal = start - 1;
      const highVal = start + N;
      const canLow = lowVal >= 1;
      const canHigh = highVal <= 12;
      if (canLow && canHigh) {
        setWildPrompt({
          wilds: [card],
          options: [lowVal, highVal],
          onResolve: async (values) => { await submit(values[card.id]); },
        });
        return;
      }
    }
    submit();
  };

  const onDropDiscard = (card: CardT) => {
    doAction(async () => {
      await discardCard(roomCode, card.id);
      setSelected(new Set());
    });
  };

  // Register the drop handler with DragContext whenever inputs change.
  const drag = useDragCtx();
  useEffect(() => {
    drag.setHandler((card, target: DropTarget) => {
      if (!isMyTurn || busy) return;
      if (target.kind === 'slot') {
        if (mode === 'lay') onDropIntoSlot(card as CardT, target.slotIndex);
      } else if (target.kind === 'hit') {
        if (mode === 'hit') onDropHit(card as CardT, target.ownerUid, target.groupIndex);
      } else if (target.kind === 'discard') {
        if (mode === 'normal' && hand?.hasDrawn) onDropDiscard(card as CardT);
      }
    });
  }, [drag, mode, isMyTurn, busy, hand, mySlots, myHand, roomCode]);

  const onDiscard = () => {
    if (selected.size !== 1) { setError('Pick exactly one card to discard'); return; }
    const id = Array.from(selected)[0];
    doAction(async () => {
      await discardCard(roomCode, id);
      setSelected(new Set());
    });
  };

  const onStartLay = () => {
    setMode('lay');
    setStaged(mySlots.map(() => []));
    setSelected(new Set());
    setError(null);
  };

  const onCancelLay = () => {
    setMode('normal');
    setStaged([]);
    setSelected(new Set());
    setError(null);
  };

  const onPlaceIntoSlot = (slotIdx: number) => {
    const slot = mySlots[slotIdx];
    if (!slot) return;
    if (selected.size === 0) {
      // Tapping a filled slot clears it.
      if (staged[slotIdx]?.length) {
        const next = staged.map((arr, i) => (i === slotIdx ? [] : arr));
        setStaged(next);
        setError(null);
      } else {
        setError('Select cards in your hand first');
      }
      return;
    }
    if (selected.size !== slot.size) {
      setError(`Pick exactly ${slot.size} cards for the ${slot.label.toLowerCase()}`);
      return;
    }
    const cardsById = new Map(myHand.map((c) => [c.id, c]));
    const cards = Array.from(selected).map((id) => cardsById.get(id)!).filter(Boolean);
    if (!validateSlot(slot, cards)) {
      setError(`Those cards don't form a valid ${slot.label.toLowerCase()}`);
      return;
    }
    const next = staged.map((arr, i) => (i === slotIdx ? Array.from(selected) : arr));
    setStaged(next);
    setSelected(new Set());
    setError(null);
  };

  const canConfirmLay = staged.length > 0 && staged.every((arr, i) => arr.length === mySlots[i]?.size);
  const onConfirmLay = async () => {
    await doAction(async () => {
      const groups = staged.map((ids, i) => ({ kind: mySlots[i].kind, cardIds: ids }));
      await layPhase(roomCode, groups);
      setMode('normal');
      setStaged([]);
    });
  };

  const onStartHit = () => { setMode('hit'); setSelected(new Set()); setError(null); setWildPrompt(null); };
  const onPickHitTarget = async (ownerUid: string, idx: number) => {
    if (selected.size < 1) { setError('Pick one or more cards, then tap a laid group'); return; }
    if (!hand) return;
    const cardsById = new Map(myHand.map((c) => [c.id, c]));
    const selectedCards = Array.from(selected).map((id) => cardsById.get(id)!).filter(Boolean);
    const target = hand.laid[ownerUid]?.[idx];
    if (!target) return;

    // If any wild is being played onto a RUN and both ends are open, ask.
    const wildsNeedingChoice: CardT[] = [];
    if (target.kind === 'run') {
      const naturals = target.cards.filter((c) => c.kind === 'num') as Array<{ value: number }>;
      const N = target.cards.length;
      let start = -1;
      for (let s = 1; s <= 13 - N + 1; s++) {
        const slots = new Set<number>();
        for (let i = 0; i < N; i++) slots.add(s + i);
        if (naturals.every((c) => slots.has(c.value))) { start = s; break; }
      }
      const canLow = start > 1;
      const canHigh = start + N <= 12;
      if (canLow && canHigh) {
        for (const c of selectedCards) {
          if (c.kind === 'wild') wildsNeedingChoice.push(c);
        }
      }
    }

    const submit = async (wildValues: Record<string, number>) => {
      await doAction(async () => {
        await hitGroupMulti(
          roomCode,
          ownerUid,
          idx,
          selectedCards.map((c) => ({
            cardId: c.id,
            declaredValue: c.kind === 'wild' ? wildValues[c.id] : undefined,
          })),
        );
        setSelected(new Set());
        setMode('normal');
        setWildPrompt(null);
      });
    };

    if (wildsNeedingChoice.length > 0) {
      // Compute current run bounds for value options.
      const naturals = target.cards.filter((c) => c.kind === 'num') as Array<{ value: number }>;
      const N = target.cards.length;
      let start = 1;
      for (let s = 1; s <= 13 - N + 1; s++) {
        const slots = new Set<number>();
        for (let i = 0; i < N; i++) slots.add(s + i);
        if (naturals.every((c) => slots.has(c.value))) { start = s; break; }
      }
      const lowVal = start - 1;
      const highVal = start + N;
      setWildPrompt({
        wilds: wildsNeedingChoice,
        options: [lowVal, highVal].filter((v) => v >= 1 && v <= 12),
        onResolve: submit,
      });
      return;
    }
    // No choice needed — submit directly.
    await submit({});
  };
  const onCancelHit = () => { setMode('normal'); setSelected(new Set()); setError(null); setWildPrompt(null); };

  const stagedIds = new Set(staged.flat());

  if (roomLoaded && !room) {
    return (
      <FeltBackground variant="phase10">
        <SafeAreaView style={{ flex: 1 }}>
          <View style={s.center}>
            <Text style={[s.dim, { fontSize: 16, marginBottom: 16 }]}>
              Room {roomCode} doesn't exist anymore.
            </Text>
            <Button label="Back to home" variant="primary" size="lg" onPress={() => navigation.popToTop()} />
          </View>
        </SafeAreaView>
      </FeltBackground>
    );
  }
  // Dispatch to game-specific table.
  if (room && room.gameType === 'trash') {
    return <TrashTable navigation={navigation} route={route} />;
  }
  if (room && room.gameType === 'three-thirteen') {
    return <TTTTable navigation={navigation} route={route} />;
  }
  if (!room || !myUid) {
    return (
      <FeltBackground variant="phase10">
        <SafeAreaView style={{ flex: 1 }}>
          <View style={s.center}><Text style={s.dim}>Loading…</Text></View>
        </SafeAreaView>
      </FeltBackground>
    );
  }

  const showHandOver = room.status === 'handOver' && room.handResult;
  const showGameOver = room.status === 'gameOver';
  const canDrawDiscard =
    isMyTurn && !hand?.hasDrawn && (hand?.discard.length ?? 0) > 0 &&
    hand!.discard[hand!.discard.length - 1].kind !== 'skip';

  return (
    <FeltBackground variant="phase10">
    <SafeAreaView style={{ flex: 1 }}>
      {/* Top bar: room code + quit */}
      <View style={s.topBar}>
        <Text style={s.topBarCode}>ROOM · {roomCode}</Text>
        <Pressable onPress={() => navigation.popToTop()} style={({ pressed }) => [s.quitBtn, pressed && { opacity: 0.7 }]}>
          <Text style={s.quitText}>✕ Quit</Text>
        </Pressable>
      </View>

      {/* Opponent offline banner */}
      {opp && !opp.connected && (
        <View style={s.offlineBanner}>
          <Text style={s.offlineText}>
            {opp.nickname} is offline — game paused until they return.
          </Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
      {/* Opponent header */}
      <View style={s.playerHeader}>
        <Avatar
          name={opp?.nickname ?? '?'}
          phase={oppPhaseNum}
          wins={opponentUid ? room.seriesWins?.[opponentUid] : 0}
          score={oppProgress?.totalScore}
          connected={opp?.connected !== false}
        />
        <View style={s.phasesCenter}>
          {oppLaid.length > 0 ? (
            oppLaid.map((g, i) => (
              <DropZoneView
                key={i}
                id={`opp-laid-${i}`}
                target={{ kind: 'hit', ownerUid: opponentUid!, groupIndex: i }}
                enabled={mode === 'hit' && !!opponentUid && isMyTurn && !!hand?.hasDrawn && !busy}
              >
                <PhaseSlot
                  slot={{ kind: g.kind, size: g.cards.length, label: g.kind }}
                  cards={g.cards}
                  locked
                  highlighted={mode === 'hit'}
                  onPress={mode === 'hit' && opponentUid ? () => onPickHitTarget(opponentUid, i) : undefined}
                />
              </DropZoneView>
            ))
          ) : (
            oppSlots.map((s, i) => <PhaseSlot key={i} slot={s} />)
          )}
        </View>
      </View>

      {/* Piles */}
      <View style={s.piles}>
        <Pressable onPress={isMyTurn && !hand?.hasDrawn && !busy ? onDrawDeck : undefined}>
          <View style={s.pile}>
            <GameCard backTheme="phase10" />
            <Text style={s.pileLabel}>Deck · {hand?.deck.length ?? 0}</Text>
          </View>
        </Pressable>
        <DropZoneView
          id="discard"
          target={{ kind: 'discard' }}
          enabled={mode === 'normal' && isMyTurn && !!hand?.hasDrawn && !busy}
        >
          <Pressable onPress={canDrawDiscard && !busy ? onDrawDiscard : undefined}>
            <View style={s.pile}>
              {hand?.discard.length ? (
                <GameCard card={hand.discard[hand.discard.length - 1]} />
              ) : (
                <View style={s.pileEmpty} />
              )}
              <Text style={s.pileLabel}>Discard</Text>
            </View>
          </Pressable>
        </DropZoneView>
      </View>

      <Text
        style={[
          s.turnBanner,
          error
            ? { color: theme.danger }
            : mode === 'lay' || mode === 'hit'
              ? { color: theme.inkDim }
              : undefined,
        ]}
        numberOfLines={2}
      >
        {error
          ? error
          : mode === 'lay'
            ? 'Select cards, then tap a dashed slot. Tap a filled slot to clear.'
            : mode === 'hit'
              ? 'Pick one card, then tap any laid group (yours or theirs) to hit.'
              : isMyTurn
                ? hand?.hasDrawn
                  ? 'Your move — lay, hit, or discard'
                  : 'Your turn — draw a card'
                : `Waiting for ${opp?.nickname ?? 'opponent'}…`}
      </Text>
      </View>

      <MyField>
      {/* My phase slots */}
      <View style={s.playerHeader}>
        <Avatar
          name={me?.nickname ?? '?'}
          phase={myPhaseNum}
          wins={myUid ? room.seriesWins?.[myUid] : 0}
          score={myProgress?.totalScore}
          me
          connected
        />
        <View style={s.phasesCenter}>
          {alreadyLaid
            ? myLaid.map((g, i) => (
              <DropZoneView
                key={i}
                id={`my-laid-${i}`}
                target={{ kind: 'hit', ownerUid: myUid, groupIndex: i }}
                enabled={mode === 'hit' && isMyTurn && !!hand?.hasDrawn && !busy}
              >
                <PhaseSlot
                  slot={{ kind: g.kind, size: g.cards.length, label: g.kind }}
                  cards={g.cards}
                  locked
                  highlighted={mode === 'hit'}
                  onPress={mode === 'hit' && myUid ? () => onPickHitTarget(myUid, i) : undefined}
                />
              </DropZoneView>
            ))
            : mySlots.map((slotInfo, i) => {
              const stagedIdList = staged[i] ?? [];
              const cardsInSlot = stagedIdList
                .map((id) => myHand.find((c) => c.id === id))
                .filter(Boolean) as CardT[];
              return (
                <DropZoneView
                  key={i}
                  id={`my-slot-${i}`}
                  target={{ kind: 'slot', slotIndex: i }}
                  enabled={mode === 'lay' && isMyTurn && !!hand?.hasDrawn && !busy}
                  ghost
                >
                  <PhaseSlot
                    slot={slotInfo}
                    cards={cardsInSlot.length ? cardsInSlot : undefined}
                    target={mode === 'lay'}
                    onPress={mode === 'lay' ? () => onPlaceIntoSlot(i) : undefined}
                  />
                </DropZoneView>
              );
            })}
          {myPhaseNum > 10 && (
            <Text style={s.dim}>All phases complete</Text>
          )}
        </View>
      </View>


      {/* My hand — drag to reorder, drag onto slots/melds/discard to act */}
      <View style={s.handWrap}>
        <View style={s.handToolbar}>
          <IconToggle icon="1·2·3" onPress={sortByValue} disabled={mode === 'lay' || mode === 'hit'} />
          <IconToggle icon="●●●" onPress={sortByColor} disabled={mode === 'lay' || mode === 'hit'} />
          {selected.size > 0 && (
            <Pressable onPress={() => setSelected(new Set())} style={s.selectionPill}>
              <Text style={s.selectionPillText}>{selected.size} selected · tap to clear</Text>
            </Pressable>
          )}
        </View>
        <DraggableHand
          cards={orderedHand.filter((c) => !stagedIds.has(c.id))}
          selectedIds={selected}
          onTap={toggleSelect}
          onReorder={(newVisibleOrder) => {
            const stagedList = Array.from(stagedIds);
            setHandOrder([...newVisibleOrder, ...stagedList]);
          }}
        />
      </View>

      {/* Action bar */}
      <View style={s.actionBar}>
        {mode === 'normal' && (
          <>
            <Button
              label="Discard"
              variant="primary"
              size="lg"
              onPress={onDiscard}
              disabled={!isMyTurn || !hand?.hasDrawn || selected.size !== 1 || busy}
            />
            <Button
              label="Lay phase"
              variant="secondary"
              size="lg"
              onPress={onStartLay}
              disabled={!isMyTurn || !hand?.hasDrawn || alreadyLaid || busy || myPhaseNum > 10}
            />
            <Button
              label="Hit"
              variant="secondary"
              size="lg"
              onPress={onStartHit}
              disabled={!isMyTurn || !hand?.hasDrawn || !alreadyLaid || busy}
            />
          </>
        )}
        {mode === 'lay' && (
          <>
            <Button
              label="Confirm lay"
              variant="primary"
              size="lg"
              onPress={onConfirmLay}
              disabled={!canConfirmLay || busy}
            />
            <Button label="Cancel" variant="ghost" size="lg" onPress={onCancelLay} />
          </>
        )}
        {mode === 'hit' && (
          <>
            <Text style={[styles.dim, { flex: 1, textAlign: 'center' }]}>
              Pick any number of cards, then tap a laid group.
            </Text>
            <Button label="Cancel" variant="ghost" size="lg" onPress={onCancelHit} />
          </>
        )}
      </View>
      </MyField>

      {/* Modals */}
      {showHandOver && !showGameOver && (
        <HandOverModal
          room={room}
          myUid={myUid}
          onNext={() => doAction(() => startNextHand(roomCode))}
          isHost={room.hostUid === myUid}
          busy={busy}
        />
      )}
      {showGameOver && (
        <GameOverModal
          room={room}
          myUid={myUid}
          isHost={room.hostUid === myUid}
          onRematch={() => doAction(() => resetForRematch(roomCode))}
          onHome={() => navigation.popToTop()}
          busy={busy}
        />
      )}
      {wildPrompt && (
        <WildValuePrompt
          prompt={wildPrompt}
          onCancel={() => setWildPrompt(null)}
        />
      )}
    </SafeAreaView>
    </FeltBackground>
  );
}

function WildValuePrompt({
  prompt, onCancel,
}: {
  prompt: { wilds: CardT[]; options: number[]; onResolve: (v: Record<string, number>) => void | Promise<void> };
  onCancel: () => void;
}) {
  // For multi-wild, ask one at a time via nested selection.
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const nextWild = prompt.wilds.find((w) => assignments[w.id] === undefined);
  const allSet = !nextWild;
  const pick = (val: number) => {
    if (!nextWild) return;
    const next = { ...assignments, [nextWild.id]: val };
    setAssignments(next);
    if (prompt.wilds.every((w) => next[w.id] !== undefined)) {
      prompt.onResolve(next);
    }
  };
  return (
    <Modal transparent animationType="fade">
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Wild value</Text>
          <Text style={styles.modalLine}>
            {allSet ? 'Applying…' : `Which value for this wild?${prompt.wilds.length > 1 ? ` (${Object.keys(assignments).length + 1}/${prompt.wilds.length})` : ''}`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            {prompt.options.map((v) => (
              <Pressable key={v} style={styles.modalBtn} onPress={() => pick(v)}>
                <Text style={styles.modalBtnText}>{v}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.modalBtnSecondary} onPress={onCancel}>
            <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function colorOrder(c: 'red' | 'blue' | 'green' | 'yellow'): number {
  return { red: 0, yellow: 1, green: 2, blue: 3 }[c];
}

function Avatar({
  name, phase, wins, score, me, connected,
}: { name: string; phase: number; wins?: number; score?: number; me?: boolean; connected?: boolean }) {
  const initial = (name[0] ?? '?').toUpperCase();
  return (
    <View style={styles.avatarBox}>
      <View style={[styles.avatar, me && styles.avatarMe, connected === false && styles.avatarOffline]}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
      <Text numberOfLines={1} style={styles.avatarName}>
        {name}{wins && wins > 0 ? `  🏆${wins}` : ''}
      </Text>
      <View style={styles.avatarScorePill}>
        <Text style={styles.avatarScoreText}>{score ?? 0} pts</Text>
      </View>
      <View style={styles.phaseBadge}>
        <Text style={styles.phaseBadgeText}>{phase > 10 ? '★' : phase}</Text>
      </View>
      {connected === false && <View style={styles.offlineDot} />}
    </View>
  );
}

function SmallBtn({ label, onPress, primary, disabled }: { label: string; onPress?: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.smallBtn, primary && styles.smallBtnPrimary, disabled && { opacity: 0.35 }]}
    >
      <Text style={[styles.smallBtnText, primary && styles.smallBtnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function BigBtn({ label, onPress, primary, disabled }: { label: string; onPress?: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.bigBtn, primary && styles.bigBtnPrimary, disabled && { opacity: 0.35 }]}
    >
      <Text style={[styles.bigBtnText, primary && styles.bigBtnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

const IconToggle = SharedIconToggle;

function HandOverModal({
  room, myUid, onNext, isHost, busy,
}: { room: FullRoom; myUid: string; onNext: () => void; isHost: boolean; busy: boolean }) {
  const result = room.handResult!;
  const opp = Object.keys(room.players).find((u) => u !== myUid)!;
  return (
    <Modal transparent animationType="fade">
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Hand over</Text>
          <Text style={styles.modalLine}>
            {result.wentOut === myUid ? 'You went out!' : `${room.players[result.wentOut].nickname} went out.`}
          </Text>
          <View style={styles.scoreRow}>
            <View style={styles.scoreCell}>
              <Text style={styles.modalLabel}>You</Text>
              <Text style={styles.modalVal}>+{result.scoreDelta[myUid]} · phase {room.progress![myUid].phase}</Text>
              <Text style={styles.modalMeta}>{result.completedPhase[myUid] ? 'Phase complete ✓' : 'Phase incomplete'}</Text>
            </View>
            <View style={styles.scoreCell}>
              <Text style={styles.modalLabel}>{room.players[opp].nickname}</Text>
              <Text style={styles.modalVal}>+{result.scoreDelta[opp]} · phase {room.progress![opp].phase}</Text>
              <Text style={styles.modalMeta}>{result.completedPhase[opp] ? 'Phase complete ✓' : 'Phase incomplete'}</Text>
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

function GameOverModal({
  room, myUid, isHost, onRematch, onHome, busy,
}: { room: FullRoom; myUid: string; isHost: boolean; onRematch: () => void; onHome: () => void; busy: boolean }) {
  const uids = Object.keys(room.players);
  const winner = room.lastWinner ?? uids[0];
  const seriesWins = room.seriesWins ?? {};
  return (
    <Modal transparent animationType="fade">
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Game over</Text>
          <Text style={styles.modalLine}>
            {winner === myUid ? '🏆 You win!' : `${room.players[winner].nickname} wins.`}
          </Text>
          <View style={styles.scoreRow}>
            {uids.map((u) => (
              <View key={u} style={styles.scoreCell}>
                <Text style={styles.modalLabel}>{u === myUid ? 'You' : room.players[u].nickname}</Text>
                <Text style={styles.modalVal}>{room.progress![u].totalScore} pts</Text>
                <Text style={styles.modalMeta}>Series wins · {seriesWins[u] ?? 0}</Text>
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
  safe: { flex: 1, backgroundColor: theme.felt },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dim: { color: theme.inkDim, fontSize: 12 },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: theme.feltLight,
  },
  topBarCode: {
    color: theme.inkDim,
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
  },
  quitBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.inkFaint,
  },
  quitText: {
    color: theme.inkDim,
    fontSize: 11,
    fontWeight: '700',
  },

  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  phasesCenter: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  slotsRow: { paddingHorizontal: 4, alignItems: 'center' },

  avatarBox: {
    alignItems: 'center',
    width: 60,
    marginRight: 4,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.feltLight,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: theme.feltDark,
  },
  avatarMe: {
    borderColor: theme.accent,
  },
  avatarOffline: {
    opacity: 0.5,
    borderColor: theme.danger,
  },
  avatarText: { color: theme.ink, fontWeight: '800', fontSize: 18 },
  avatarName: { color: theme.inkDim, fontSize: 10, marginTop: 2 },
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
  offlineDot: {
    position: 'absolute',
    bottom: 14, left: 4,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: theme.danger,
    borderWidth: 2, borderColor: theme.felt,
  },
  offlineBanner: {
    backgroundColor: '#3a1a1a',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.danger,
  },
  offlineText: {
    color: '#ffb3b3',
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  phaseBadge: {
    position: 'absolute', top: -4, right: 4,
    minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: theme.accent,
    paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  phaseBadgeText: { color: theme.feltDark, fontSize: 11, fontWeight: '800' },

  piles: {
    flexDirection: 'row', gap: 32, justifyContent: 'center', marginVertical: 18,
  },
  pile: { alignItems: 'center' },
  pileEmpty: {
    width: 64, height: 92, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed',
    borderColor: theme.feltLight,
  },
  pileLabel: { color: theme.inkDim, fontSize: 10, marginTop: 2 },

  turnBanner: {
    color: theme.accent, textAlign: 'center', fontSize: 13, fontWeight: '600',
    marginBottom: 4, paddingHorizontal: 16,
    minHeight: 34,
  },
  error: { color: theme.danger, fontSize: 12, textAlign: 'center', paddingHorizontal: 16, marginTop: 2 },
  helperBanner: {
    marginHorizontal: 12, padding: 8, borderRadius: 8,
    backgroundColor: theme.feltDark,
    borderWidth: 1, borderColor: theme.feltLight,
    marginTop: 2,
  },
  helperText: { color: theme.inkDim, fontSize: 12, textAlign: 'center' },

  handWrap: {
    marginTop: 'auto',
    paddingBottom: 4,
  },
  handToolbar: {
    flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', paddingVertical: 4,
  },
  selectionPill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
    backgroundColor: 'rgba(245,195,75,0.18)',
    borderWidth: 1, borderColor: 'rgba(245,195,75,0.5)',
    marginLeft: 4,
  },
  selectionPillText: {
    color: theme.accent, fontSize: 11, fontWeight: '800', letterSpacing: 0.3,
  },
  hand: {
    paddingLeft: 40,
    paddingRight: 16,
    paddingVertical: 8,
    minHeight: 110,
  },
  handCard: {},
  handCardOverlap: { marginLeft: -36 },

  actionBar: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8, flexWrap: 'wrap',
    justifyContent: 'center',
  },
  smallBtn: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: theme.accent,
  },
  smallBtnPrimary: { backgroundColor: theme.accent },
  smallBtnText: { color: theme.accent, fontWeight: '700', fontSize: 13 },
  smallBtnTextPrimary: { color: theme.feltDark },

  bigBtn: {
    paddingHorizontal: 22, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: theme.accent,
    minWidth: 108, alignItems: 'center',
  },
  bigBtnPrimary: { backgroundColor: theme.accent },
  bigBtnText: { color: theme.accent, fontWeight: '800', fontSize: 16 },
  bigBtnTextPrimary: { color: theme.feltDark },

  iconToggle: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: theme.feltLight,
    backgroundColor: theme.feltDark,
    alignItems: 'center', minWidth: 60,
  },
  iconToggleActive: {
    borderColor: theme.accent,
  },
  iconToggleIcon: { color: theme.inkDim, fontSize: 14, fontWeight: '800' },
  iconToggleLabel: { color: theme.inkDim, fontSize: 10, marginTop: 1, fontWeight: '600' },

  modalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 16,
  },
  modalCard: {
    width: '100%', maxWidth: 360, backgroundColor: theme.feltDark, borderRadius: 16, padding: 24,
    borderWidth: 1, borderColor: theme.feltLight, alignItems: 'center',
  },
  modalTitle: { color: theme.ink, fontSize: 22, fontWeight: '800' },
  modalLine: { color: theme.inkDim, fontSize: 14, marginTop: 6, textAlign: 'center' },
  scoreRow: { flexDirection: 'row', gap: 24, marginTop: 16 },
  scoreCell: { alignItems: 'center' },
  modalLabel: { color: theme.inkDim, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  modalVal: { color: theme.accent, fontSize: 18, fontWeight: '700', marginTop: 4 },
  modalMeta: { color: theme.inkDim, fontSize: 11, marginTop: 2 },
  modalBtn: {
    backgroundColor: theme.accent, paddingVertical: 12, paddingHorizontal: 32,
    borderRadius: 12, marginTop: 20,
  },
  modalBtnText: { color: theme.feltDark, fontWeight: '700', fontSize: 16 },
  modalBtnSecondary: { paddingVertical: 10, marginTop: 8 },
  modalBtnSecondaryText: { color: theme.inkDim, fontSize: 14 },
});
