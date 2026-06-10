#!/usr/bin/env node
// One-off migration to move a player's data from an orphaned anonymous uid to
// a new (typically Google-linked) uid on a single room. Used when the
// client-side linkWithCredential fell back to signInWithCredential and the
// signed-in user ended up with a different uid than the anonymous session that
// owned the game state.
//
// Usage (from the repo root):
//
//   npm --prefix functions install            # once, to get firebase-admin
//   node tools/migrate-uid.mjs \
//     --old PTTqDaS6mkYVn1o1ipn7HtwDOUy2 \
//     --new ev3y5mE8wWgEQ9xdPhOWAPdfjqt1 \
//     --room 3T13 \
//     --service-account /path/to/serviceAccountKey.json
//
// Get the service-account key from Firebase Console → Project Settings →
// Service Accounts → Generate new private key. Add --dry-run to see what would
// change without writing.

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// firebase-admin lives in functions/node_modules — it isn't a root dep.
const require = createRequire(path.join(__dirname, '../functions/package.json'));
const admin = require('firebase-admin');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--old') out.old = argv[++i];
    else if (a === '--new') out.new = argv[++i];
    else if (a === '--room') out.room = argv[++i];
    else if (a === '--service-account') out.sa = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.old || !args.new || !args.room) {
  console.error(
    'Usage: node tools/migrate-uid.mjs --old OLD_UID --new NEW_UID --room ROOM_CODE [--service-account PATH] [--dry-run]',
  );
  process.exit(1);
}
if (args.old === args.new) {
  console.error('--old and --new are the same; nothing to do.');
  process.exit(1);
}

if (args.sa) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(args.sa);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

// Recursively rebuild a value, swapping OLD with NEW wherever it appears as
// either an object key or a string value. Firestore Timestamps and other
// non-plain objects are returned as-is so they round-trip correctly.
function rewrite(value, OLD, NEW) {
  if (typeof value === 'string') {
    return value === OLD ? NEW : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => rewrite(v, OLD, NEW));
  }
  if (value && typeof value === 'object') {
    // Firestore Timestamp and similar SDK objects — leave them alone.
    if (value.constructor && value.constructor.name !== 'Object') {
      return value;
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k === OLD ? NEW : k] = rewrite(v, OLD, NEW);
    }
    return out;
  }
  return value;
}

async function moveDoc(srcRef, dstRef, label) {
  const snap = await srcRef.get();
  if (!snap.exists) {
    console.log(`  ${label}: source ${srcRef.path} not found, skipping`);
    return;
  }
  if (args.dryRun) {
    console.log(`  ${label}: would copy ${srcRef.path} → ${dstRef.path} and delete source`);
    return;
  }
  const dstSnap = await dstRef.get();
  if (dstSnap.exists) {
    console.warn(`  ${label}: destination ${dstRef.path} already exists — overwriting`);
  }
  await dstRef.set(snap.data());
  await srcRef.delete();
  console.log(`  ${label}: copied ${srcRef.path} → ${dstRef.path} and deleted source`);
}

async function main() {
  const { old: OLD, new: NEW, room: ROOM } = args;
  console.log(
    `Migrating ${OLD} → ${NEW} on room ${ROOM}${args.dryRun ? ' (dry run)' : ''}`,
  );

  const roomRef = db.doc(`rooms/${ROOM}`);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    console.error(`Room ${ROOM} not found.`);
    process.exit(1);
  }

  const before = roomSnap.data();
  const after = rewrite(before, OLD, NEW);
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  if (!changed) {
    console.log(`  room doc: no references to ${OLD}, leaving untouched`);
  } else if (args.dryRun) {
    console.log(`  room doc: would rewrite (refs to ${OLD} replaced with ${NEW})`);
  } else {
    await roomRef.set(after);
    console.log(`  room doc: rewrote (refs to ${OLD} replaced with ${NEW})`);
  }

  await moveDoc(
    db.doc(`rooms/${ROOM}/privateHands/${OLD}`),
    db.doc(`rooms/${ROOM}/privateHands/${NEW}`),
    'privateHands',
  );
  await moveDoc(
    db.doc(`rooms/${ROOM}/privateSlots/${OLD}`),
    db.doc(`rooms/${ROOM}/privateSlots/${NEW}`),
    'privateSlots',
  );

  console.log('Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
