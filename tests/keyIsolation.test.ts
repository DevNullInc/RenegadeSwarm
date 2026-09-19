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

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import { keyringManager } from '../src/main/engine/keyringManager';

describe('Ed25519 Private Key Isolation & Safe Storage', () => {
  it('getUserIdentity() should return a public DTO without privateKeyHex', () => {
    const identity = keyringManager.getUserIdentity();
    if (identity) {
      expect((identity as any).privateKeyHex).toBeUndefined();
      expect(identity.publicKeyHex).toBeDefined();
      expect(identity.creatorName).toBeDefined();
      expect(identity.createdAt).toBeDefined();
      expect(identity.vaultStatus).toBeDefined();
    }
  });

  it('generateNewIdentity() should return public DTO without exposing privateKeyHex to caller', () => {
    const newIdentity = keyringManager.generateNewIdentity('TestIsolationCreator', true);
    expect((newIdentity as any).privateKeyHex).toBeUndefined();
    expect(newIdentity.publicKeyHex).toBeDefined();
    expect(newIdentity.publicKeyHex.length).toBe(64);
    expect(newIdentity.creatorName).toBe('TestIsolationCreator');
    expect(newIdentity.vaultStatus).toBeDefined();
  });

  it('updateUserAlias() should update creator name without exposing privateKeyHex', () => {
    const updated = keyringManager.updateUserAlias('UpdatedIsolationAlias');
    expect(updated).toBeDefined();
    expect((updated as any).privateKeyHex).toBeUndefined();
    expect(updated?.creatorName).toBe('UpdatedIsolationAlias');
  });

  it('vault storage file should not contain plaintext private keys', () => {
    const vaultPath = keyringManager.getStorageVaultPath();
    if (fs.existsSync(vaultPath)) {
      const rawContent = fs.readFileSync(vaultPath, 'utf8');
      const parsed = JSON.parse(rawContent);
      expect(parsed.privateKeyHex).toBeUndefined();
      if (parsed.privateKeyEncrypted) {
        expect(parsed.privateKeyEncrypted).toMatch(/^(mb_gcm|os_vault|safeStorage):/);
      }
    }
  });
});
