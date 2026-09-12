import { describe, it, expect } from 'vitest';
import { KeyringEngine } from '../src/protocol/keyring';

describe('Decentralized Keyring & Web-of-Trust Engine (Rule 10)', () => {
  it('should initialize with certified default trusted creator roots', () => {
    const keyring = new KeyringEngine();
    const entries = keyring.getEntries();
    expect(entries.length).toBeGreaterThanOrEqual(2);

    const renegade = entries.find((e) => e.creatorName === 'TheStygianRenegade');
    expect(renegade).toBeDefined();
    expect(renegade?.trustLevel).toBe('VerifiedCreator');
  });

  it('should verify known creator public keys and mark unknown ones as Community', () => {
    const keyring = new KeyringEngine();
    const renegadeKey = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

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
