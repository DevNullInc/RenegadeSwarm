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

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { KeyringEngine, KeyringEntry, TrustLevel } from '../../protocol/keyring';
import { generateEd25519KeyPair } from '../../protocol/crypto';
import {
  UserIdentity,
  UserIdentityPublic,
  KeyringEntrySchema,
  LockoutStatus,
} from '../../shared/ipcContracts';
import { encryptSecret, decryptSecret, getVaultStatus } from './secureStorage';

export const DEFAULT_KEY_REGENERATION_LOCKOUT_SECONDS = 24 * 60 * 60; // 24 hours anti-abuse cooldown

export class KeyringManager {
  private keyringEngine: KeyringEngine;
  private storageDir: string;
  private keyringFilePath: string;
  private identityFilePath: string;
  private userIdentity: UserIdentity | null = null;
  private lockoutDurationSeconds: number;

  constructor(customStorageDir?: string, lockoutDurationSeconds = DEFAULT_KEY_REGENERATION_LOCKOUT_SECONDS) {
    this.keyringEngine = new KeyringEngine();
    this.lockoutDurationSeconds = lockoutDurationSeconds;

    try {
      this.storageDir =
        customStorageDir ||
        (app?.getPath
          ? path.join(app.getPath('userData'), 'security')
          : path.join(process.cwd(), '.renegadeswarm_security'));
    } catch {
      this.storageDir = customStorageDir || path.join(process.cwd(), '.renegadeswarm_security');
    }

    this.keyringFilePath = path.join(this.storageDir, 'keyring.json');
    this.identityFilePath = path.join(this.storageDir, 'user_identity.json');

    this.initStorage();
  }

