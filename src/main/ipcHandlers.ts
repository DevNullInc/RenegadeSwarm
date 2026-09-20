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

import path from 'path';
import { z } from 'zod';
import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import {
  AddMagnetRequestSchema,
  TorrentControlRequestSchema,
  CreateSwarmPackageRequestSchema,
  CancelPackageJobRequestSchema,
  BandwidthSettingsSchema,
  CmmSyncConfigRequestSchema,
  ToggleModelShareRequestSchema,
  KeyringEntrySchema,
  UpdateUserAliasRequestSchema,
  OpenExternalUrlRequestSchema,
  PreDownloadVerifyRequestSchema,
  DiscoverySearchRequestSchema,
  IpcResponse,
} from '../shared/ipcContracts';
import { SharingPolicySettingsSchema } from '../protocol/sharingPolicy';
import { swarmEngine } from './engine/swarmEngine';
import { packageJobManager } from './engine/packageJobManager';
import { bandwidthScheduler } from './engine/bandwidthScheduler';
import { sharingPolicyManager } from './engine/sharingPolicyManager';
import { keyringManager } from './engine/keyringManager';
import { cmmDbBridge } from './cmm/cmmDbBridge';
import { cmmFolderRouter } from './cmm/cmmFolderRouter';
import { modelMetadataExtractor } from './metadata/modelMetadataExtractor';
import { contentInspector } from './engine/contentInspector';
import { preDownloadVerifier } from './engine/preDownloadVerifier';
import { discoveryEngine } from './engine/discoveryEngine';

let packageProgressBound = false;

