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

export const PROTOCOL_STRING = 'BitTorrent protocol';
export const PROTOCOL_STRING_BYTES = Buffer.from(PROTOCOL_STRING, 'utf8');
export const BLOCK_SIZE = 16384; // 16KB standard BitTorrent block chunk

export enum MessageId {
  Choke = 0,
  Unchoke = 1,
  Interested = 2,
  NotInterested = 3,
  Have = 4,
  Bitfield = 5,
  Request = 6,
  Piece = 7,
  Cancel = 8,
  Port = 9,
  Extended = 20,
}

export interface HandshakePayload {
  pstr: string;
  reserved: Buffer;
  infoHash: string; // 40-char hex
  peerId: string;   // 40-char hex or 20-byte string
}

export interface PieceRequestPayload {
  index: number;
  begin: number;
  length: number;
}

export interface PieceBlockPayload {
  index: number;
  begin: number;
  block: Buffer;
}

/**
 * Serializes standard 68-byte BitTorrent Handshake buffer.
 */
export function serializeHandshake(infoHashHex: string, peerIdHex: string, extensions = true): Buffer {
  const buf = Buffer.alloc(68);
  buf.writeUInt8(19, 0); // pstrlen
  buf.write(PROTOCOL_STRING, 1, 19, 'utf8');

  // Reserved 8 bytes (Enable BEP 10 Extension Protocol bit 43: 0x10 at byte index 25)
  if (extensions) {
    buf[25] = 0x10;
  }

  Buffer.from(infoHashHex, 'hex').copy(buf, 28, 0, 20);
  Buffer.from(peerIdHex, 'hex').copy(buf, 48, 0, 20);

  return buf;
}

/**
 * Parses a 68-byte BitTorrent Handshake buffer.
 */
export function parseHandshake(buf: Buffer): HandshakePayload | null {
  if (buf.length < 68) return null;
  const pstrlen = buf.readUInt8(0);
  if (pstrlen !== 19) return null;

  const pstr = buf.toString('utf8', 1, 20);
  if (pstr !== PROTOCOL_STRING) return null;

  const reserved = buf.subarray(20, 28);
  const infoHash = buf.subarray(28, 48).toString('hex');
  const peerId = buf.subarray(48, 68).toString('hex');

  return { pstr, reserved, infoHash, peerId };
}

/**
 * Serializes standard wire protocol messages with 4-byte big-endian length prefix.
 */
export function serializeMessage(id: MessageId, payload?: Buffer): Buffer {
  const payloadLen = payload ? payload.length : 0;
  const totalLen = 1 + payloadLen; // 1 byte ID + payload length

  const buf = Buffer.alloc(4 + totalLen);
  buf.writeUInt32BE(totalLen, 0);
  buf.writeUInt8(id, 4);

  if (payload && payloadLen > 0) {
    payload.copy(buf, 5);
  }

  return buf;
}

export function serializeKeepAlive(): Buffer {
  return Buffer.alloc(4); // 4 zero bytes
}

export function serializeHave(pieceIndex: number): Buffer {
  const payload = Buffer.alloc(4);
  payload.writeUInt32BE(pieceIndex, 0);
  return serializeMessage(MessageId.Have, payload);
}

export function serializeRequest(index: number, begin: number, length: number = BLOCK_SIZE): Buffer {
  const payload = Buffer.alloc(12);
  payload.writeUInt32BE(index, 0);
  payload.writeUInt32BE(begin, 4);
  payload.writeUInt32BE(length, 8);
  return serializeMessage(MessageId.Request, payload);
}

export function serializePiece(index: number, begin: number, block: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(index, 0);
  header.writeUInt32BE(begin, 4);
  const payload = Buffer.concat([header, block]);
  return serializeMessage(MessageId.Piece, payload);
}

/**
 * Bitfield Manager: Tracks piece availability across the swarm.
 */
export class Bitfield {
  private buffer: Buffer;
  public readonly pieceCount: number;

  constructor(pieceCount: number, initialBuffer?: Buffer) {
    this.pieceCount = pieceCount;
    const byteLength = Math.ceil(pieceCount / 8);
    if (initialBuffer && initialBuffer.length === byteLength) {
      this.buffer = Buffer.from(initialBuffer);
    } else {
      this.buffer = Buffer.alloc(byteLength);
    }
  }

