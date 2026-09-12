/**
 * RenegadeSwarm - Filesystem Content Inspector
 * Inspects on-disk files in isolation/quarantine to prevent executable or masquerading payloads.
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