export function registerIpcHandlers() {
  if (!packageProgressBound) {
    packageJobManager.on('progress', (progress) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('swarm:packageProgress', progress);
        }
      }
    });
    packageProgressBound = true;
  }
  // Pre-Download Verification Handshake
  ipcMain.handle('swarm:verifyPreDownload', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const validated = PreDownloadVerifyRequestSchema.parse(raw || {});
      const result = await preDownloadVerifier.verifyPreDownload(validated);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
  // File Dialogs & Metadata Extraction
  ipcMain.handle('dialog:openModelFile', async (): Promise<IpcResponse> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select AI Model File',
        buttonLabel: 'Select Model',
        properties: ['openFile'],
        filters: [
          { name: 'AI Models (*.safetensors, *.gguf, *.bin, *.pt, *.onnx)', extensions: ['safetensors', 'gguf', 'bin', 'pt', 'pth', 'onnx', 'ckpt'] },
          { name: 'All Files (*.*)', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'File selection canceled' };
      }

      const filePath = result.filePaths[0];
      cmmFolderRouter.recordSessionDialogPath(filePath);
      const metadata = await modelMetadataExtractor.extractMetadata(filePath);
      return { success: true, data: { filePath, metadata } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dialog:openPreviewFile', async (): Promise<IpcResponse> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Model Preview Image or Video',
        buttonLabel: 'Select Preview Asset',
        properties: ['openFile'],
        filters: [
          { name: 'Images & Media (*.png, *.jpg, *.jpeg, *.webp, *.mp4)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'] },
          { name: 'All Files (*.*)', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'File selection canceled' };
      }

      const filePath = result.filePaths[0];
      cmmFolderRouter.recordSessionDialogPath(filePath);
      const inspection = await contentInspector.inspectFile(filePath);
      return { success: true, data: { filePath, workflowMeta: inspection.metadata } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dialog:openDirectory', async (_, rawOptions?: unknown): Promise<IpcResponse> => {
    try {
      const opts = (typeof rawOptions === 'object' && rawOptions !== null) ? (rawOptions as any) : {};
      const result = await dialog.showOpenDialog({
        title: opts.title || 'Select Model Directory',
        buttonLabel: 'Select Directory',
        properties: ['openDirectory', 'createDirectory'],
        defaultPath: opts.defaultPath,
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Directory selection canceled' };
      }

      const folderPath = result.filePaths[0];
      cmmFolderRouter.recordSessionDialogPath(folderPath);
      return { success: true, data: { folderPath } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('dialog:openSqliteFile', async (): Promise<IpcResponse> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select RenegadeCMM SQLite Database (renegadecmm.sqlite)',
        buttonLabel: 'Select Database',
        properties: ['openFile'],
        filters: [
          { name: 'SQLite Database (*.sqlite, *.db)', extensions: ['sqlite', 'db', 'sqlite3'] },
          { name: 'All Files (*.*)', extensions: ['*'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'File selection canceled' };
      }

      const filePath = result.filePaths[0];
      cmmFolderRouter.recordSessionDialogPath(filePath);
      return { success: true, data: { filePath } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('model:extractMetadata', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      if (typeof raw !== 'string' || !raw.trim()) throw new Error('Invalid file path');
      if (!cmmFolderRouter.isPathAllowed(raw)) {
        throw new Error('Path access denied by security confinement policy');
      }
      const metadata = await modelMetadataExtractor.extractMetadata(raw);
      return { success: true, data: metadata };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
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
      if (validated.customDestination && !cmmFolderRouter.isPathAllowed(validated.customDestination)) {
        throw new Error('Download destination denied by security confinement policy');
      }
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
      if (!cmmFolderRouter.isPathAllowed(validated.modelFilePath)) {
        throw new Error('Model file path denied by security confinement policy');
      }
      if (validated.previewFilePath && !cmmFolderRouter.isPathAllowed(validated.previewFilePath)) {
        throw new Error('Preview file path denied by security confinement policy');
      }
      const manifest = await swarmEngine.createPackageAndSeed(validated);
      return { success: true, data: manifest };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('swarm:startPackageJob', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const validated = CreateSwarmPackageRequestSchema.parse(raw);
      if (!cmmFolderRouter.isPathAllowed(validated.modelFilePath)) {
        throw new Error('Model file path denied by security confinement policy');
      }
      if (validated.previewFilePath && !cmmFolderRouter.isPathAllowed(validated.previewFilePath)) {
        throw new Error('Preview file path denied by security confinement policy');
      }
      const job = await packageJobManager.startJob(validated);
      return { success: true, data: job };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('swarm:getActivePackagingJob', async (): Promise<IpcResponse> => {
    try {
      const job = packageJobManager.getActiveJob();
      return { success: true, data: job };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('swarm:cancelPackagingJob', async (_, raw?: unknown): Promise<IpcResponse> => {
    try {
      let jobId: string | undefined;
      if (raw && typeof raw === 'object') {
        const validated = CancelPackageJobRequestSchema.partial().parse(raw);
        jobId = validated.jobId;
      }
      const ok = packageJobManager.cancelJob(jobId);
      return { success: ok };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('swarm:clearPackagingJob', async (): Promise<IpcResponse> => {
    try {
      const ok = packageJobManager.clearJob();
      return { success: ok };
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

  // 3. RenegadeCMM Bridge & Model Folder Management
  ipcMain.handle('cmm:getStatus', async (): Promise<IpcResponse> => {
    try {
      const status = await cmmDbBridge.checkCmmStatus();
      if (status.connected) {
        if (status.comfyuiFolders || status.comfyuiRoot) {
          cmmFolderRouter.syncCmmFolders(status.comfyuiFolders || [], status.comfyuiRoot);
        }
        if (status.folderMappings) {
          cmmFolderRouter.updateConfig({ folderMappings: status.folderMappings });
        }
      }
      // Load persisted settings
      const persisted = await cmmDbBridge.getPersistedAppSettings();
      if (persisted.customFolders && persisted.customFolders.length > 0) {
        for (const cf of persisted.customFolders) {
          cmmFolderRouter.addCustomFolder(cf);
        }
      }
      if (persisted.defaultFolder) {
        cmmFolderRouter.setDefaultDownloadFolder(persisted.defaultFolder);
      }
      return { success: true, data: status };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cmm:configureSync', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const { cmmDbPath, comfyModelsRoot, defaultDownloadFolder } = CmmSyncConfigRequestSchema.parse(raw);
      if (!cmmFolderRouter.isPathAllowed(cmmDbPath)) {
        throw new Error('CMM SQLite database path denied by security confinement policy');
      }
      if (comfyModelsRoot && !cmmFolderRouter.isPathAllowed(comfyModelsRoot)) {
        throw new Error('ComfyUI models root path denied by security confinement policy');
      }
      if (defaultDownloadFolder && !cmmFolderRouter.isPathAllowed(defaultDownloadFolder)) {
        throw new Error('Default download folder denied by security confinement policy');
      }
      cmmDbBridge.setCmmDbPath(cmmDbPath);
      if (comfyModelsRoot) {
        cmmFolderRouter.updateConfig({ rootPath: comfyModelsRoot });
      }
      if (defaultDownloadFolder) {
        cmmFolderRouter.setDefaultDownloadFolder(defaultDownloadFolder);
      }
      const status = await cmmDbBridge.checkCmmStatus();
      if (status.connected && (status.comfyuiFolders || status.comfyuiRoot)) {
        cmmFolderRouter.syncCmmFolders(status.comfyuiFolders || [], status.comfyuiRoot);
      }
      return { success: status.connected, data: status };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cmm:getModelFolders', async (): Promise<IpcResponse> => {
    try {
      const entries = cmmFolderRouter.getModelFolderEntries();
      const cfg = cmmFolderRouter.getConfig();
      return {
        success: true,
        data: {
          folders: entries,
          defaultFolder: cfg.defaultDownloadFolder || cfg.rootPath || (entries[0]?.path || ''),
          rootPath: cfg.rootPath,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cmm:addModelFolder', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      if (typeof raw !== 'string' || !raw.trim()) {
        throw new Error('Valid folder path is required');
      }
      const trimmed = raw.trim();
      if (!cmmFolderRouter.isPathAllowed(trimmed)) {
        throw new Error('Folder path denied by security confinement policy');
      }
      const ok = cmmFolderRouter.addCustomFolder(trimmed);
      if (!ok) {
        throw new Error('Folder is already in the model folders list or invalid.');
      }
      // Persist to DB
      const cfg = cmmFolderRouter.getConfig();
      await cmmDbBridge.savePersistedAppSettings({
        customFolders: cfg.customFolders,
        defaultFolder: cfg.defaultDownloadFolder,
      });

      const entries = cmmFolderRouter.getModelFolderEntries();
      return {
        success: true,
        data: {
          folders: entries,
          defaultFolder: cfg.defaultDownloadFolder,
          rootPath: cfg.rootPath,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cmm:removeModelFolder', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      if (typeof raw !== 'string' || !raw.trim()) {
        throw new Error('Valid folder path is required');
      }
      cmmFolderRouter.removeModelFolder(raw.trim());
      const cfg = cmmFolderRouter.getConfig();
      await cmmDbBridge.savePersistedAppSettings({
        customFolders: cfg.customFolders,
        defaultFolder: cfg.defaultDownloadFolder,
      });

      const entries = cmmFolderRouter.getModelFolderEntries();
      return {
        success: true,
        data: {
          folders: entries,
          defaultFolder: cfg.defaultDownloadFolder,
          rootPath: cfg.rootPath,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cmm:setDefaultDownloadFolder', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      if (typeof raw !== 'string' || !raw.trim()) {
        throw new Error('Valid folder path is required');
      }
      const trimmed = raw.trim();
      if (!cmmFolderRouter.isPathAllowed(trimmed)) {
        throw new Error('Folder path denied by security confinement policy');
      }
      const ok = cmmFolderRouter.setDefaultDownloadFolder(trimmed);
      const cfg = cmmFolderRouter.getConfig();
      await cmmDbBridge.savePersistedAppSettings({
        defaultFolder: cfg.defaultDownloadFolder,
      });

      const entries = cmmFolderRouter.getModelFolderEntries();
      return {
        success: ok,
        data: {
          folders: entries,
          defaultFolder: cfg.defaultDownloadFolder,
          rootPath: cfg.rootPath,
        },
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

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
      // Strip excludedDirectoryPaths from general updatePolicy to enforce privileged dialog boundary
      const { excludedDirectoryPaths, ...safeUpdates } = validated;
      const updated = sharingPolicyManager.updatePolicy(safeUpdates);
      return { success: true, data: updated };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sharing:addBlacklistDir', async (): Promise<IpcResponse> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Directory to Blacklist from Swarm Sharing',
        buttonLabel: 'Blacklist Directory',
        properties: ['openDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Directory selection canceled' };
      }

      const rawPath = result.filePaths[0];
      const resolvedPath = path.resolve(rawPath);
      cmmFolderRouter.recordSessionDialogPath(resolvedPath);
      const updatedPolicy = sharingPolicyManager.addBlacklistDirectory(resolvedPath);
      return { success: true, data: updatedPolicy };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sharing:removeBlacklistDir', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const { dirPath } = z.object({ dirPath: z.string().min(1) }).parse(raw);
      const updatedPolicy = sharingPolicyManager.removeBlacklistDirectory(dirPath);
      return { success: true, data: updatedPolicy };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sharing:removeBlacklistPattern', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const { pattern } = z.object({ pattern: z.string().min(1) }).parse(raw);
      const updatedPolicy = sharingPolicyManager.removeBlacklistPattern(pattern);
      return { success: true, data: updatedPolicy };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('sharing:restoreDefaultBlacklist', async (): Promise<IpcResponse> => {
    try {
      const updatedPolicy = sharingPolicyManager.restoreDefaultBlacklist();
      return { success: true, data: updatedPolicy };
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

  // 5. Keyring, Web of Trust & User Identity
  ipcMain.handle('keyring:getEntries', async (): Promise<IpcResponse> => {
    try {
      const entries = keyringManager.getEntries();
      return { success: true, data: entries };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('keyring:addEntry', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const validated = KeyringEntrySchema.parse(raw);
      keyringManager.addEntry(validated);
      return { success: true, data: keyringManager.getEntries() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('keyring:removeEntry', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      if (typeof raw !== 'string') throw new Error('Public key hex required');
      const ok = keyringManager.removeEntry(raw);
      return { success: ok, data: keyringManager.getEntries() };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('keyring:export', async (): Promise<IpcResponse> => {
    try {
      const exported = keyringManager.exportKeyring();
      return { success: true, data: exported };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('keyring:import', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      if (typeof raw !== 'string') throw new Error('JSON string required');
      const count = keyringManager.importKeyring(raw);
      return { success: true, data: { importedCount: count, entries: keyringManager.getEntries() } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('keyring:getUserIdentity', async (): Promise<IpcResponse> => {
    try {
      const identity = keyringManager.getUserIdentity();
      return { success: true, data: identity };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('keyring:updateUserAlias', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const validated = UpdateUserAliasRequestSchema.parse(raw);
      const saved = keyringManager.updateUserAlias(validated.creatorName);
      return { success: true, data: saved };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('keyring:generateIdentity', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const creatorName = typeof raw === 'string' ? raw : 'Renegade Creator';
      const identity = keyringManager.generateNewIdentity(creatorName);
      return { success: true, data: identity };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('keyring:getLockoutStatus', async (): Promise<IpcResponse> => {
    try {
      const status = keyringManager.getLockoutStatus();
      return { success: true, data: status };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('shell:openExternal', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const { url } = OpenExternalUrlRequestSchema.parse(raw);
      await shell.openExternal(url);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // P2P Model Search & Discovery Handlers (Milestone 1)
  ipcMain.handle('swarm:searchDiscoveredModels', async (_, raw: unknown): Promise<IpcResponse> => {
    try {
      const { query, modelType, baseModel, verifiedOnly, limit } = DiscoverySearchRequestSchema.parse(raw || {});
      const results = await discoveryEngine.search(query, {
        modelType,
        baseModel,
        verifiedOnly,
        limit,
      });
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('swarm:getDiscoveryStats', async (): Promise<IpcResponse> => {
    try {
      const stats = discoveryEngine.getStats();
      return { success: true, data: stats };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}