  get(index: number): boolean {
    if (index < 0 || index >= this.pieceCount) return false;
    const byteIndex = Math.floor(index / 8);
    const bitIndex = 7 - (index % 8);
    return (this.buffer[byteIndex] & (1 << bitIndex)) !== 0;
  }

  set(index: number, value: boolean) {
    if (index < 0 || index >= this.pieceCount) return;
    const byteIndex = Math.floor(index / 8);
    const bitIndex = 7 - (index % 8);
    if (value) {
      this.buffer[byteIndex] |= 1 << bitIndex;
    } else {
      this.buffer[byteIndex] &= ~(1 << bitIndex);
    }
  }

  setAll() {
    this.buffer.fill(0xff);
    // Zero out spare bits at the end of the last byte
    const spareBits = this.buffer.length * 8 - this.pieceCount;
    if (spareBits > 0) {
      const mask = (0xff << spareBits) & 0xff;
      this.buffer[this.buffer.length - 1] &= mask;
    }
  }

  toBuffer(): Buffer {
    return Buffer.from(this.buffer);
  }

  count(): number {
    let total = 0;
    for (let i = 0; i < this.pieceCount; i++) {
      if (this.get(i)) total++;
    }
    return total;
  }

  isComplete(): boolean {
    return this.count() === this.pieceCount;
  }
}

/**
 * BEP 10: Extension Protocol Framing & Discovery Messages
 */
export const EXTENDED_HANDSHAKE_ID = 0;
export const RS_DISCOVERY_EXTENSION_ID = 1;

export interface ExtendedHandshakeDict {
  m: Record<string, number>; // Map of extension name to local extension ID
  v?: string;                // Client name/version (e.g. 'RenegadeSwarm/0.2.0')
  renegade_swarm_version?: string;
  capabilities?: string[];
  [key: string]: any;
}

export function serializeExtendedMessage(extendedId: number, payload: Buffer): Buffer {
  const idBuf = Buffer.alloc(1);
  idBuf.writeUInt8(extendedId, 0);
  const combined = Buffer.concat([idBuf, payload]);
  return serializeMessage(MessageId.Extended, combined);
}

export function parseExtendedMessage(payload: Buffer): { extendedId: number; data: Buffer } | null {
  if (payload.length < 1) return null;
  const extendedId = payload.readUInt8(0);
  const data = payload.subarray(1);
  return { extendedId, data };
}

/**
 * Serializes BEP 10 Extended Handshake using canonical JSON encoding.
 */
export function serializeExtendedHandshake(dict: ExtendedHandshakeDict): Buffer {
  const jsonStr = JSON.stringify(dict);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');
  return serializeExtendedMessage(EXTENDED_HANDSHAKE_ID, jsonBuf);
}

/**
 * Parses BEP 10 Extended Handshake JSON buffer.
 */
export function parseExtendedHandshake(data: Buffer): ExtendedHandshakeDict | null {
  try {
    const jsonStr = data.toString('utf8');
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.m === 'object') {
      return parsed as ExtendedHandshakeDict;
    }
    return null;
  } catch {
    return null;
  }
}

export interface DiscoveryEnvelope {
  type: 'catalog_query' | 'catalog_response' | 'catalog_announce';
  payload: any;
  timestamp: number;
}

/**
 * Serializes a RenegadeSwarm discovery message payload.
 */
export function serializeDiscoveryPayload(type: 'catalog_query' | 'catalog_response' | 'catalog_announce', payload: any): Buffer {
  const envelope: DiscoveryEnvelope = {
    type,
    payload,
    timestamp: Date.now(),
  };
  return Buffer.from(JSON.stringify(envelope), 'utf8');
}

/**
 * Parses a RenegadeSwarm discovery message payload.
 */
export function parseDiscoveryPayload(data: Buffer): DiscoveryEnvelope | null {
  try {
    const jsonStr = data.toString('utf8');
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed.type === 'string' && parsed.payload) {
      return parsed as DiscoveryEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}

