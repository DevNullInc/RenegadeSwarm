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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { KeyringManager } from '../src/main/engine/keyringManager';

describe('KeyringManager & User Identity Tests', () => {
  const testDir = path.join(process.cwd(), '.test_security_vault');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should generate, set, and persist user Ed25519 signing identity', () => {
    const manager = new KeyringManager(testDir);
    expect(manager.getUserIdentity()).toBeNull();

    const identity = manager.generateNewIdentity('TheStygianRenegade');
    expect(identity.creatorName).toBe('TheStygianRenegade');
    expect(identity.publicKeyHex).toHaveLength(64);
    expect(identity.privateKeyHex).toHaveLength(64);

    // Reload manager from the same directory to verify persistence
    const manager2 = new KeyringManager(testDir);
    const loaded = manager2.getUserIdentity();
    expect(loaded).toBeDefined();
    expect(loaded?.creatorName).toBe('TheStygianRenegade');
    expect(loaded?.publicKeyHex).toBe(identity.publicKeyHex);
    expect(loaded?.privateKeyHex).toBe(identity.privateKeyHex);
  });

  it('should add, list, remove, and persist trusted creator keys in keyring', () => {
    const manager = new KeyringManager(testDir);
    const initialCount = manager.getEntries().length;
    expect(initialCount).toBeGreaterThanOrEqual(1);

    const customKey = 'a'.repeat(64);
    manager.addEntry({
      creatorName: 'LyKON',
      publicKeyHex: customKey,
      trustLevel: 'VerifiedCreator',
      addedAt: Math.floor(Date.now() / 1000),
      notes: 'SDXL creator',
    });

    expect(manager.getEntries().length).toBe(initialCount + 1);

    const verification = manager.verifyCreator('LyKON', customKey);
    expect(verification.isKnown).toBe(true);
    expect(verification.trustLevel).toBe('VerifiedCreator');

    // Reload manager from directory
    const manager2 = new KeyringManager(testDir);
    const entries2 = manager2.getEntries();
    expect(entries2.some((e) => e.publicKeyHex === customKey)).toBe(true);

    // Remove entry
    const removed = manager2.removeEntry(customKey);
    expect(removed).toBe(true);
    expect(manager2.getEntries().some((e) => e.publicKeyHex === customKey)).toBe(false);
  });

  it('should encrypt private key at rest using machine-bound AES-256-GCM', () => {
    const manager = new KeyringManager(testDir);
    const identity = manager.generateNewIdentity('SecureCreator');

    // Read the raw json on disk
    const rawDisk = fs.readFileSync(path.join(testDir, 'user_identity.json'), 'utf-8');
    const parsedDisk = JSON.parse(rawDisk);

    // Verify it is NOT plaintext on disk, but has mb_gcm: prefix
    expect(parsedDisk.privateKeyHex).toMatch(/^mb_gcm:/);
    expect(parsedDisk.privateKeyHex).not.toBe(identity.privateKeyHex);

    // Verify when loaded by another manager instance, it decrypts seamlessly
    const manager2 = new KeyringManager(testDir);
    const loaded = manager2.getUserIdentity();
    expect(loaded?.privateKeyHex).toBe(identity.privateKeyHex);
  });

  it('should enforce anti-abuse lockout period on key regeneration', () => {
    // 2-second lockout for testing
    const manager = new KeyringManager(testDir, 2);
    manager.generateNewIdentity('AntiAbuseCreator');

    const lockout1 = manager.getLockoutStatus();
    expect(lockout1.canGenerate).toBe(false);
    expect(lockout1.lockoutRemainingSeconds).toBeGreaterThan(0);

    // Attempting to regenerate during lockout should throw
    expect(() => {
      manager.generateNewIdentity('NewHandle');
    }).toThrow(/Anti-abuse lockout active/i);

    // Force flag should bypass if explicitly requested
    const forced = manager.generateNewIdentity('NewHandle', true);
    expect(forced.creatorName).toBe('NewHandle');
  });
});