  private initStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
      }

      // Load Keyring
      if (fs.existsSync(this.keyringFilePath)) {
        const data = fs.readFileSync(this.keyringFilePath, 'utf-8');
        this.keyringEngine.importKeyring(data);

        // Purge legacy/placeholder root keys if present from previous runs
        const legacyKeys = [
          'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262',
        ];
        let purged = false;
        for (const lk of legacyKeys) {
          if (this.keyringEngine.removeEntry(lk)) {
            purged = true;
          }
        }
        if (purged) {
          this.saveKeyring();
        }
      } else {
        this.saveKeyring();
      }

      // Load User Identity with native OS safeStorage or test fallback
      if (fs.existsSync(this.identityFilePath)) {
        const raw = fs.readFileSync(this.identityFilePath, 'utf-8');
        const parsed = JSON.parse(raw);

        let decryptedKey: string | null = null;
        if (parsed.privateKeyEncrypted) {
          decryptedKey = decryptSecret(parsed.privateKeyEncrypted);
        } else if (parsed.privateKeyHex && (parsed.privateKeyHex.startsWith('os_vault:') || parsed.privateKeyHex.startsWith('mb_gcm:'))) {
          decryptedKey = decryptSecret(parsed.privateKeyHex);
        }

        if (decryptedKey) {
          this.userIdentity = {
            creatorName: parsed.creatorName || 'Anonymous Creator',
            publicKeyHex: parsed.publicKeyHex,
            privateKeyHex: decryptedKey,
            createdAt: parsed.createdAt || Math.floor(Date.now() / 1000),
            lastRegeneratedAt: parsed.lastRegeneratedAt,
          };
        } else {
          // If private key could not be decrypted, preserve public identity in memory
          this.userIdentity = {
            creatorName: parsed.creatorName || 'Anonymous Creator',
            publicKeyHex: parsed.publicKeyHex,
            privateKeyHex: '',
            createdAt: parsed.createdAt || Math.floor(Date.now() / 1000),
            lastRegeneratedAt: parsed.lastRegeneratedAt,
          };
        }
      }
    } catch (err) {
      console.warn('[KeyringManager] Failed to load stored security configurations, using defaults:', err);
    }
  }

  private saveKeyring() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
      }
      fs.writeFileSync(this.keyringFilePath, this.keyringEngine.exportKeyring(), 'utf-8');
    } catch (err) {
      console.error('[KeyringManager] Error persisting keyring to disk:', err);
    }
  }

  private saveUserIdentity() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
      }
      if (this.userIdentity) {
        let encryptedKey: string | null = null;
        if (this.userIdentity.privateKeyHex) {
          encryptedKey = encryptSecret(this.userIdentity.privateKeyHex);
        }

        const recordToSave = {
          creatorName: this.userIdentity.creatorName,
          publicKeyHex: this.userIdentity.publicKeyHex,
          privateKeyEncrypted: encryptedKey || undefined,
          createdAt: this.userIdentity.createdAt,
          lastRegeneratedAt: this.userIdentity.lastRegeneratedAt,
        };

        fs.writeFileSync(this.identityFilePath, JSON.stringify(recordToSave, null, 2), {
          encoding: 'utf-8',
          mode: 0o600,
        });
      } else if (fs.existsSync(this.identityFilePath)) {
        fs.unlinkSync(this.identityFilePath);
      }
    } catch (err) {
      console.error('[KeyringManager] Error persisting user identity:', err);
    }
  }

  getEntries(): KeyringEntry[] {
    return this.keyringEngine.getEntries();
  }

  addEntry(entry: KeyringEntry): void {
    const validated = KeyringEntrySchema.parse(entry);
    this.keyringEngine.addEntry(validated);
    this.saveKeyring();
  }

  removeEntry(publicKeyHex: string): boolean {
    const ok = this.keyringEngine.removeEntry(publicKeyHex);
    if (ok) {
      this.saveKeyring();
    }
    return ok;
  }

  verifyCreator(creatorName: string, publicKeyHex?: string): {
    trustLevel: TrustLevel;
    isKnown: boolean;
    entry?: KeyringEntry;
  } {
    return this.keyringEngine.verifyCreatorKey(creatorName, publicKeyHex);
  }

  exportKeyring(): string {
    return this.keyringEngine.exportKeyring();
  }

  importKeyring(jsonString: string): number {
    const count = this.keyringEngine.importKeyring(jsonString);
    if (count > 0) {
      this.saveKeyring();
    }
    return count;
  }

  /**
   * Public DTO accessor. Strips private key before returning to callers.
   */
  getUserIdentity(): UserIdentityPublic | null {
    if (!this.userIdentity) return null;
    return {
      creatorName: this.userIdentity.creatorName,
      publicKeyHex: this.userIdentity.publicKeyHex,
      hasPrivateKey: !!this.userIdentity.privateKeyHex,
      vaultStatus: getVaultStatus(),
      createdAt: this.userIdentity.createdAt,
      lastRegeneratedAt: this.userIdentity.lastRegeneratedAt,
    };
  }

  /**
   * Internal accessor for Electron Main process cryptographic signing only.
   */
  getInternalUserIdentity(): UserIdentity | null {
    return this.userIdentity ? { ...this.userIdentity } : null;
  }

  getLockoutStatus(): LockoutStatus {
    const now = Math.floor(Date.now() / 1000);
    if (!this.userIdentity) {
      return {
        canGenerate: true,
        lockoutRemainingSeconds: 0,
        nextAllowedAt: now,
        lastGeneratedAt: 0,
        lockoutDurationSeconds: this.lockoutDurationSeconds,
      };
    }

    const lastGen = this.userIdentity.lastRegeneratedAt || this.userIdentity.createdAt;
    const elapsed = now - lastGen;
    const remaining = Math.max(0, this.lockoutDurationSeconds - elapsed);

    return {
      canGenerate: remaining === 0,
      lockoutRemainingSeconds: remaining,
      nextAllowedAt: lastGen + this.lockoutDurationSeconds,
      lastGeneratedAt: lastGen,
      lockoutDurationSeconds: this.lockoutDurationSeconds,
    };
  }

  updateUserAlias(creatorName: string): UserIdentityPublic {
    if (!this.userIdentity) {
      return this.generateNewIdentity(creatorName);
    }
    this.userIdentity.creatorName = creatorName.trim() || 'Anonymous Creator';
    this.saveUserIdentity();
    return this.getUserIdentity()!;
  }

  generateNewIdentity(creatorName: string, isTest = false): UserIdentityPublic {
    const lockout = this.getLockoutStatus();
    if (!lockout.canGenerate && !isTest) {
      const hours = Math.floor(lockout.lockoutRemainingSeconds / 3600);
      const minutes = Math.ceil((lockout.lockoutRemainingSeconds % 3600) / 60);
      const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes} minutes`;
      throw new Error(
        `Key generation locked: Anti-abuse lockout active. You must wait ${timeStr} before regenerating your signing identity to prevent blacklist avoidance.`
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const { publicKeyHex, privateKeyHex } = generateEd25519KeyPair();
    this.userIdentity = {
      creatorName: creatorName.trim() || 'Anonymous Creator',
      publicKeyHex,
      privateKeyHex,
      createdAt: this.userIdentity ? this.userIdentity.createdAt : now,
      lastRegeneratedAt: now,
    };

    this.saveUserIdentity();
    return this.getUserIdentity()!;
  }

  getStorageVaultPath(): string {
    return this.identityFilePath;
  }
}

export const keyringManager = new KeyringManager();
