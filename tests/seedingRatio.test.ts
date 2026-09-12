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
import { BandwidthScheduler } from '../src/main/engine/bandwidthScheduler';

describe('Bandwidth Token Bucket & Seeding Ratio Governance (Rules 11 & 14)', () => {
  it('should enforce Token Bucket limits when downloading', () => {
    const scheduler = new BandwidthScheduler({
      maxDownloadSpeedKbps: 100, // 100 KB/s limit
    });

    // Request 50KB -> Allowed
    const firstReq = scheduler.consumeBandwidth(50 * 1024, 'download');
    expect(firstReq.allowed).toBe(true);
    expect(firstReq.grantedBytes).toBe(50 * 1024);
  });

  it('should track per-torrent ratio and automatically flag seeding halt when threshold is reached', () => {
    const scheduler = new BandwidthScheduler({
      seedingRatioLimit: 2.0, // 200% ratio target
    });

    const infoHash = '4a5c88b2e118b6284f18b3ec48866164287d3d2a';

    // Downloaded 1GB, Uploaded 500MB -> Ratio = 0.5 (Seeding should continue)
    const state1 = scheduler.recordTorrentTransfer(infoHash, 1024 * 1024 * 1024, 512 * 1024 * 1024);
    expect(state1.ratio).toBe(0.5);
    expect(state1.isSeedingHalted).toBe(false);

    // Uploaded another 1.6GB (Total Uploaded = 2.1GB) -> Ratio = 2.05 (Target reached)
    const state2 = scheduler.recordTorrentTransfer(infoHash, 0, 1600 * 1024 * 1024);
    expect(state2.ratio).toBeGreaterThanOrEqual(2.0);
    expect(state2.isSeedingHalted).toBe(true);
    expect(state2.seedingHaltedReason).toContain('Target ratio reached');
    expect(scheduler.shouldHaltSeeding(infoHash)).toBe(true);
  });
});
