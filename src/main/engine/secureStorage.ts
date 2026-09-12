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

const ALGORITHM = 'aes-256-gcm';

/**
 * Derives machine-and-user specific entropy available consistently across both
 * the Electron desktop main process and CLI/test environments.
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
 * Encrypts a plaintext key or secret using machine-and-user bound AES-256-GCM.
 */
export function encryptSecret(plainText: string): string {
  if (!plainText) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, MACHINE_KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `mb_gcm:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts machine-bound AES-256-GCM ciphertext.
 */
export function decryptSecret(cipherText: string): string {
  if (!cipherText) return '';
  if (typeof cipherText !== 'string' || !cipherText.startsWith('mb_gcm:')) {
    return cipherText;
  }

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
    console.warn('[SecureStorage] Decryption failed, using fallback:', err);
  }

  return cipherText;
}
