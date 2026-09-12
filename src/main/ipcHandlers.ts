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

import { ipcMain } from 'electron';
import {
  AddMagnetRequestSchema,
  TorrentControlRequestSchema,
  CreateSwarmPackageRequestSchema,
  BandwidthSettingsSchema,
  CmmSyncConfigRequestSchema,
  ToggleModelShareRequestSchema,
  IpcResponse,
} from '../shared/ipcContracts';
import { SharingPolicySettingsSchema } from '../protocol/sharingPolicy';
import { swarmEngine } from './engine/swarmEngine';
import { bandwidthScheduler } from './engine/bandwidthScheduler';
import { sharingPolicyManager } from './engine/sharingPolicyManager';
import { cmmDbBridge } from './cmm/cmmDbBridge';
import { cmmFolderRouter } from './cmm/cmmFolderRouter';

export function registerIpcHandlers() {
  // 1. Swarm Management
  ipcMain.handle('swarm:listTorrents', async (): Promise<IpcResponse> => {
    try {
      const torrents = swarmEngine.getActiveTorrents();
      return { success: true, data: torrents };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('swarm:addMagnet', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const validated = AddMagnetRequestSchema.parse(raw);
      const torrent = await swarmEngine.addMagnet(validated);
      return { success: true, data: torrent };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('swarm:pauseTorrent', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const { infoHash } = TorrentControlRequestSchema.parse(raw);
      const ok = swarmEngine.pauseTorrent(infoHash);
      return { success: ok };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('swarm:resumeTorrent', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const { infoHash } = TorrentControlRequestSchema.parse(raw);
      const ok = swarmEngine.resumeTorrent(infoHash);
      return { success: ok };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('swarm:removeTorrent', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const { infoHash } = TorrentControlRequestSchema.parse(raw);
      const ok = swarmEngine.removeTorrent(infoHash);
      return { success: ok };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('swarm:createPackage', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const validated = CreateSwarmPackageRequestSchema.parse(raw);
      const manifest = await swarmEngine.createPackageAndSeed(validated);
      return { success: true, data: manifest };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 2. Bandwidth & System Stats
  ipcMain.handle('bandwidth:getSettings', async (): Promise<IpcResponse> => {
    return { success: true, data: bandwidthScheduler.getSettings() };
  });

  ipcMain.handle('bandwidth:updateSettings', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const validated = BandwidthSettingsSchema.partial().parse(raw);
      bandwidthScheduler.updateSettings(validated);
      return { success: true, data: bandwidthScheduler.getSettings() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('bandwidth:getStats', async (): Promise<IpcResponse> => {
    const activeTorrents = swarmEngine.getActiveTorrents();
    const dls = activeTorrents.filter((t) => t.state === 'downloading').length;
    const seeds = activeTorrents.filter((t) => t.state === 'seeding').length;
    return { success: true, data: bandwidthScheduler.getStats(dls, seeds) };
  });

  // 3. RenegadeCMM Bridge
  ipcMain.handle('cmm:getModels', async (): Promise<IpcResponse> => {
    try {
      const models = await cmmDbBridge.getLocalModels(200);
      return { success: true, data: models };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // 4. Sharing & Privacy Policy (Opt-In by Default)
  ipcMain.handle('sharing:getPolicy', async (): Promise<IpcResponse> => {
    return { success: true, data: sharingPolicyManager.getPolicy() };
  });

  ipcMain.handle('sharing:updatePolicy', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const validated = SharingPolicySettingsSchema.partial().parse(raw);
      const updated = sharingPolicyManager.updatePolicy(validated);
      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sharing:toggleModelShare', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const { modelId, optIn } = ToggleModelShareRequestSchema.parse(raw);
      const ok = sharingPolicyManager.toggleModelOptIn(modelId, optIn);
      return { success: ok, data: { modelId, optIn, policy: sharingPolicyManager.getPolicy() } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
