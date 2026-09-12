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
    publicKeyHex: '70fb7e8a57bbec5ffba1d16e317fb915ddeead2a5f3d8853ffb21759155936b7',
    trustLevel: 'VerifiedCreator',
    alias: 'TheStygianRenegade / /dev/null Inc',
    addedAt: 1723456789,
    notes: 'Official RenegadeSwarm creator key',
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
