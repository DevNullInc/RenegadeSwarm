/**
 * RenegadeSwarm - Validated IPC Handlers
 * All inputs are parsed and strictly checked with Zod schemas.
 */
import { ipcMain } from 'electron';
import {
  AddMagnetRequestSchema,
  TorrentControlRequestSchema,
  CreateSwarmPackageRequestSchema,
  BandwidthSettingsSchema,
  CmmSyncConfigRequestSchema,
  IpcResponse,
} from '../shared/ipcContracts';
import { swarmEngine } from './engine/swarmEngine';
import { bandwidthScheduler } from './engine/bandwidthScheduler';
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

  ipcMain.handle('cmm:configureSync', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const validated = CmmSyncConfigRequestSchema.parse(raw);
      cmmDbBridge.setCmmDbPath(validated.cmmDbPath);
      cmmFolderRouter.updateConfig({ rootPath: validated.comfyModelsRoot });
      const connected = await cmmDbBridge.attachCmmDatabase();
      return { success: connected, data: { dbConnected: connected } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
