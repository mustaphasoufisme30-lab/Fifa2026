import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { TEAMS } from './src/teams/teams';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const rulesSource = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));

describe('Firestore Security Rules & Blueprint Integrity', () => {
  it('enforces rules_version 2 and default-deny catch-all', () => {
    assert.match(rulesSource, /rules_version\s*=\s*'2'/);
    assert.match(rulesSource, /match\s+\/\{document=\*\*\}\s*\{\s*allow read, write:\s*if false;/);
  });

  it('whitelists every real club ID defined in TEAMS', () => {
    for (const team of TEAMS) {
      assert.ok(
        rulesSource.includes(`'${team.id}'`),
        `Team ID ${team.id} must be whitelisted in firestore.rules`,
      );
    }
  });

  it('blocks blanket listing on /players and restricts /rooms listing to participants', () => {
    assert.match(rulesSource, /match \/players\/\{uid\}[\s\S]*?allow list:\s*if false;/);
    assert.match(
      rulesSource,
      /match \/rooms\/\{roomCode\}[\s\S]*?allow list:\s*if isSignedIn\(\)\s*&&\s*\(resource\.data\.hostUid == request\.auth\.uid \|\|\s*resource\.data\.guestUid == request\.auth\.uid\);/,
    );
  });

  it('enforces verified email auth and allows checking free room codes (resource == null)', () => {
    assert.match(rulesSource, /request\.auth != null && request\.auth\.token\.email_verified == true/);
    assert.match(
      rulesSource,
      /match \/rooms\/\{roomCode\}[\s\S]*?allow get:\s*if isSignedIn\(\)\s*&&\s*\(resource == null \|\|/,
    );
  });

  it('enforces schema validation on both create and update, terminal lock, and timestamp checks', () => {
    assert.match(rulesSource, /existing\(\)\.status != 'finished'/);
    assert.match(rulesSource, /incoming\(\)\.createdAt == request\.time/);
    assert.match(rulesSource, /incoming\(\)\.updatedAt == request\.time/);
    assert.match(rulesSource, /request\.auth\.uid != existing\(\)\.hostUid/);
    assert.match(rulesSource, /incoming\(\)\.guestTeamId != existing\(\)\.hostTeamId/);
    assert.match(rulesSource, /isValidWinnerForScore/);
  });

  it('keeps firebase-blueprint.json schema aligned with firestore.rules keys', () => {
    const roomKeys: string[] = blueprint.entities.OnlineRoom.required;
    for (const key of roomKeys) {
      assert.ok(
        rulesSource.includes(`'${key}'`),
        `OnlineRoom required key ${key} must be validated in firestore.rules`,
      );
    }

    const playerKeys: string[] = blueprint.entities.PlayerProfile.required;
    for (const key of playerKeys) {
      assert.ok(
        rulesSource.includes(`'${key}'`),
        `PlayerProfile required key ${key} must be validated in firestore.rules`,
      );
    }
  });
});
