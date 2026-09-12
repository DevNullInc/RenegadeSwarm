import { describe, it, expect } from 'vitest';
import {
  validateModelBufferHeader,
  ModelFormatType,
} from '../src/protocol/contentValidator';

describe('Strict AI & LLM Model Content Validation', () => {
  it('should accept valid SafeTensors header buffer', () => {
    // Construct valid SafeTensors buffer: 8-byte length prefix + JSON header
    const jsonHeader = JSON.stringify({
      __metadata__: { format: 'pt' },
      'model.diffusion_model.weight': { dtype: 'F16', shape: [320, 4, 3, 3], data_offsets: [0, 46080] },
    });
    const jsonBytes = Buffer.from(jsonHeader, 'utf8');

    const buf = Buffer.alloc(8 + jsonBytes.length);
    buf.writeUInt32LE(jsonBytes.length, 0); // low 32-bit header size
    buf.writeUInt32LE(0, 4);                // high 32-bit header size
    jsonBytes.copy(buf, 8);

    const result = validateModelBufferHeader(new Uint8Array(buf), '.safetensors', buf.length + 1000);
    expect(result.isValid).toBe(true);
    expect(result.formatType).toBe(ModelFormatType.SafeTensors);
    expect(result.tensorCount).toBe(1);
  });

  it('should accept valid GGUF header buffer', () => {
    // Construct valid GGUF buffer: 'GGUF' (4 bytes) + version (uint32 = 3) + tensor count (uint32 = 128)
    const buf = Buffer.alloc(32);
    buf.write('GGUF', 0, 4, 'ascii');
    buf.writeUInt32LE(3, 4);   // GGUF v3
    buf.writeUInt32LE(128, 8); // 128 tensors

    const result = validateModelBufferHeader(new Uint8Array(buf), '.gguf', 5000000);
    expect(result.isValid).toBe(true);
    expect(result.formatType).toBe(ModelFormatType.GGUF);
    expect(result.tensorCount).toBe(128);
  });

  it('should reject Windows Executable (PE/MZ) masquerading as .safetensors', () => {
    const fakeModel = Buffer.alloc(1024);
    fakeModel[0] = 0x4d; // 'M'
    fakeModel[1] = 0x5a; // 'Z'

    const result = validateModelBufferHeader(new Uint8Array(fakeModel), '.safetensors');
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Forbidden file signature detected: Windows Executable');
  });

  it('should reject Linux Executable (ELF) masquerading as .gguf', () => {
    const fakeGguf = Buffer.alloc(1024);
    fakeGguf[0] = 0x7f;
    fakeGguf[1] = 0x45; // 'E'
    fakeGguf[2] = 0x4c; // 'L'
    fakeGguf[3] = 0x46; // 'F'

    const result = validateModelBufferHeader(new Uint8Array(fakeGguf), '.gguf');
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Forbidden file signature detected: Linux Executable');
  });

  it('should reject pirated video / movie (MKV) masquerading as a checkpoint file', () => {
    const fakeMovie = Buffer.alloc(1024);
    fakeMovie[0] = 0x1a;
    fakeMovie[1] = 0x45;
    fakeMovie[2] = 0xdf;
    fakeMovie[3] = 0xa3; // Matroska / MKV magic bytes

    const result = validateModelBufferHeader(new Uint8Array(fakeMovie), '.safetensors');
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Forbidden file signature detected: Matroska / MKV Video');
  });

  it('should reject pirated video (MP4) masquerading as .bin', () => {
    const fakeMp4 = Buffer.alloc(1024);
    // '....ftyp'
    fakeMp4.write('ftyp', 4, 4, 'ascii');

    const result = validateModelBufferHeader(new Uint8Array(fakeMp4), '.bin');
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Forbidden media signature detected (MP4 ftyp container)');
  });

  it('should reject MP4 masquerading as safetensors', () => {
    const fakeMp4 = Buffer.concat([
      Buffer.alloc(4), // padding
      Buffer.from([0x66, 0x74, 0x79, 0x70]), // ftyp
      Buffer.alloc(100),
    ]);
    const result = validateModelBufferHeader(new Uint8Array(fakeMp4), '.safetensors');
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('MP4');
  });

  it('should reject ZIP polyglot files disguised as .safetensors', () => {
    // Starts with PK\x03\x04
    const zipPolyglot = Buffer.alloc(1024);
    zipPolyglot[0] = 0x50; // 'P'
    zipPolyglot[1] = 0x4b; // 'K'
    zipPolyglot[2] = 0x03;
    zipPolyglot[3] = 0x04;

    const result = validateModelBufferHeader(new Uint8Array(zipPolyglot), '.safetensors');
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Polyglot file rejected: Contains ZIP container signature');
  });

  it('should detect and reject truncated SafeTensors downloads', () => {
    // Header claims 20,000 bytes header size, but total file size is only 1,000 bytes
    const buf = Buffer.alloc(100);
    buf.writeUInt32LE(20000, 0);
    buf[8] = 0x7b; // '{'

    const result = validateModelBufferHeader(new Uint8Array(buf), '.safetensors', 1000);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Truncated file detected');
  });

  it('should reject shell scripts masquerading as models', () => {
    const fakeScript = Buffer.from('#!/bin/bash\nrm -rf /', 'utf8');

    const result = validateModelBufferHeader(new Uint8Array(fakeScript), '.safetensors');
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Forbidden script header detected (#! shebang)');
  });

  it('should reject RAR and 7-Zip archives masquerading as checkpoints', () => {
    const fakeRar = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00, 0x00]);
    const fake7z = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00, 0x00]);

    expect(validateModelBufferHeader(new Uint8Array(fakeRar), '.safetensors').isValid).toBe(false);
    expect(validateModelBufferHeader(new Uint8Array(fake7z), '.safetensors').isValid).toBe(false);
  });
});
