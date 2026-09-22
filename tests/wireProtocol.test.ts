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

import { describe, it, expect } from 'vitest';
import {
  serializeHandshake,
  parseHandshake,
  serializeMessage,
  serializeHave,
  serializeRequest,
  serializePiece,
  Bitfield,
  MessageId,
  PROTOCOL_STRING,
} from '../src/protocol/wireProtocol';

describe('BitTorrent Wire Protocol (BEP 3 & Framing)', () => {
  const infoHash = '4a5c88b2e118b6284f18b3ec48866164287d3d2a';
  const peerId = '2d5253303130302d313233343536373839306162'; // -RS0100-1234567890ab

  it('should serialize and parse BitTorrent handshake buffer accurately', () => {
    const handshakeBuf = serializeHandshake(infoHash, peerId, true);
    expect(handshakeBuf.length).toBe(68);

    const parsed = parseHandshake(handshakeBuf);
    expect(parsed).not.toBeNull();
    expect(parsed!.pstr).toBe(PROTOCOL_STRING);
    expect(parsed!.infoHash).toBe(infoHash.toLowerCase());
    expect(parsed!.peerId).toBe(peerId.toLowerCase());
    // Check BEP 10 extension bit (byte index 25 / reserved[5] == 0x10)
    expect(parsed!.reserved[5] & 0x10).toBe(0x10);
    // Check BEP 5 DHT support flag (byte index 27 / reserved[7] == 0x01)
    expect(parsed!.reserved[7] & 0x01).toBe(0x01);
  });

  it('should serialize standard wire messages with correct 4-byte length prefix and ID', () => {
    // Choke message
    const chokeMsg = serializeMessage(MessageId.Choke);
    expect(chokeMsg.length).toBe(5);
    expect(chokeMsg.readUInt32BE(0)).toBe(1); // length = 1
    expect(chokeMsg.readUInt8(4)).toBe(MessageId.Choke);

    // Have message
    const haveMsg = serializeHave(42);
    expect(haveMsg.length).toBe(9);
    expect(haveMsg.readUInt32BE(0)).toBe(5); // 1 + 4 = 5
    expect(haveMsg.readUInt8(4)).toBe(MessageId.Have);
    expect(haveMsg.readUInt32BE(5)).toBe(42);

    // Request message (index, begin, length)
    const reqMsg = serializeRequest(10, 16384, 16384);
    expect(reqMsg.length).toBe(17);
    expect(reqMsg.readUInt32BE(0)).toBe(13); // 1 + 12 = 13
    expect(reqMsg.readUInt8(4)).toBe(MessageId.Request);
    expect(reqMsg.readUInt32BE(5)).toBe(10);
    expect(reqMsg.readUInt32BE(9)).toBe(16384);
    expect(reqMsg.readUInt32BE(13)).toBe(16384);

    // Piece message
    const blockData = Buffer.alloc(1024, 0xab);
    const pieceMsg = serializePiece(3, 0, blockData);
    expect(pieceMsg.length).toBe(4 + 1 + 8 + 1024);
    expect(pieceMsg.readUInt8(4)).toBe(MessageId.Piece);
  });

  it('should manage bitfield operations and piece counting', () => {
    const bitfield = new Bitfield(16); // 16 pieces = 2 bytes
    expect(bitfield.pieceCount).toBe(16);
    expect(bitfield.count()).toBe(0);
    expect(bitfield.isComplete()).toBe(false);

    bitfield.set(0, true);
    bitfield.set(7, true);
    bitfield.set(15, true);

    expect(bitfield.get(0)).toBe(true);
    expect(bitfield.get(7)).toBe(true);
    expect(bitfield.get(15)).toBe(true);
    expect(bitfield.get(1)).toBe(false);
    expect(bitfield.count()).toBe(3);

    bitfield.setAll();
    expect(bitfield.count()).toBe(16);
    expect(bitfield.isComplete()).toBe(true);
  });
});
