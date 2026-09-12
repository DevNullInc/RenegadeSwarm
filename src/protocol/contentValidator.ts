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

export enum ModelFormatType {
  SafeTensors = 'SafeTensors',
  GGUF = 'GGUF',
  ONNX = 'ONNX',
  PyTorchWeights = 'PyTorchWeights',
  ModelConfig = 'ModelConfig',
  PreviewImage = 'PreviewImage',
  Unknown = 'Unknown',
}

export interface ContentValidationResult {
  isValid: boolean;
  formatType: ModelFormatType;
  tensorCount?: number;
  metadata?: Record<string, any>;
  reason?: string;
}

// Prohibited Magic Byte Signatures (Disallowed executables, media, and masquerading archives)
export const PROHIBITED_MAGIC_SIGNATURES = [
  { name: 'Windows Executable / DLL (MZ)', bytes: [0x4d, 0x5a] },
  { name: 'Linux Executable (ELF)', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: 'macOS Executable (Mach-O 64-bit)', bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { name: 'macOS Executable (Mach-O 32-bit)', bytes: [0xce, 0xfa, 0xed, 0xfe] },
  { name: 'RAR Archive', bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },
  { name: '7-Zip Archive', bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  { name: 'Matroska / MKV Video', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { name: 'FLAC Audio', bytes: [0x66, 0x4c, 0x61, 0x43] },
  { name: 'MP3 Audio (ID3)', bytes: [0x49, 0x44, 0x33] },
  { name: 'Windows Shortcut / Shell link', bytes: [0x4c, 0x00, 0x00, 0x00, 0x01, 0x14, 0x02, 0x00] },
];

/**
 * Inspects header buffer and verifies strict compliance with AI/LLM formats.
 */
export function validateModelBufferHeader(
  buffer: Uint8Array,
  declaredExtension: string,
  totalFileSize?: number
): ContentValidationResult {
  if (!buffer || buffer.length < 16) {
    return {
      isValid: false,
      formatType: ModelFormatType.Unknown,
      reason: 'Buffer too small for magic byte validation',
    };
  }

  // 1. Prohibited magic byte check
  for (const sig of PROHIBITED_MAGIC_SIGNATURES) {
    let matches = true;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[i] !== sig.bytes[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return {
        isValid: false,
        formatType: ModelFormatType.Unknown,
        reason: `Forbidden file signature detected: ${sig.name}`,
      };
    }
  }

  // Check for shell scripts
  if (buffer[0] === 0x23 && buffer[1] === 0x21) {
    // '#!'
    return {
      isValid: false,
      formatType: ModelFormatType.Unknown,
      reason: 'Forbidden script header detected (#! shebang)',
    };
  }

  // Check for MP4 video ('ftyp' box at index 4)
  if (
    buffer.length >= 8 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return {
      isValid: false,
      formatType: ModelFormatType.Unknown,
      reason: 'Forbidden media signature detected (MP4 ftyp container)',
    };
  }

  const ext = declaredExtension.toLowerCase().replace(/^\./, '');

  // 2. Format-specific deep verification
  switch (ext) {
    case 'safetensors':
      return validateSafeTensorsHeader(buffer, totalFileSize);

    case 'gguf':
      return validateGgufHeader(buffer);

    case 'onnx':
      return validateOnnxHeader(buffer);

    case 'json':
    case 'yaml':
      return validateConfigText(buffer);

    case 'png':
      return validatePngHeader(buffer);

    case 'jpg':
    case 'jpeg':
      return validateJpegHeader(buffer);

    case 'webp':
      return validateWebpHeader(buffer);

    case 'bin':
    case 'pt':
    case 'pth':
    case 'ckpt':
      return validatePyTorchWeightsHeader(buffer);

    default:
      return {
        isValid: false,
        formatType: ModelFormatType.Unknown,
        reason: `Unsupported model extension .${ext}. Only certified AI/LLM formats are allowed.`,
      };
  }
}

/**
 * Validates SafeTensors header structure:
 * - Must NOT be a ZIP container or archive polyglot (PK\x03\x04 at byte 0 is strictly forbidden)
 * - 8-byte little-endian uint64 header size
 * - JSON metadata payload starting with '{' and containing valid tensor descriptions
 */
function validateSafeTensorsHeader(buffer: Uint8Array, totalFileSize?: number): ContentValidationResult {
  // Polyglot defense: SafeTensors must NEVER start with ZIP header 'PK\x03\x04'
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return {
      isValid: false,
      formatType: ModelFormatType.SafeTensors,
      reason: 'Polyglot file rejected: Contains ZIP container signature (PK\x03\x04) disguised as SafeTensors',
    };
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  // Read uint64 low 32-bits (safetensors headers are < 100MB in practice)
  const headerSizeLow = view.getUint32(0, true);
  const headerSizeHigh = view.getUint32(4, true);

  if (headerSizeHigh !== 0) {
    return {
      isValid: false,
      formatType: ModelFormatType.SafeTensors,
      reason: 'SafeTensors header size suspiciously large (> 4GB)',
    };
  }

  if (headerSizeLow < 2 || headerSizeLow > 50 * 1024 * 1024) {
    return {
      isValid: false,
      formatType: ModelFormatType.SafeTensors,
      reason: `Invalid SafeTensors header size: ${headerSizeLow} bytes`,
    };
  }

  if (totalFileSize && totalFileSize < headerSizeLow + 8) {
    return {
      isValid: false,
      formatType: ModelFormatType.SafeTensors,
      reason: `Truncated file detected: total file size (${totalFileSize} bytes) smaller than declared SafeTensors header length (${headerSizeLow + 8} bytes)`,
    };
  }

  // The character immediately following the 8-byte length must be '{' (ASCII 0x7B)
  if (buffer[8] !== 0x7b) {
    return {
      isValid: false,
      formatType: ModelFormatType.SafeTensors,
      reason: 'SafeTensors header missing valid JSON opening bracket ({)',
    };
  }

  // Parse available header slice as UTF-8 JSON snippet
  try {
    const bytesAvailable = Math.min(buffer.length - 8, headerSizeLow);
    const jsonSnippet = new TextDecoder('utf-8').decode(buffer.subarray(8, 8 + bytesAvailable));

    // If we captured the entire header, parse it as JSON
    if (bytesAvailable === headerSizeLow) {
      const headerObj = JSON.parse(jsonSnippet);
      const keys = Object.keys(headerObj);
      const tensorKeys = keys.filter((k) => k !== '__metadata__');

      if (tensorKeys.length === 0 && !headerObj.__metadata__) {
        return {
          isValid: false,
          formatType: ModelFormatType.SafeTensors,
          reason: 'SafeTensors JSON header contains no tensor definitions or metadata',
        };
      }

      return {
        isValid: true,
        formatType: ModelFormatType.SafeTensors,
        tensorCount: tensorKeys.length,
        metadata: headerObj.__metadata__,
      };
    }

    // Partial header verification
    return {
      isValid: true,
      formatType: ModelFormatType.SafeTensors,
    };
  } catch (err: any) {
    return {
      isValid: false,
      formatType: ModelFormatType.SafeTensors,
      reason: `Malformed SafeTensors JSON header: ${err.message}`,
    };
  }
}

/**
 * Validates GGUF magic bytes: 'GGUF' (0x47, 0x47, 0x55, 0x46) + version 2 or 3.
 */
function validateGgufHeader(buffer: Uint8Array): ContentValidationResult {
  // Check magic bytes: 'GGUF'
  if (
    buffer[0] !== 0x47 ||
    buffer[1] !== 0x47 ||
    buffer[2] !== 0x55 ||
    buffer[3] !== 0x46
  ) {
    return {
      isValid: false,
      formatType: ModelFormatType.GGUF,
      reason: 'Missing GGUF magic header bytes (0x46554747)',
    };
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const version = view.getUint32(4, true);

  if (version < 1 || version > 4) {
    return {
      isValid: false,
      formatType: ModelFormatType.GGUF,
      reason: `Unsupported GGUF format version: v${version}`,
    };
  }

  const tensorCountLow = view.getUint32(8, true);
  return {
    isValid: true,
    formatType: ModelFormatType.GGUF,
    tensorCount: tensorCountLow,
    metadata: { ggufVersion: version },
  };
}

/**
 * Validates ONNX protobuf header (must not be an executable or archive).
 */
function validateOnnxHeader(buffer: Uint8Array): ContentValidationResult {
  // ONNX model proto typically starts with tag 0x08 (ir_version) or 0x0a (producer_name)
  if (buffer[0] !== 0x08 && buffer[0] !== 0x0a && buffer[0] !== 0x12) {
    return {
      isValid: false,
      formatType: ModelFormatType.ONNX,
      reason: 'Invalid ONNX Protobuf root header signature',
    };
  }

  return {
    isValid: true,
    formatType: ModelFormatType.ONNX,
  };
}

/**
 * Validates PyTorch weights (.bin, .pt, .pth).
 * PyTorch checkpoint files are either Zip archives (PyTorch 1.6+) or unpickled dictionaries.
 */
function validatePyTorchWeightsHeader(buffer: Uint8Array): ContentValidationResult {
  // Check for PK (Zip container standard for PyTorch .pt / .bin / .pth)
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  // Check for legacy Python pickle protocol (0x80 0x02, 0x80 0x03, 0x80 0x04)
  const isPickle = buffer[0] === 0x80 && (buffer[1] >= 0x02 && buffer[1] <= 0x05);

  if (!isZip && !isPickle) {
    return {
      isValid: false,
      formatType: ModelFormatType.PyTorchWeights,
      reason: 'Invalid PyTorch weights container signature (neither Zip container nor Pickle stream)',
    };
  }

  return {
    isValid: true,
    formatType: ModelFormatType.PyTorchWeights,
  };
}

/**
 * Validates Config Text (JSON / YAML UTF-8).
 */
function validateConfigText(buffer: Uint8Array): ContentValidationResult {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, Math.min(buffer.length, 4096)));
    if (!text.trim()) {
      return { isValid: false, formatType: ModelFormatType.ModelConfig, reason: 'Empty configuration file' };
    }
    return { isValid: true, formatType: ModelFormatType.ModelConfig };
  } catch {
    return { isValid: false, formatType: ModelFormatType.ModelConfig, reason: 'Config file is not valid UTF-8 text' };
  }
}

/**
 * Validates PNG image header: 89 50 4E 47 0D 0A 1A 0A
 */
function validatePngHeader(buffer: Uint8Array): ContentValidationResult {
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < pngSig.length; i++) {
    if (buffer[i] !== pngSig[i]) {
      return { isValid: false, formatType: ModelFormatType.PreviewImage, reason: 'Invalid PNG header signature' };
    }
  }
  return { isValid: true, formatType: ModelFormatType.PreviewImage };
}

/**
 * Validates JPEG image header: FF D8 FF
 */
function validateJpegHeader(buffer: Uint8Array): ContentValidationResult {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    return { isValid: false, formatType: ModelFormatType.PreviewImage, reason: 'Invalid JPEG header signature' };
  }
  return { isValid: true, formatType: ModelFormatType.PreviewImage };
}

/**
 * Validates WebP image header: 'RIFF' .... 'WEBP'
 */
function validateWebpHeader(buffer: Uint8Array): ContentValidationResult {
  if (
    buffer[0] !== 0x52 ||
    buffer[1] !== 0x49 ||
    buffer[2] !== 0x46 ||
    buffer[3] !== 0x46 ||
    buffer[8] !== 0x57 ||
    buffer[9] !== 0x45 ||
    buffer[10] !== 0x42 ||
    buffer[11] !== 0x50
  ) {
    return { isValid: false, formatType: ModelFormatType.PreviewImage, reason: 'Invalid WebP header signature' };
  }
  return { isValid: true, formatType: ModelFormatType.PreviewImage };
}
