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

import crypto from 'crypto';
import os from 'os';
import { safeStorage } from 'electron';

const ALGORITHM = 'aes-256-gcm';

/**
 * Checks whether native OS keychain encryption (Windows DPAPI, macOS Keychain, Linux Secret Service) is available.
 */
export function isOsVaultAvailable(): boolean {
  try {
    return !!(safeStorage && safeStorage.isEncryptionAvailable && safeStorage.isEncryptionAvailable());
  } catch {
    return false;
  }
}

/**
 * Returns the current vault encryption status.
 */
export function getVaultStatus(): 'encrypted_os_vault' | 'unencrypted_memory_only' | 'software_gcm_test' {
  if (isOsVaultAvailable()) {
    return 'encrypted_os_vault';
  }
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return 'software_gcm_test';
  }
  return 'unencrypted_memory_only';
}

/**
 * Derives machine-and-user specific entropy for test-only software AES-256-GCM fallback.
 */
export function getMachineEntropy(): string {
  let user = '';
  try {
    user = os.userInfo().username;
  } catch {
    user = process.env.USER || process.env.USERNAME || 'swarm-user';
  }
  const home = os.homedir() || '';
  const host = os.hostname() || '';
  const plat = os.platform() || '';
  return `swarm-entropy:${user}:${home}:${host}:${plat}`;
}

const MACHINE_SALT = crypto.createHash('sha256').update(getMachineEntropy()).digest();
const MACHINE_KEY = crypto.scryptSync('renegadeswarm-device-secret-key-v1', MACHINE_SALT, 32);

/**
 * Encrypts a plaintext key using Electron's native safeStorage (OS Keychain).
 * In test environments, falls back to AES-256-GCM.
 * In production without OS keychain, returns empty string (refuses to write plaintext).
 */
export function encryptSecret(plainText: string): string | null {
  if (!plainText) return '';

  // 1. Native OS Keychain via safeStorage
  if (isOsVaultAvailable()) {
    try {
      const encryptedBuf = safeStorage.encryptString(plainText);
      return `os_vault:${encryptedBuf.toString('base64')}`;
    } catch (err) {
      console.warn('[SecureStorage] Native safeStorage encryption failed:', err);
    }
  }

  // 2. Test harness fallback only (NODE_ENV=test / VITEST)
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, MACHINE_KEY, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `mb_gcm:${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  // 3. Production without OS vault: Refuse to write plaintext private key to disk
  return null;
}

/**
 * Decrypts ciphertext from OS keychain or test harness AES-256-GCM.
 */
export function decryptSecret(cipherText: string): string | null {
  if (!cipherText) return '';

  // 1. Native OS Keychain decryption
  if (cipherText.startsWith('os_vault:')) {
    if (!isOsVaultAvailable()) {
      console.warn('[SecureStorage] safeStorage is unavailable to decrypt os_vault payload');
      return null;
    }
    try {
      const base64Data = cipherText.slice(9);
      const encryptedBuf = Buffer.from(base64Data, 'base64');
      return safeStorage.decryptString(encryptedBuf);
    } catch (err) {
      console.warn('[SecureStorage] Failed to decrypt os_vault payload:', err);
      return null;
    }
  }

  // 2. Test harness fallback decryption
  if (cipherText.startsWith('mb_gcm:')) {
    try {
      const parts = cipherText.split(':');
      if (parts.length === 4) {
        const [, ivHex, authTagHex, encryptedText] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, MACHINE_KEY, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      }
    } catch (err) {
      console.warn('[SecureStorage] Test fallback decryption failed:', err);
      return null;
    }
  }

  // Do not trust unencrypted strings
  return null;
}
