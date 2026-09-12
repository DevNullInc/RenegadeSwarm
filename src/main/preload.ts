/**
 * RenegadeSwarm - Hardened Context Bridge
 * Context Isolation: true | Node Integration: false | Sandboxed: true
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
  getCmmModels: () => Promise<any>;
  configureCmmSync: (req: CmmSyncConfigRequest) => Promise<any>;
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
  getCmmModels: () => ipcRenderer.invoke('cmm:getModels'),
  configureCmmSync: (req) => ipcRenderer.invoke('cmm:configureSync', req),
};

contextBridge.exposeInMainWorld('renegadeSwarm', api);
