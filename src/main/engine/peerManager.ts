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

import EventEmitter from 'events';
import { Bitfield } from '../../protocol/wireProtocol';

export interface PeerSession {
  peerId: string;
  ip: string;
  port: number;
  infoHash: string;
  amChoking: boolean;
  amInterested: boolean;
  peerChoking: boolean;
  peerInterested: boolean;
  bitfield: Bitfield;
  downloadSpeedBps: number;
  uploadSpeedBps: number;
  totalBytesDownloaded: number;
  totalBytesUploaded: number;
  lastActiveTime: number;
  isOptimisticUnchoke: boolean;
}

export interface PeerManagerConfig {
  maxPeersPerTorrent: number; // e.g. 50 peers max
  maxGlobalPeers: number;     // e.g. 200 peers max
  uploadSlots: number;        // e.g. 4 unchoke slots
  optimisticUnchokeIntervalMs: number; // e.g. 30,000ms (30s)
}

export class PeerManager extends EventEmitter {
  private peers: Map<string, PeerSession> = new Map(); // key: `${infoHash}:${peerId}`
  private config: PeerManagerConfig;
  private optimisticTimer: NodeJS.Timeout | null = null;
  private lastOptimisticPeerId: string | null = null;

  constructor(config?: Partial<PeerManagerConfig>) {
    super();
    this.config = {
      maxPeersPerTorrent: 50,
      maxGlobalPeers: 200,
      uploadSlots: 4,
      optimisticUnchokeIntervalMs: 30000,
      ...(config || {}),
    };

    this.startChokingLoop();
  }

  addPeer(params: {
    peerId: string;
    ip: string;
    port: number;
    infoHash: string;
    pieceCount: number;
  }): PeerSession | null {
    const key = `${params.infoHash.toLowerCase()}:${params.peerId.toLowerCase()}`;
    if (this.peers.has(key)) {
      return this.peers.get(key)!;
    }

    if (this.peers.size >= this.config.maxGlobalPeers) {
      return null; // Global connection limit reached
    }

    const torrentPeers = this.getPeersForTorrent(params.infoHash);
    if (torrentPeers.length >= this.config.maxPeersPerTorrent) {
      return null; // Per-torrent connection limit reached
    }

    const peer: PeerSession = {
      peerId: params.peerId,
      ip: params.ip,
      port: params.port,
      infoHash: params.infoHash.toLowerCase(),
      amChoking: true,
      amInterested: false,
      peerChoking: true,
      peerInterested: false,
      bitfield: new Bitfield(params.pieceCount),
      downloadSpeedBps: 0,
      uploadSpeedBps: 0,
      totalBytesDownloaded: 0,
      totalBytesUploaded: 0,
      lastActiveTime: Date.now(),
      isOptimisticUnchoke: false,
    };

    this.peers.set(key, peer);
    this.emit('peer:connected', peer);
    return peer;
  }

  removePeer(infoHash: string, peerId: string) {
    const key = `${infoHash.toLowerCase()}:${peerId.toLowerCase()}`;
    const peer = this.peers.get(key);
    if (peer) {
      this.peers.delete(key);
      this.emit('peer:disconnected', peer);
    }
  }

  getPeersForTorrent(infoHash: string): PeerSession[] {
    const target = infoHash.toLowerCase();
    return Array.from(this.peers.values()).filter((p) => p.infoHash === target);
  }

  getAllPeers(): PeerSession[] {
    return Array.from(this.peers.values());
  }

  recordPeerTransfer(infoHash: string, peerId: string, downloaded: number, uploaded: number) {
    const key = `${infoHash.toLowerCase()}:${peerId.toLowerCase()}`;
    const peer = this.peers.get(key);
    if (peer) {
      peer.totalBytesDownloaded += downloaded;
      peer.totalBytesUploaded += uploaded;
      peer.downloadSpeedBps = downloaded;
      peer.uploadSpeedBps = uploaded;
      peer.lastActiveTime = Date.now();
    }
  }

  /**
   * Tit-for-Tat Choking Algorithm & Optimistic Unchoking (Rule 11)
   * Selects top N peers for unchoking + 1 optimistic peer.
   */
  recalculateChokeSlots(infoHash: string, isSeeder: boolean) {
    const peers = this.getPeersForTorrent(infoHash);
    if (peers.length === 0) return;

    // Filter interested peers
    const interestedPeers = peers.filter((p) => p.peerInterested);

    // Sort peers:
    // If downloading: by download speed from them (tit-for-tat)
    // If seeding: by upload speed to them (whoever takes data fastest)
    interestedPeers.sort((a, b) => {
      if (isSeeder) {
        return b.uploadSpeedBps - a.uploadSpeedBps;
      } else {
        return b.downloadSpeedBps - a.downloadSpeedBps;
      }
    });

    const regularUnchokeCount = Math.min(this.config.uploadSlots, interestedPeers.length);
    const unchokedSet = new Set<string>();

    // Unchoke top N regular peers
    for (let i = 0; i < regularUnchokeCount; i++) {
      const p = interestedPeers[i];
      p.amChoking = false;
      p.isOptimisticUnchoke = false;
      unchokedSet.add(p.peerId);
    }

    // Select 1 optimistic unchoke peer among remaining interested peers
    const remaining = interestedPeers.filter((p) => !unchokedSet.has(p.peerId));
    if (remaining.length > 0) {
      const candidate = remaining[Math.floor(Math.random() * remaining.length)];
      candidate.amChoking = false;
      candidate.isOptimisticUnchoke = true;
      unchokedSet.add(candidate.peerId);
      this.lastOptimisticPeerId = candidate.peerId;
    }

    // Choke all other peers
    for (const p of peers) {
      if (!unchokedSet.has(p.peerId)) {
        p.amChoking = true;
        p.isOptimisticUnchoke = false;
      }
    }

    this.emit('choke:recalculated', { infoHash, unchokedPeerIds: Array.from(unchokedSet) });
  }

  private startChokingLoop() {
    this.optimisticTimer = setInterval(() => {
      const uniqueInfoHashes = new Set(Array.from(this.peers.values()).map((p) => p.infoHash));
      for (const hash of uniqueInfoHashes) {
        this.recalculateChokeSlots(hash, false);
      }
    }, this.config.optimisticUnchokeIntervalMs);
  }

  stop() {
    if (this.optimisticTimer) {
      clearInterval(this.optimisticTimer);
      this.optimisticTimer = null;
    }
  }
}

export const peerManager = new PeerManager();
