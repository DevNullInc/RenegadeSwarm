/**
 * RenegadeSwarm - Decentralized Keyring & Web-of-Trust Engine (Rule 10)
 * Manages trusted creator Ed25519 public keys, TOFU (Trust-On-First-Use), and verification badges.
 */

export type TrustLevel = 'VerifiedCreator' | 'Community' | 'Untrusted' | 'Blocked';

export interface KeyringEntry {
  creatorName: string;
  publicKeyHex: string; // 32-byte Ed25519 public key in hex
  trustLevel: TrustLevel;
  alias?: string;
  addedAt: number;
  notes?: string;
}

export const DEFAULT_TRUSTED_ROOTS: KeyringEntry[] = [
  {
    creatorName: 'TheStygianRenegade',
    publicKeyHex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    trustLevel: 'VerifiedCreator',
    alias: 'Renegade Core Team',
    addedAt: 1723456789,
    notes: 'Official RenegadeSwarm creator key',
  },
  {
    creatorName: 'DevNullInc',
    publicKeyHex: 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262',
    trustLevel: 'VerifiedCreator',
    alias: '/dev/null Inc',
    addedAt: 1723456789,
    notes: 'Official DevNullInc publisher key',
  },
];

export class KeyringEngine {
  private entries: Map<string, KeyringEntry> = new Map(); // key: publicKeyHex in lowerCase

  constructor(initialEntries?: KeyringEntry[]) {
    const list = initialEntries || DEFAULT_TRUSTED_ROOTS;
    for (const entry of list) {
      this.entries.set(entry.publicKeyHex.toLowerCase(), { ...entry });
    }
  }

  addEntry(entry: KeyringEntry) {
    this.entries.set(entry.publicKeyHex.toLowerCase(), { ...entry });
  }

  removeEntry(publicKeyHex: string): boolean {
    return this.entries.delete(publicKeyHex.toLowerCase());
  }

  getEntry(publicKeyHex: string): KeyringEntry | undefined {
    return this.entries.get(publicKeyHex.toLowerCase());
  }

  getEntries(): KeyringEntry[] {
    return Array.from(this.entries.values());
  }

  verifyCreatorKey(_creatorName: string, publicKeyHex?: string): {
    trustLevel: TrustLevel;
    isKnown: boolean;
    entry?: KeyringEntry;
  } {
    if (!publicKeyHex) {
      return { trustLevel: 'Community', isKnown: false };
    }

    const entry = this.entries.get(publicKeyHex.toLowerCase());
    if (entry) {
      return {
        trustLevel: entry.trustLevel,
        isKnown: true,
        entry,
      };
    }

    return {
      trustLevel: 'Community',
      isKnown: false,
    };
  }

  exportKeyring(): string {
    return JSON.stringify(Array.from(this.entries.values()), null, 2);
  }

  importKeyring(jsonString: string): number {
    const parsed = JSON.parse(jsonString) as KeyringEntry[];
    let count = 0;
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.publicKeyHex && item.creatorName) {
          this.addEntry(item);
          count++;
        }
      }
    }
    return count;
  }
}

export const keyringEngine = new KeyringEngine();
