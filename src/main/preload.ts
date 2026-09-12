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
};

contextBridge.exposeInMainWorld('renegadeSwarm', api);
