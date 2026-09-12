/**
 * RenegadeSwarm - Decentralized AI Model Distribution Network
 * Copyright (C) 2026 DevNullInc & The RenegadeSwarm Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect } from 'vitest';
import { KeyringEngine } from '../src/protocol/keyring';

describe('Decentralized Keyring & Web-of-Trust Engine (Rule 10)', () => {
  it('should initialize with certified default trusted creator roots', () => {
    const keyring = new KeyringEngine();
    const entries = keyring.getEntries();
    expect(entries.length).toBeGreaterThanOrEqual(1);

    const renegade = entries.find((e) => e.creatorName === 'TheStygianRenegade');
    expect(renegade).toBeDefined();
    expect(renegade?.publicKeyHex).toBe('70fb7e8a57bbec5ffba1d16e317fb915ddeead2a5f3d8853ffb21759155936b7');
    expect(renegade?.trustLevel).toBe('VerifiedCreator');
  });

  it('should verify known creator public keys and mark unknown ones as Community', () => {
    const keyring = new KeyringEngine();
    const renegadeKey = '70fb7e8a57bbec5ffba1d16e317fb915ddeead2a5f3d8853ffb21759155936b7';

    const verification = keyring.verifyCreatorKey('TheStygianRenegade', renegadeKey);
    expect(verification.isKnown).toBe(true);
    expect(verification.trustLevel).toBe('VerifiedCreator');

    const unknownKey = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    const unknownVerification = keyring.verifyCreatorKey('NewCreator', unknownKey);
    expect(unknownVerification.isKnown).toBe(false);
    expect(unknownVerification.trustLevel).toBe('Community');
  });

  it('should support exporting and importing keyring entries', () => {
    const keyringA = new KeyringEngine([]);
    keyringA.addEntry({
      creatorName: 'CustomArtist',
      publicKeyHex: '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff',
      trustLevel: 'VerifiedCreator',
      addedAt: Date.now(),
    });

    const exportedJson = keyringA.exportKeyring();
    expect(exportedJson).toBeTypeOf('string');

    const keyringB = new KeyringEngine([]);
    const importedCount = keyringB.importKeyring(exportedJson);
    expect(importedCount).toBe(1);

    const importedEntry = keyringB.getEntry('1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff');
    expect(importedEntry?.creatorName).toBe('CustomArtist');
  });
});
