# FiFA 2026 Online Multiplayer — Firestore Security Specification

## 1. Entities & Collections
1. `/players/{uid}` (`PlayerProfile`)
   - Stores non-PII public stats (`uid`, `displayName`, `matchesPlayed`, `wins`, `draws`, `losses`, `goalsScored`, `createdAt`, `updatedAt`).
   - Never stores email, phone, or private metadata.
2. `/rooms/{roomCode}` (`OnlineRoom`)
   - Keyed by a 5-character uppercase alphanumeric room code (`^[A-Z0-9]{5}$`, e.g., `A7K92`).
   - Tracks host/guest identity, distinct club selections, formations, readiness, lifecycle status (`waiting`, `playing`, `finished`), and final score/winner.

## 2. Authentication & Identity Policy
- All operations require `request.auth != null`.
- Authenticated users must have a verified email (`request.auth.token.email_verified == true`, enforced for Google Sign-In). Anonymous guest sessions are disabled.
- Default catch-all denies every unspecified path (`allow read, write: if false;`).

## 3. Access Control & Action Matrix

### `/players/{uid}`
- `get`: Allowed for authenticated users (only by exact UID).
- `list`: Denied (prevents scraping/enumerating all players).
- `create`: Owner only (`request.auth.uid == uid`), strict schema (`hasAll` + `hasOnly`), counters initialized to `0`, `createdAt == request.time`, `updatedAt == request.time`.
- `update`: Owner only (`request.auth.uid == uid`), immutable `uid` & `createdAt`, monotonic stats (each match increment bounded to `+1` match, `+0..30` goals, `matchesPlayed == wins + draws + losses`), `updatedAt == request.time`.
- `delete`: Denied (preserves player history integrity).

### `/rooms/{roomCode}`
- `get`: Allowed if authenticated AND (`resource == null || existing().hostUid == request.auth.uid || existing().guestUid == request.auth.uid || existing().status == 'waiting'`). Allows checking whether a newly generated 5-character room code is free and joining a known waiting room code while hiding active/finished matches from outsiders.
- `list`: Allowed ONLY for rooms where the caller is a participant (`resource.data.hostUid == request.auth.uid || resource.data.guestUid == request.auth.uid`). Never allows blanket room listing.
- `create`: Authenticated user becomes host (`hostUid == request.auth.uid`), `roomCode == roomCode` doc ID matching `^[A-Z0-9]{5}$`, `guestUid == ''`, `guestName == ''`, `guestTeamId == ''`, `guestFormation == '4-3-3'`, `guestReady == false`, `status == 'waiting'`, `homeScore == 0`, `awayScore == 0`, `winnerUid == ''`, `createdAt == request.time`, `updatedAt == request.time`.
- `update`: Strict schema validation (`isValidRoom(incoming())`) + immutable `roomCode`, `hostUid`, `halfDurationSeconds`, `createdAt` + terminal lock (`existing().status != 'finished'`) + `updatedAt == request.time` + exactly one action branch:
  1. **Guest Join**: `existing().status == 'waiting'`, `existing().guestUid == ''`, caller `!= hostUid`, sets `guestUid == request.auth.uid`, `guestTeamId != existing().hostTeamId`, modifying ONLY `['guestUid', 'guestName', 'guestTeamId', 'guestFormation', 'guestReady', 'updatedAt']`.
  2. **Host Lobby Update**: Caller `== hostUid`, `existing().status == 'waiting'`, modifying ONLY `['hostName', 'hostTeamId', 'hostFormation', 'hostReady', 'updatedAt']`, and if guest already joined, `hostTeamId != guestTeamId`.
  3. **Guest Lobby Update**: Caller `== guestUid`, `existing().status == 'waiting'`, modifying ONLY `['guestName', 'guestTeamId', 'guestFormation', 'guestReady', 'updatedAt']`, and `guestTeamId != hostTeamId`.
  4. **Match Start**: Caller is host or guest, `existing().status == 'waiting'`, `existing().guestUid != ''`, transitions `status` to `'playing'`, modifying ONLY `['status', 'updatedAt']`.
  5. **Match Finish (Terminal Lock)**: Caller is host or guest, `existing().status == 'playing'`, transitions `status` to `'finished'`, modifying ONLY `['status', 'homeScore', 'awayScore', 'winnerUid', 'updatedAt']`, enforcing `0 <= homeScore <= 30`, `0 <= awayScore <= 30`, and `winnerUid` strictly matches the score outcome (`hostUid`, `guestUid`, or `''` on draw).
- `delete`: Host only while `existing().status == 'waiting'`. Active or finished matches cannot be deleted.

## 4. Real-Time Anti-Cheat Match Authority & WebSocket Token Verification
- Every WebSocket connection on `/ws` must authenticate with a valid Firebase ID Token (`auth` message verified server-side via Firebase Admin `verifyIdToken` with `email_verified == true`) before executing `room:create`, `room:join`, `room:reconnect`, or any match/room command. The server derives the player's `uid` exclusively from the verified token and never trusts client-supplied UIDs.
- Real-time match simulation (physics, goals, clock, score) runs primarily in the server-authoritative `MatchEngine` over WebSockets (`/ws`). Clients only send `InputSnapshot` actions and cannot directly inject goals, scores, or clock changes.
- When WebSocket instances are separated across cloud replicas or unavailable, `/rooms/{roomCode}/live/{channel}` provides a participant-only Firestore real-time relay: `get` is limited to `hostUid`/`guestUid`, `list` and `delete` are denied, `live/state` is writable only by `hostUid`, `live/guestInput` is writable only by `guestUid`, and `live/rematch` is writable only by verified participants with strict schema validation and `updatedAt == request.time`.
