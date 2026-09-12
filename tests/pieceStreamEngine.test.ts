import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PieceStreamEngine } from '../src/main/engine/pieceStreamEngine';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

describe('Multi-GB Piece Stream Engine & Integrity Checks', () => {
  const engine = new PieceStreamEngine();
  let testFilePath: string;

  beforeAll(() => {
    testFilePath = path.join(os.tmpdir(), 'piece_stream_test.bin');
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
  });

  afterAll(() => {
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
  });

  it('should write piece with verified SHA256', async () => {
    const pieceData = Buffer.alloc(1024 * 1024, 0x5a); // 1MB
    const pieceSha256 = crypto.createHash('sha256').update(pieceData).digest('hex');

    const result = await engine.writePiece({
      targetFilePath: testFilePath,
      pieceIndex: 0,
      pieceLength: 1024 * 1024,
      pieceData,
      expectedSha256: pieceSha256,
    });

    expect(result.success).toBe(true);
    expect(fs.existsSync(testFilePath)).toBe(true);
    expect(fs.statSync(testFilePath).size).toBe(1024 * 1024);
  });

  it('should reject corrupt piece with SHA256 mismatch before writing to disk', async () => {
    const pieceData = Buffer.alloc(1024 * 1024, 0x99);
    const wrongSha256 = '0000000000000000000000000000000000000000000000000000000000000000';

    const result = await engine.writePiece({
      targetFilePath: testFilePath,
      pieceIndex: 1,
      pieceLength: 1024 * 1024,
      pieceData,
      expectedSha256: wrongSha256,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Corrupt piece #1: SHA256 mismatch');
  });

  it('should verify entire file SHA256', async () => {
    const fileBuf = fs.readFileSync(testFilePath);
    const expectedFullSha = crypto.createHash('sha256').update(fileBuf).digest('hex');

    const matches = await engine.verifyEntireFileSha256(testFilePath, expectedFullSha);
    expect(matches).toBe(true);
  });
});
