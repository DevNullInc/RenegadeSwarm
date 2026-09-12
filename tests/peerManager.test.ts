import { describe, it, expect, afterAll } from 'vitest';
import { PeerManager } from '../src/main/engine/peerManager';

describe('Peer Manager & Tit-for-Tat Choking Algorithm (Rule 11)', () => {
  const peerMgr = new PeerManager({
    maxPeersPerTorrent: 3,
    maxGlobalPeers: 10,
    uploadSlots: 2,
    optimisticUnchokeIntervalMs: 60000,
  });

  const infoHash = '4a5c88b2e118b6284f18b3ec48866164287d3d2a';

  afterAll(() => {
    peerMgr.stop();
  });

  it('should add peers up to the max per-torrent limit', () => {
    const p1 = peerMgr.addPeer({ peerId: 'p1', ip: '1.1.1.1', port: 6881, infoHash, pieceCount: 10 });
    const p2 = peerMgr.addPeer({ peerId: 'p2', ip: '1.1.1.2', port: 6881, infoHash, pieceCount: 10 });
    const p3 = peerMgr.addPeer({ peerId: 'p3', ip: '1.1.1.3', port: 6881, infoHash, pieceCount: 10 });
    const p4 = peerMgr.addPeer({ peerId: 'p4', ip: '1.1.1.4', port: 6881, infoHash, pieceCount: 10 });

    expect(p1).not.toBeNull();
    expect(p2).not.toBeNull();
    expect(p3).not.toBeNull();
    expect(p4).toBeNull(); // Exceeds maxPeersPerTorrent (3)
  });

  it('should rank and unchoke fastest peers using Tit-for-Tat algorithm', () => {
    const peers = peerMgr.getPeersForTorrent(infoHash);
    expect(peers.length).toBe(3);

    // Mark all as interested
    peers.forEach((p) => (p.peerInterested = true));

    // Simulate transfer speeds: p2 is fastest (5MB/s), p1 is second (3MB/s), p3 is slowest (1MB/s)
    peerMgr.recordPeerTransfer(infoHash, 'p1', 3 * 1024 * 1024, 0);
    peerMgr.recordPeerTransfer(infoHash, 'p2', 5 * 1024 * 1024, 0);
    peerMgr.recordPeerTransfer(infoHash, 'p3', 1 * 1024 * 1024, 0);

    // Recalculate choke slots (2 upload slots)
    peerMgr.recalculateChokeSlots(infoHash, false);

    const p1 = peers.find((p) => p.peerId === 'p1');
    const p2 = peers.find((p) => p.peerId === 'p2');
    const p3 = peers.find((p) => p.peerId === 'p3');

    // p2 and p1 are the top 2 download providers and should be unchoked
    expect(p2?.amChoking).toBe(false);
    expect(p1?.amChoking).toBe(false);
    // p3 might be optimistically unchoked if picked as the 1 optimistic slot, or choked
    expect(p2?.isOptimisticUnchoke).toBe(false);
    expect(p1?.isOptimisticUnchoke).toBe(false);
  });
});
