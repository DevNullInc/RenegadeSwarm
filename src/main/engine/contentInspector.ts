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
import {
  validateModelBufferHeader,
  ContentValidationResult,
  ModelFormatType,
} from '../../protocol/contentValidator';

export class ContentInspector {
  /**
   * Inspects a local file by reading its initial header chunk and validating its format.
   */
  async inspectFile(filePath: string, customExtension?: string): Promise<ContentValidationResult> {
    if (!fs.existsSync(filePath)) {
      return {
        isValid: false,
        formatType: ModelFormatType.Unknown,
        reason: `File not found: ${filePath}`,
      };
    }

    const stat = fs.statSync(filePath);
    let ext = customExtension || path.extname(filePath);

    // If file is in quarantine staging (.part), extract underlying model extension
    if (ext.toLowerCase() === '.part') {
      const stripped = filePath.slice(0, -5);
      ext = path.extname(stripped);
    }

    // Read initial 64KB for deep header inspection
    const headerBuffer = Buffer.alloc(Math.min(stat.size, 65536));
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, headerBuffer, 0, headerBuffer.length, 0);
    fs.closeSync(fd);

    return validateModelBufferHeader(headerBuffer, ext, stat.size);
  }
}

export const contentInspector = new ContentInspector();
