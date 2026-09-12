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

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface PieceStreamConfig {
  pieceLength: number; // e.g., 4MB to 32MB
  verifyPieceSha256: boolean;
}

export class PieceStreamEngine {
  private activeStreams: Map<string, fs.WriteStream> = new Map();

  async writePiece(params: {
    targetFilePath: string;
    pieceIndex: number;
    pieceLength: number;
    pieceData: Buffer;
    expectedSha256?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { targetFilePath, pieceIndex, pieceLength, pieceData, expectedSha256 } = params;

    // 1. Content integrity check: Validate piece SHA256 before writing to disk
    if (expectedSha256) {
      const pieceSha256 = crypto.createHash('sha256').update(pieceData).digest('hex');
      if (pieceSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
        return {
          success: false,
          error: `Corrupt piece #${pieceIndex}: SHA256 mismatch (got ${pieceSha256.slice(0, 12)}..., expected ${expectedSha256.slice(0, 12)}...)`,
        };
      }
    }

    // 2. Ensure target directory exists
    const dir = path.dirname(targetFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 3. Direct random-access offset write with fd to support multi-gigabyte models without in-memory buffering
    const offset = pieceIndex * pieceLength;

    return new Promise((resolve) => {
      fs.open(targetFilePath, 'w+', (openErr, fd) => {
        if (openErr) {
          return resolve({ success: false, error: openErr.message });
        }

        fs.write(fd, pieceData, 0, pieceData.length, offset, (writeErr) => {
          fs.close(fd, () => {
            if (writeErr) {
              resolve({ success: false, error: writeErr.message });
            } else {
              resolve({ success: true });
            }
          });
        });
      });
    });
  }

  async verifyEntireFileSha256(filePath: string, expectedSha256: string): Promise<boolean> {
    if (!fs.existsSync(filePath)) return false;

    return new Promise((resolve) => {
      const hash = crypto.createHash('sha256');
      // Use tuned 8MB buffer highWaterMark for fast streaming
      const stream = fs.createReadStream(filePath, { highWaterMark: 8 * 1024 * 1024 });

      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => {
        const computed = hash.digest('hex');
        resolve(computed.toLowerCase() === expectedSha256.toLowerCase());
      });
      stream.on('error', () => resolve(false));
    });
  }
}

export const pieceStreamEngine = new PieceStreamEngine();
