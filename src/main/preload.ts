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

import { contextBridge, ipcRenderer } from 'electron';
import {
  AddMagnetRequest,
  TorrentControlRequest,
  CreateSwarmPackageRequest,
  BandwidthSettings,
  CmmSyncConfigRequest,
} from '../shared/ipcContracts';

export interface RenegadeSwarmApi {
  listTorrents: () => Promise<any>;
  addMagnet: (req: AddMagnetRequest) => Promise<any>;
  pauseTorrent: (req: TorrentControlRequest) => Promise<any>;
  resumeTorrent: (req: TorrentControlRequest) => Promise<any>;
  removeTorrent: (req: TorrentControlRequest) => Promise<any>;
  createPackage: (req: CreateSwarmPackageRequest) => Promise<any>;
  getBandwidthSettings: () => Promise<any>;
  updateBandwidthSettings: (settings: Partial<BandwidthSettings>) => Promise<any>;
  getBandwidthStats: () => Promise<any>;
  getCmmStatus: () => Promise<any>;
  getCmmModels: () => Promise<any>;
  configureCmmSync: (req: CmmSyncConfigRequest) => Promise<any>;
  getSharingPolicy: () => Promise<any>;
  updateSharingPolicy: (settings: any) => Promise<any>;
  toggleModelShare: (req: { modelId: string; optIn: boolean }) => Promise<any>;
  browseModelFile: () => Promise<any>;
  browsePreviewFile: () => Promise<any>;
  browseDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<any>;
  browseSqliteFile: () => Promise<any>;
  getModelFolders: () => Promise<any>;
  addModelFolder: (folderPath: string) => Promise<any>;
  removeModelFolder: (folderPath: string) => Promise<any>;
  setDefaultDownloadFolder: (folderPath: string) => Promise<any>;
  extractModelMetadata: (filePath: string) => Promise<any>;
  getKeyringEntries: () => Promise<any>;
  addKeyringEntry: (entry: any) => Promise<any>;
  removeKeyringEntry: (publicKeyHex: string) => Promise<any>;
  exportKeyring: () => Promise<any>;
  importKeyring: (jsonString: string) => Promise<any>;
  getUserIdentity: () => Promise<any>;
  setUserIdentity: (identity: any) => Promise<any>;
  generateIdentity: (creatorName: string) => Promise<any>;
  getKeyringLockoutStatus: () => Promise<any>;
  generateKeyPair: () => Promise<any>;
  openExternal: (url: string) => Promise<any>;
  verifyPreDownload: (req: any) => Promise<any>;
  searchDiscoveredModels: (req: any) => Promise<any>;
  getDiscoveryStats: () => Promise<any>;
}

const api: RenegadeSwarmApi = {
  listTorrents: () => ipcRenderer.invoke('swarm:listTorrents'),
  addMagnet: (req) => ipcRenderer.invoke('swarm:addMagnet', req),
  pauseTorrent: (req) => ipcRenderer.invoke('swarm:pauseTorrent', req),
  resumeTorrent: (req) => ipcRenderer.invoke('swarm:resumeTorrent', req),
  removeTorrent: (req) => ipcRenderer.invoke('swarm:removeTorrent', req),
  createPackage: (req) => ipcRenderer.invoke('swarm:createPackage', req),
  getBandwidthSettings: () => ipcRenderer.invoke('bandwidth:getSettings'),
  updateBandwidthSettings: (settings) => ipcRenderer.invoke('bandwidth:updateSettings', settings),
  getBandwidthStats: () => ipcRenderer.invoke('bandwidth:getStats'),
  getCmmStatus: () => ipcRenderer.invoke('cmm:getStatus'),
  getCmmModels: () => ipcRenderer.invoke('cmm:getModels'),
  configureCmmSync: (req) => ipcRenderer.invoke('cmm:configureSync', req),
  getSharingPolicy: () => ipcRenderer.invoke('sharing:getPolicy'),
  updateSharingPolicy: (settings) => ipcRenderer.invoke('sharing:updatePolicy', settings),
  toggleModelShare: (req) => ipcRenderer.invoke('sharing:toggleModelShare', req),
  browseModelFile: () => ipcRenderer.invoke('dialog:openModelFile'),
  browsePreviewFile: () => ipcRenderer.invoke('dialog:openPreviewFile'),
  browseDirectory: (options) => ipcRenderer.invoke('dialog:openDirectory', options),
  browseSqliteFile: () => ipcRenderer.invoke('dialog:openSqliteFile'),
  getModelFolders: () => ipcRenderer.invoke('cmm:getModelFolders'),
  addModelFolder: (folderPath) => ipcRenderer.invoke('cmm:addModelFolder', folderPath),
  removeModelFolder: (folderPath) => ipcRenderer.invoke('cmm:removeModelFolder', folderPath),
  setDefaultDownloadFolder: (folderPath) => ipcRenderer.invoke('cmm:setDefaultDownloadFolder', folderPath),
  extractModelMetadata: (filePath) => ipcRenderer.invoke('model:extractMetadata', filePath),
  getKeyringEntries: () => ipcRenderer.invoke('keyring:getEntries'),
  addKeyringEntry: (entry) => ipcRenderer.invoke('keyring:addEntry', entry),
  removeKeyringEntry: (publicKeyHex) => ipcRenderer.invoke('keyring:removeEntry', publicKeyHex),
  exportKeyring: () => ipcRenderer.invoke('keyring:export'),
  importKeyring: (jsonString) => ipcRenderer.invoke('keyring:import', jsonString),
  getUserIdentity: () => ipcRenderer.invoke('keyring:getUserIdentity'),
  setUserIdentity: (identity) => ipcRenderer.invoke('keyring:setUserIdentity', identity),
  generateIdentity: (creatorName) => ipcRenderer.invoke('keyring:generateIdentity', creatorName),
  getKeyringLockoutStatus: () => ipcRenderer.invoke('keyring:getLockoutStatus'),
  generateKeyPair: () => ipcRenderer.invoke('crypto:generateKeyPair'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', { url }),
  verifyPreDownload: (req) => ipcRenderer.invoke('swarm:verifyPreDownload', req),
  searchDiscoveredModels: (req) => ipcRenderer.invoke('swarm:searchDiscoveredModels', req),
  getDiscoveryStats: () => ipcRenderer.invoke('swarm:getDiscoveryStats'),
};

contextBridge.exposeInMainWorld('renegadeSwarm', api);

