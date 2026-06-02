# Sprightly Wand — Software Requirements Specification

**Version:** 1.0  
**Platform:** React Native (Expo) / Firebase  
**Scope:** Two-player mobile card game application

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [User Types](#2-user-types)
3. [Authentication](#3-authentication)
4. [Navigation & Screens](#4-navigation--screens)
5. [Room Management](#5-room-management)
6. [Game: Phase 10](#6-game-phase-10)
7. [Game: Trash (Garbage)](#7-game-trash-garbage)
8. [Game: 3 to 13](#8-game-3-to-13)
9. [Shared In-Game Features](#9-shared-in-game-features)
10. [Settings & Preferences](#10-settings--preferences)
11. [Push Notifications](#11-push-notifications)
12. [Security](#12-security)
13. [Data Models](#13-data-models)
14. [Non-Functional Requirements](#14-non-functional-requirements)

---

## 1. System Overview

Sprightly Wand is a private two-player card game app for mobile. Two known players share a persistent room per game type and play card games in real time over Firebase Firestore. The app is not a public matchmaking service — it is designed exclusively for one fixed pair of players.

### 1.1 Supported Games

| ID | Name | Description |
|----|------|-------------|
| `phase10` | Phase 10 | 10 phases of set/run/color/parity melds |
| `trash` | Trash | Fill 10 slots with shrinking rounds per winner |
| `three-thirteen` | 3 to 13 | Rummy-style, 11 hands, shifting wild rank |

### 1.2 Static Room Codes

Each game type has exactly one fixed room code shared by both players. Progress and series wins accumulate across sessions as long as the room has been accessed within the last 7 days.

| Game | Room Code |
|------|-----------|
| Phase 10 | `PH10` |
| Trash | `TR10` |
| 3 to 13 | `3T13` |

---

## 2. User Types

There are two roles within a room, assigned at the time of entry:

| Role | Description |
|------|-------------|
| **Host** | Created (or re-entered) the room first. Seat 0. Responsible for dealing cards and starting new hands/rounds. Has write access to both players' private hands. |
| **Guest** | Joined second. Seat 1. Can write to the room document and their own private hand. Signals the host when ready for the next round via the `nextRoundReady` flag. |

If the room has expired and both players rejoin, whichever enters first becomes the new host.

---

## 3. Authentication

### 3.1 Sign-In

- **REQ-AUTH-01:** The app shall sign in users anonymously via Firebase Authentication on first launch.
- **REQ-AUTH-02:** Users may optionally sign in with a Google account if Google Sign-In is configured.
- **REQ-AUTH-03:** The app shall use `ensureSignedIn()` before any Firestore write; anonymous sign-in is re-attempted automatically if the session has lapsed.
- **REQ-AUTH-04:** The current user's display name and email shall be shown on the Welcome screen when signed in with Google.

### 3.2 Persistence

- **REQ-AUTH-05:** Per-user settings (take-back toggle) shall be keyed to the Firebase UID so two players sharing a device maintain independent settings.
- **REQ-AUTH-06:** The take-back setting shall be loaded only after the auth state is resolved, to ensure it is applied to the correct UID.

---

## 4. Navigation & Screens

### 4.1 Screen Inventory

| Screen | Route | Description |
|--------|-------|-------------|
| Welcome | `Welcome` | Entry point. Nickname, host/join buttons, settings gear. |
| Settings | `Settings` | App-level preferences. |
| Game Pick | `GamePick` | Select a game type before hosting. |
| Host | `Host` | Create/re-enter the room and wait for the opponent. |
| Join | `Join` | Enter a 4-character room code to join. |
| Table | `Table` | Phase 10 game table. |
| Table (Trash) | `Table` | Trash game table (TTRTable component, dispatched from Table route). |
| Table (TTT) | `Table` | 3-to-13 game table (TTTTable component, dispatched from Table route). |
| Hand Over | `HandOver` | (Legacy) End-of-hand screen. |
| Game Over | `GameOver` | (Legacy) End-of-game screen. |
| Recover | `Recover` | Debug/recovery screen for resetting game state. |

### 4.2 Welcome Screen

- **REQ-WELCOME-01:** Display the app name and an animated decorative fan of 5 cycling cards.
- **REQ-WELCOME-02:** Provide a nickname text input (max 16 characters, word-case autocapitalization). Nickname is persisted to AsyncStorage.
- **REQ-WELCOME-03:** "Host game" button navigates to GamePick.
- **REQ-WELCOME-04:** "Join game" button navigates to Join.
- **REQ-WELCOME-05:** If a `lastRoomCode` is stored, display a "Rejoin last game" button that navigates directly to Table with that code.
- **REQ-WELCOME-06:** Display a gear icon in the top-right corner (in layout flow, not absolutely positioned) that navigates to Settings.
- **REQ-WELCOME-07:** Display a sign-in or sign-out control depending on current auth state.

### 4.3 Game Pick Screen

- **REQ-GAMEPICK-01:** Display one tile per available game: Phase 10, Trash, 3 to 13.
- **REQ-GAMEPICK-02:** Each tile shows the game name, tagline, and a brief description.
- **REQ-GAMEPICK-03:** Tapping a tile navigates to Host with the selected `gameType`.
- **REQ-GAMEPICK-04:** Tiles shall have a gold-tinted gradient border and press-scale animation (0.98).

### 4.4 Host Screen

- **REQ-HOST-01:** For Phase 10 only: show a variant picker before creating the room.
- **REQ-HOST-02:** For all other games: call `enterGameRoom` immediately on mount.
- **REQ-HOST-03:** Display the room code in large format with a share button (system share dialog).
- **REQ-HOST-04:** Display a hint that the code is reused and scores persist.
- **REQ-HOST-05:** Show a spinner and "Waiting for your friend..." while the second player has not yet joined.
- **REQ-HOST-06:** When a second player joins, display their nickname and "Starting…", then navigate to Table after an 800 ms delay.

### 4.5 Join Screen

- **REQ-JOIN-01:** Provide a text input for a 4-character room code (alphanumeric, uppercase, max 4 chars).
- **REQ-JOIN-02:** The "Join" button is enabled only when exactly 4 characters have been entered.
- **REQ-JOIN-03:** On join success, store the room code as `lastRoomCode` and navigate to Table.
- **REQ-JOIN-04:** On join failure, display the error message.
- **REQ-JOIN-05:** Disable the input and button while the join operation is in flight.

---

## 5. Room Management

### 5.1 Room Lifecycle

- **REQ-ROOM-01:** Rooms are identified by static 4-character codes, one per game type.
- **REQ-ROOM-02:** On first entry, `enterGameRoom` creates the Firestore document. On subsequent entries, it re-enters the existing room, updating the `players` map and resetting the TTL.
- **REQ-ROOM-03:** Room documents expire 7 days after last activity (`expiresAt` field, Firestore TTL). This is reset to 7 days from now on every `enterGameRoom` call.
- **REQ-ROOM-04:** If a room is expired and one player enters, they become the new host and the room is created fresh (scores reset).
- **REQ-ROOM-05:** A room contains at most 2 players. A third player cannot join.
- **REQ-ROOM-06:** The `hostUid` field identifies which player is the host. If the host is replaced (e.g., after expiry), the new `hostUid` is written atomically.

### 5.2 Player Presence

- **REQ-ROOM-07:** Each player's `connected` boolean shall be set to `true` on entering a Table screen and `false` on leaving (via `markConnected`).
- **REQ-ROOM-08:** AppState `change` events shall update `connected` when the app moves between active and background states.

### 5.3 Next-Round Signal

- **REQ-ROOM-09:** Either player may request the next hand/round by calling `requestNextRound`, which writes `nextRoundReady: true` to the room document.
- **REQ-ROOM-10:** The host's device watches for `nextRoundReady === true` and automatically calls the deal function. This pattern is necessary because only the host has permission to write to both players' private hands.
- **REQ-ROOM-11:** The host's "Next hand/round" button calls the deal function directly (no signal needed). The guest's button calls `requestNextRound`.
- **REQ-ROOM-12:** `nextRoundReady` is reset to `false` at the start of every new deal.

---

## 6. Game: Phase 10

### 6.1 Overview

Phase 10 is a 10-phase card game. Each player must complete a specific phase (meld) each hand before they can advance. The first player to complete all 10 phases wins.

### 6.2 Deck

- Standard 108-card Phase 10 deck: 96 numbered cards (values 1–12, 4 colors × 2 each × 12 values), 8 wild cards, 4 skip cards.
- Card colors: red, blue, green, yellow.

### 6.3 Card Scoring (loser's hand penalty)

| Card | Points |
|------|--------|
| Numbered 1–9 | 5 |
| Numbered 10–12 | 10 |
| Skip | 15 |
| Wild | 25 |

### 6.4 Phases (Classic Variant)

| Phase | Requirement |
|-------|-------------|
| 1 | 2 sets of 3 |
| 2 | 1 set of 3 + 1 run of 4 |
| 3 | 1 set of 4 + 1 run of 4 |
| 4 | 1 run of 7 |
| 5 | 1 run of 8 |
| 6 | 1 run of 9 |
| 7 | 2 sets of 4 |
| 8 | 1 color group of 7 |
| 9 | 1 set of 5 + 1 set of 2 |
| 10 | 1 set of 5 + 1 set of 3 |

### 6.5 Variants

15 additional variants are available beyond Classic, selectable at room creation. Each variant replaces the 10-phase progression with a different set of requirements using the full meld type vocabulary (sets, runs, color groups, parity sets, color runs, color parities).

### 6.6 Meld Types

| Type | Validity Rule |
|------|--------------|
| **Set** | All naturals same value (1–12); ≥1 natural; no skips |
| **Run** | Naturals form consecutive values with no duplicates; fits within a consecutive window of length N within 1–13; ≥1 natural; no skips |
| **Color Group** | All naturals same color; ≥1 natural; no skips |
| **Parity Set** | All naturals same parity (all even or all odd); ≥1 natural; no skips |
| **Color Run** | Consecutive values + all same color; ≥1 natural; no skips |
| **Color Parity** | Same parity AND same color; ≥1 natural; no skips |

Wild cards substitute freely in any meld type. Groups of all wilds are not permitted.

### 6.7 Hit (Extension) Rules

After laying a phase, a player may hit any laid group (their own or opponent's) by adding cards one at a time:

| Group Type | Valid Hit |
|------------|-----------|
| Set | Card value matches existing naturals (or all-wild group) |
| Color Group | Card color matches existing naturals |
| Parity Set | Card parity matches existing naturals |
| Color Parity | Card parity AND color both match existing naturals |
| Run / Color Run | Card extends the run from the low end (start−1) or high end (end+1); color run also requires color match |
| Any | Wild card always valid |
| Any | Skip card never valid |

### 6.8 Skip Cards

- A skipped player loses their entire next turn (cannot draw, cannot play).
- `skippedNext` tracks which players are skipped; cleared at the start of their turn.

### 6.9 Turn Flow

1. Draw one card (from deck or top of discard).
2. Optionally lay phase (if not yet laid this game).
3. Optionally hit any laid groups.
4. Discard one card to end turn.

### 6.10 Going Out

- A player goes out by discarding their last card.
- All remaining players score penalty points for cards in their hand.
- Players who completed their current phase advance to the next phase.
- Players who did not complete their phase stay on the same phase.

### 6.11 Winning

- First player to complete phase 10 and go out wins.

---

## 7. Game: Trash (Garbage)

### 7.1 Overview

Each player has a row of face-down slots (starting at 10). On your turn you draw or pick up the discard and place it in its corresponding slot, flipping it face-up. When all your slots are face-up, you win the round. The winner shrinks their slot count by 1 for the next round. The first player to reduce their count to 0 wins the game.

### 7.2 Deck

- Single standard 52-card deck (ranks 1–13, one suit per card). No jokers.

### 7.3 Card Mapping

| Rank | Behavior |
|------|----------|
| Ace (1) | Goes in slot 0 (labeled 'A') |
| 2–10 | Goes in slot rank−1 (labeled '2'–'10') |
| Jack (11) | Wild — goes in any empty face-down slot |
| Queen (12) | End-turn card — cannot be placed; must be discarded |
| King (13) | End-turn card — cannot be placed; must be discarded |

### 7.4 Slot Rules

- A slot can only be filled if it is currently face-down (null in `faceUp` array).
- Slot indices are 0-based; valid range is `[0, roundSize)`.
- Placing a card flips the slot face-up.
- A Jack can be placed in any valid empty slot.

### 7.5 Turn Flow

1. Draw from deck or pick up top of discard (player holds the card).
2. If card is placeable (not Q/K and a valid slot exists): place it; the slot it displaced (if any) becomes the new held card — continue placing until a Q/K or an already-filled slot is hit.
3. Discard held card to end turn.

### 7.6 Round End

- Round ends when all of a player's slots are face-up.
- That player wins the round.

### 7.7 Round Progression

- Winner's slot count for the next round: `max(current − 1, 0)`.
- Loser's slot count is unchanged.
- Each player independently tracks their slot count (`roundSizes` map).

### 7.8 Game End

- Game ends when any player's slot count reaches 0 (they would play a 0-slot round).
- That player is the overall winner.
- `seriesWins` is incremented for the overall winner.

---

## 8. Game: 3 to 13

### 8.1 Overview

3 to 13 is a Rummy-style game played over exactly 11 hands. Hand N deals N+2 cards per player. The wild rank shifts each hand. Each hand, players draw and discard, building toward laying melds. The first to lay all melds and discard goes out; the opponent scores penalty points for cards remaining in hand. Lowest cumulative score after 11 hands wins.

### 8.2 Deck

- Two standard 52-card decks (104 cards total). Duplicate cards are valid.

### 8.3 Hand Schedule

| Hand | Cards Dealt | Wild Rank |
|------|------------|-----------|
| 1 | 3 | 3 (Threes) |
| 2 | 4 | 4 (Fours) |
| 3 | 5 | 5 (Fives) |
| 4 | 6 | 6 (Sixes) |
| 5 | 7 | 7 (Sevens) |
| 6 | 8 | 8 (Eights) |
| 7 | 9 | 9 (Nines) |
| 8 | 10 | 10 (Tens) |
| 9 | 11 | 11 (Jacks) |
| 10 | 12 | 12 (Queens) |
| 11 | 13 | 13 (Kings) |

### 8.4 Meld Types

| Type | Validity Rule |
|------|--------------|
| **Set** | ≥3 cards, all naturals same rank (suits may repeat from double deck); ≥1 natural |
| **Run** | ≥3 cards, same suit, consecutive ranks (Ace low only, no wrap-around); ≥1 natural |

Wild cards (rank = wild rank for the current hand) substitute freely. Every meld must include at least one natural (non-wild) card.

### 8.5 Run Sorting

Runs are canonically sorted by placing naturals in their value slots, then declared-wild positions, then filling remaining positions with undeclared wilds left-to-right. Ace is always rank 1 (low).

### 8.6 Laying Restriction

- A player may only lay melds once per hand.
- After laying, the player may only **extend their own existing melds**. They cannot form new melds or hit the opponent's melds.
- `thisTurnLaid` tracks cards laid this turn (for undo purposes); cleared after discard.

### 8.7 Extending Melds

| Extension Type | Valid Card |
|----------------|-----------|
| Set extension | Wild, or natural with same rank as the set |
| Run extension (low end) | Wild, or natural with suit match and value = run start − 1 |
| Run extension (high end) | Wild, or natural with suit match and value = run end + 1 |

### 8.8 Scoring (per hand, loser only)

| Card | Points |
|------|--------|
| Ace | 1 |
| 2–10 | Face value |
| J, Q, K | 10 |
| Wild (rank = wildRank) | Wild rank value (e.g., wild = 3 in hand 1) |

The player who went out scores 0 for that hand. The opponent scores the sum of their remaining hand cards.

### 8.9 Turn Flow

1. Draw from deck or take top of discard (`hasDrawn` set to true).
2. Optionally lay melds (if not yet laid this hand).
3. Optionally extend own laid melds.
4. Discard one card (`hasDrawn` set to false, turn passes).

### 8.10 Going Out

- A player goes out when they discard their last card (hand is empty after discard).
- Before going out, the player must have laid all their cards into melds.
- The opponent receives one "last chance" turn before scoring.

### 8.11 Last-Chance Turn

- After a player goes out, the opponent gets exactly one more full turn (draw, optional lay/extend, discard).
- `hand.wentOut` records the UID of the player who went out.
- After the opponent discards, status transitions to `handOver`.

### 8.12 First Player Each Hand

- Hand 1: randomly chosen.
- Hands 2–11: the player who did **not** go out (the loser) goes first.

### 8.13 Winning

- After 11 hands, the player with the **lowest** cumulative score wins.
- `seriesWins` is incremented for the winner.

---

## 9. Shared In-Game Features

### 9.1 Take-Back

- **REQ-TB-01:** If the take-back setting is enabled, a 3-second countdown button shall appear after drawing (deck or discard) or discarding.
- **REQ-TB-02:** The button shall be displayed as a floating overlay above the action bar, using `position: absolute`. It shall not cause any other UI element to shift position.
- **REQ-TB-03:** The button displays: `↩  Take back  ·  Ns` where N counts down from 3 to 0.
- **REQ-TB-04:** Tapping the button before expiry calls the appropriate undo action (`undrawFromDeck`, `undrawFromDiscard`, or `undiscard`).
- **REQ-TB-05:** The button expires automatically when `Date.now() >= expiresAt` (3000 ms after the action).
- **REQ-TB-06:** A **discard** take-back is automatically cancelled when the opponent has drawn (i.e., `h.turn === opponentUid && h.hasDrawn` in Phase 10/3-to-13, or `h.turn === opponentUid && h.held !== null` in Trash). This prevents undoing after the opponent has committed to a move.
- **REQ-TB-07:** A **draw** take-back is not auto-cancelled by room-state changes; it only expires via the timer or when the player performs another action. (Rationale: after drawing, the opponent cannot act until you discard; stale Firestore state would cause false cancellation.)
- **REQ-TB-08:** Take-back is not available in the middle of a laying sequence or other multi-step action.

### 9.2 Emoji Reactions

- **REQ-REACT-01:** A row of 4 reaction buttons shall be displayed during gameplay: 👏 😡 😭 🖕.
- **REQ-REACT-02:** Tapping a reaction writes a `lastReaction` object to the room document: `{ id, emoji, by, at }`. Each tap overwrites the previous with a fresh unique ID.
- **REQ-REACT-03:** The recipient's device animates the emoji floating upward from the right side of the screen (rises ~62% of screen height, horizontal sinusoidal drift ±24px, duration 2200ms, scale 0.6→1.15, fade in/out).
- **REQ-REACT-04:** Each unique reaction ID is displayed only once per recipient (deduplication via `seenId`). The sender sees the reaction locally immediately; remote reactions are spawned on `lastReaction` change.

### 9.3 In-Game Settings (Gear Icon)

- **REQ-INGSETTINGS-01:** A gear icon shall be displayed in the game's top bar.
- **REQ-INGSETTINGS-02:** Tapping opens a modal showing current series wins for both players.
- **REQ-INGSETTINGS-03:** If the series win gap is ≥ 5, a warning is displayed suggesting a reset.
- **REQ-INGSETTINGS-04:** A "Reset series wins" button resets both players' `seriesWins` to 0 atomically.
- **REQ-INGSETTINGS-05:** Success state shows "Wins reset ✓".

### 9.4 Hand/Round Result Modal

- **REQ-RESULT-01:** After each hand or round ends and scores are finalized, a modal is displayed to both players summarising the outcome.
- **REQ-RESULT-02:** The modal shall display the top card of the draw pile (`room.hand.deck[0]`) to reveal what card was on top of the deck at the end.
- **REQ-RESULT-03:** A "Next hand" / "Next round" button is shown to both players. The host's button calls the deal function directly; the guest's button calls `requestNextRound`.

### 9.5 Compact Mode

- **REQ-COMPACT-01:** When compact mode is enabled (via Settings), the game table shall use tighter vertical spacing to accommodate smaller screens or split-screen use.
- **REQ-COMPACT-02:** Cards remain full-size in compact mode; only layout spacing is adjusted.
- **REQ-COMPACT-03:** The take-back overlay shall function correctly in both normal and compact mode (positioned relative to measured action bar height).

### 9.6 Card Hand Ordering

- **REQ-HAND-01:** Players may reorder their hand by dragging cards.
- **REQ-HAND-02:** Players may sort their hand by rank or by suit using sort buttons.
- **REQ-HAND-03:** Hand order is persisted to the player's `privateHands` Firestore document so it survives leaving and re-entering the room.

### 9.7 Keep Awake

- **REQ-AWAKE-01:** The screen shall not auto-lock while a game table is active (`useKeepAwake`).

---

## 10. Settings & Preferences

All settings are stored in AsyncStorage on-device.

| Setting | Key | Default | Scope |
|---------|-----|---------|-------|
| Nickname | `sw.nickname` | `''` | Device |
| Last room code | `sw.lastRoom` | `null` | Device |
| Compact mode | `sw.compactMode` | `false` | Device |
| Take-back enabled | `sw.takeBack.<uid>` | `false` | Per Firebase UID |

- **REQ-SETTINGS-01:** Settings are hydrated once on app startup before the UI is shown (`hydrated` flag).
- **REQ-SETTINGS-02:** The take-back setting is loaded after Firebase auth resolves so the correct UID is known.
- **REQ-SETTINGS-03:** The Settings screen exposes toggles for: take-back enable/disable; compact layout enable/disable.
- **REQ-SETTINGS-04:** Compact mode toggle is available only in the Settings screen (not on the Welcome screen).

---

## 11. Push Notifications

- **REQ-PUSH-01:** On entering a game room on a device that supports push (EAS dev build), the player's Expo push token shall be registered and stored in `room.players[uid].pushToken`.
- **REQ-PUSH-02:** Push is not available on Expo Go (iOS), the simulator, or web.
- **REQ-PUSH-03:** A Firebase Cloud Function (`onTurnChange`) fires on Firestore writes to `rooms/{code}` where the turn field changes.
- **REQ-PUSH-04:** The function sends a push notification to the player whose turn it is, **only if** their `connected` field is `false` (app is backgrounded). Active players are not notified.
- **REQ-PUSH-05:** Notification payload includes: title "Your turn", body "{game name} · Room {code}".
- **REQ-PUSH-06:** Tapping a notification navigates the recipient to the correct Table screen.

---

## 12. Security

### 12.1 Firestore Security Rules

- **REQ-SEC-01:** All Firestore operations require a signed-in Firebase user (`request.auth != null`).
- **REQ-SEC-02:** Any signed-in user may **read** any room document (codes are shared explicitly).
- **REQ-SEC-03:** Only a member of the room (`request.auth.uid in players`) may **update** the room document. A non-member may perform exactly one update: the join operation that adds themselves as a player (max 2 players).
- **REQ-SEC-04:** Only the host may **delete** a room.
- **REQ-SEC-05:** `privateHands/{uid}` documents are readable only by their owner, or by the host when the game is in `handOver` or `gameOver` status (for scoring). They are writable by the owner or the host.
- **REQ-SEC-06:** `privateSlots/{uid}` documents (Trash face-down cards) are readable only by their owner. They are writable by the owner or the host.
- **REQ-SEC-07:** The `isHost` security rule function uses `getAfter()` (post-commit room state) rather than `get()` to allow atomic transactions that write both the room document and private hand documents simultaneously.

### 12.2 Client-Side Assertions

- **REQ-SEC-08:** All server-side Firestore transactions shall validate game state (status, turn ownership, card existence) before committing. Invalid operations throw errors that are surfaced to the user.

---

## 13. Data Models

### 13.1 Room Document (`/rooms/{code}`)

| Field | Type | Description |
|-------|------|-------------|
| `createdAt` | Timestamp | Server-side creation time |
| `hostUid` | string | Firebase UID of the host |
| `players` | `Record<uid, RoomPlayer>` | Map of up to 2 players |
| `status` | RoomStatus | Current game state |
| `gameType` | GameType? | `'phase10'` \| `'trash'` \| `'three-thirteen'` |
| `phase10Variant` | string? | Variant ID if Phase 10 |
| `nextRoundReady` | boolean? | Signal flag: guest is ready for next hand/round |
| `lastReaction` | Reaction? | Most recent emoji reaction |
| `hand` | HandState? | Current hand state (game-specific shape) |
| `handResult` | HandResult? | Scoring result for completed hand |
| `progress` | `Record<uid, Progress>?` | Cumulative scores/phases per player |
| `seriesWins` | `Record<uid, number>?` | All-time series wins per player |
| `lastWinner` | string? | UID of last game winner |
| `preset` | Preset? | Recovery preset for broken games |
| `expiresAt` | Timestamp | Firestore TTL — 7 days from last activity |

**RoomStatus:** `'waiting'` | `'playing'` | `'handOver'` | `'roundOver'` | `'gameOver'`

**RoomPlayer:**
```
{ nickname: string, connected: boolean, seat: 0|1, pushToken?: string }
```

**Reaction:**
```
{ id: string, emoji: string, by: string, at: number }
```

### 13.2 Private Hands (`/rooms/{code}/privateHands/{uid}`)

| Field | Type | Description |
|-------|------|-------------|
| `cards` | Card[] | Player's current hand (Phase 10 or 3-to-13) |

Hand order (the display sequence) is stored in the `cards` array itself; reordering writes the array back.

### 13.3 Private Slots (`/rooms/{code}/privateSlots/{uid}`)

| Field | Type | Description |
|-------|------|-------------|
| `slots` | (StdCard\|null)[] | Trash face-down cards. null = already revealed |

### 13.4 Phase 10 Hand State

| Field | Type | Description |
|-------|------|-------------|
| `handNumber` | number | Current hand number |
| `deck` | Card[] | Remaining draw pile |
| `discard` | Card[] | Discard pile (top = last element) |
| `turn` | string | UID of player whose turn it is |
| `hasDrawn` | boolean | Whether current player has drawn this turn |
| `laid` | `Record<uid, LaidGroup[]>` | Laid melds per player |
| `skippedNext` | `Record<uid, boolean>` | Players who will be skipped |
| `counts` | `Record<uid, number>` | Hand size per player |
| `wentOut` | string? | UID of first player to go out |
| `topDiscardIsFresh` | boolean | True after a discard (reveals second card) |

### 13.5 Trash Hand State

| Field | Type | Description |
|-------|------|-------------|
| `roundNumber` | number | Current round number |
| `roundSizes` | `Record<uid, number>` | Current slot count per player |
| `faceUp` | `Record<uid, (StdCard\|null)[]>` | Revealed slots per player |
| `deck` | StdCard[] | Draw pile |
| `discard` | StdCard[] | Discard pile |
| `turn` | string | UID of current player |
| `held` | StdCard? | Card currently held (drawn, not yet placed) |

### 13.6 3-to-13 Hand State

| Field | Type | Description |
|-------|------|-------------|
| `handNumber` | 1–11 | Current hand |
| `wildRank` | number | Rank that acts as wild this hand |
| `deck` | StdCard[] | Draw pile |
| `discard` | StdCard[] | Discard pile |
| `turn` | string | UID of current player |
| `hasDrawn` | boolean | Whether current player has drawn |
| `laid` | `Record<uid, LaidGroup[]>` | Laid melds per player |
| `counts` | `Record<uid, number>` | Hand size per player |
| `wentOut` | string? | UID of player who discarded last card |
| `topDiscardIsFresh` | boolean | True after discard |
| `thisTurnLaid` | `Record<uid, string[]>` | Card IDs laid this turn (for undo) |

---

## 14. Non-Functional Requirements

### 14.1 Performance

- **REQ-PERF-01:** Real-time Firestore subscriptions shall deliver opponent moves within 2 seconds under normal network conditions.
- **REQ-PERF-02:** Local UI interactions (card taps, drag, sort) shall respond within 100 ms.
- **REQ-PERF-03:** Firestore transactions shall include optimistic local UI where possible to reduce perceived latency.

### 14.2 Availability

- **REQ-AVAIL-01:** The app shall function on iOS and Android.
- **REQ-AVAIL-02:** The app shall handle offline/reconnect gracefully: Firestore's local persistence caches the last known state; writes are queued until connectivity is restored.

### 14.3 Usability

- **REQ-UX-01:** The app shall respect system safe-area insets (notch, home bar) using `SafeAreaView` on all screens.
- **REQ-UX-02:** Errors from Firestore operations shall be displayed inline near the action that triggered them, not in a blocking modal.
- **REQ-UX-03:** Busy (in-flight) states shall disable relevant interactive elements to prevent duplicate submissions.
- **REQ-UX-04:** Layout shall adapt to both normal and compact mode without requiring a restart.

### 14.4 Cost

- **REQ-COST-01:** Firebase usage targets the Blaze free-tier allowance for a two-player hobby app. Estimated: pennies per month.
- **REQ-COST-02:** Push notifications use Expo Push Service (FCM on Android, APNs on iOS) — no additional billing.

### 14.5 Platform Constraints

- **REQ-PLAT-01:** Push notifications require an EAS development or production build. They are not available in Expo Go on iOS.
- **REQ-PLAT-02:** The Cloud Function for push notifications requires the Firebase project to be on the Blaze (pay-as-you-go) plan.
- **REQ-PLAT-03:** Google Sign-In requires a configured OAuth client ID (optional feature).
