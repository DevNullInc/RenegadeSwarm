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
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';

export class DaemonAuthTokenManager {
  private token: string = '';
  private customStorageDir?: string;

  constructor(customStorageDir?: string) {
    this.customStorageDir = customStorageDir;
    this.initToken();
  }

  /**
   * Initializes or loads the 32-byte daemon authentication token.
   */
  public initToken(): string {
    const primaryPath = this.getPrimaryTokenPath();

    // 1. Try reading existing token from primary path
    if (fs.existsSync(primaryPath)) {
      try {
        const existing = fs.readFileSync(primaryPath, 'utf8').trim();
        if (/^[a-fA-F0-9]{64}$/.test(existing)) {
          this.token = existing;
          this.syncWellKnownPaths();
          return this.token;
        }
      } catch {}
    }

    // 2. Generate new 32-byte cryptographic token
    this.token = crypto.randomBytes(32).toString('hex');
    this.writeTokenFile(primaryPath, this.token);
    this.syncWellKnownPaths();
    return this.token;
  }

  public getToken(): string {
    if (!this.token) {
      return this.initToken();
    }
    return this.token;
  }

  public getOrCreateToken(): string {
    return this.getToken();
  }

  /**
   * Constant-time timing-safe verification of incoming bearer token.
   * Hashes both tokens with SHA-256 before comparing 32-byte digests.
   */
  public verifyBearerToken(providedToken?: string): boolean {
    if (!providedToken || typeof providedToken !== 'string') {
      return false;
    }

    const cleanToken = providedToken.startsWith('Bearer ')
      ? providedToken.slice(7).trim()
      : providedToken.trim();

    if (!cleanToken) {
      return false;
    }

    const expectedHash = crypto.createHash('sha256').update(this.getToken()).digest();
    const providedHash = crypto.createHash('sha256').update(cleanToken).digest();

    return crypto.timingSafeEqual(expectedHash, providedHash);
  }

  public getPrimaryTokenPath(): string {
    if (this.customStorageDir) {
      return path.join(this.customStorageDir, 'daemon.token');
    }
    try {
      if (app?.getPath) {
        return path.join(app.getPath('userData'), 'daemon.token');
      }
    } catch {}
    return path.join(process.cwd(), '.renegadeswarm_security', 'daemon.token');
  }

  public getWellKnownPaths(): string[] {
    const paths: string[] = [];
    const home = os.homedir() || '';

    // Windows well-known path
    if (process.platform === 'win32' || process.env.APPDATA) {
      const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
      paths.push(path.join(appData, 'RenegadeSwarm', 'daemon.token'));
    }

    // Linux well-known path
    if (process.platform === 'linux' || (!process.env.APPDATA && process.platform !== 'darwin')) {
      paths.push(path.join(home, '.config', 'RenegadeSwarm', 'daemon.token'));
    }

    // macOS well-known path
    if (process.platform === 'darwin') {
      paths.push(path.join(home, 'Library', 'Application Support', 'RenegadeSwarm', 'daemon.token'));
    }

    // Local project / test fallback
    paths.push(path.join(process.cwd(), '.renegadeswarm_security', 'daemon.token'));

    return Array.from(new Set(paths));
  }

  private syncWellKnownPaths(): void {
    const wellKnown = this.getWellKnownPaths();
    for (const p of wellKnown) {
      try {
        this.writeTokenFile(p, this.token);
      } catch {}
    }
  }

  private writeTokenFile(filePath: string, tokenData: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    try {
      // Attempt exclusive write with 0600 mode
      fs.writeFileSync(filePath, tokenData, { encoding: 'utf8', mode: 0o600, flag: 'w' });
    } catch {
      // Fallback normal write
      fs.writeFileSync(filePath, tokenData, { encoding: 'utf8', mode: 0o600 });
    }
  }
}

export const daemonAuthTokenManager = new DaemonAuthTokenManager();
