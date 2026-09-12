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

import { useState, useEffect } from 'react';
import { Navbar, TabId } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { SeederView } from './components/SeederView';
import { CmmSyncView } from './components/CmmSyncView';
import { BandwidthView } from './components/BandwidthView';
import { SwarmTorrentStatus } from '../protocol/types';
import { BandwidthSettings, CreateSwarmPackageRequest } from '../shared/ipcContracts';
import { SharingPolicySettings, DEFAULT_SHARING_POLICY } from '../protocol/sharingPolicy';
import { CmmLocalModelRow } from '../main/cmm/cmmDbBridge';

declare global {
  interface Window {
    renegadeSwarm?: {
      listTorrents: () => Promise<{ success: boolean; data?: SwarmTorrentStatus[]; error?: string }>;
      addMagnet: (req: any) => Promise<{ success: boolean; data?: SwarmTorrentStatus; error?: string }>;
      pauseTorrent: (req: any) => Promise<{ success: boolean; error?: string }>;
      resumeTorrent: (req: any) => Promise<{ success: boolean; error?: string }>;
      removeTorrent: (req: any) => Promise<{ success: boolean; error?: string }>;
      createPackage: (req: any) => Promise<{ success: boolean; data?: any; error?: string }>;
      getBandwidthSettings: () => Promise<{ success: boolean; data?: BandwidthSettings; error?: string }>;
      updateBandwidthSettings: (settings: Partial<BandwidthSettings>) => Promise<{ success: boolean; data?: BandwidthSettings; error?: string }>;
      getBandwidthStats: () => Promise<{ success: boolean; data?: any; error?: string }>;
      getCmmStatus: () => Promise<{
        success: boolean;
        data?: {
          connected: boolean;
          dbPath: string;
          modelCount: number;
          isProcessRunning: boolean;
          lastChecked: number;
        };
        error?: string;
      }>;
      getCmmModels: () => Promise<{ success: boolean; data?: CmmLocalModelRow[]; error?: string }>;
      configureCmmSync: (req: any) => Promise<{ success: boolean; data?: any; error?: string }>;
      getSharingPolicy: () => Promise<{ success: boolean; data?: SharingPolicySettings; error?: string }>;
      updateSharingPolicy: (settings: any) => Promise<{ success: boolean; data?: SharingPolicySettings; error?: string }>;
      toggleModelShare: (req: { modelId: string; optIn: boolean }) => Promise<{ success: boolean; data?: any; error?: string }>;
    };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [torrents, setTorrents] = useState<SwarmTorrentStatus[]>([]);
  const [bandwidthSettings, setBandwidthSettings] = useState<BandwidthSettings>({
    maxDownloadSpeedKbps: 0,
    maxUploadSpeedKbps: 0,
    maxActiveDownloads: 3,
    maxActiveSeeds: 10,
    seedingRatioLimit: 2.0,
    backgroundSeedingEnabled: true,
    listenPort: 6881,
    enableDht: true,
  });
  const [sharingPolicy, setSharingPolicy] = useState<SharingPolicySettings>(DEFAULT_SHARING_POLICY);
  const [downloadSpeedStr, setDownloadSpeedStr] = useState('0 MB/s');
  const [uploadSpeedStr, setUploadSpeedStr] = useState('0 MB/s');
  const [cmmModels, setCmmModels] = useState<CmmLocalModelRow[]>([]);
  const [cmmConnected, setCmmConnected] = useState(false);
  const [cmmModelCount, setCmmModelCount] = useState(0);
  const [cmmDbPath, setCmmDbPath] = useState('D:\\gitprojects\\RenegadeCMM\\renegadecmm.sqlite');
  const [comfyModelsRoot, setComfyModelsRoot] = useState('D:\\ComfyUI\\models');

  const formatSpeed = (bps: number) => {
    if (!bps) return '0 KB/s';
    const mbps = bps / (1024 * 1024);
    if (mbps >= 1) return `${mbps.toFixed(1)} MB/s`;
    return `${(bps / 1024).toFixed(0)} KB/s`;
  };

  const fetchTorrents = async () => {
    if (window.renegadeSwarm) {
      const res = await window.renegadeSwarm.listTorrents();
      if (res.success && res.data) {
        setTorrents(res.data);
      }
      const stats = await window.renegadeSwarm.getBandwidthStats();
      if (stats.success && stats.data) {
        setDownloadSpeedStr(formatSpeed(stats.data.currentDownloadSpeedBps));
        setUploadSpeedStr(formatSpeed(stats.data.currentUploadSpeedBps));
      }
    }
  };

  const checkCmmStatus = async () => {
    if (window.renegadeSwarm) {
      try {
        const res = await window.renegadeSwarm.getCmmStatus();
        if (res.success && res.data) {
          const wasConnected = cmmConnected;
          const isNowConnected = res.data.connected;
          setCmmConnected(isNowConnected);
          setCmmModelCount(res.data.modelCount || 0);

          if (res.data.dbPath && res.data.dbPath !== cmmDbPath) {
            setCmmDbPath(res.data.dbPath);
          }

          // If CMM status newly transitioned to connected or count changed, auto-refresh models
          if (!wasConnected && isNowConnected) {
            fetchCmmModels();
          }
        }
      } catch {
        setCmmConnected(false);
      }
    }
  };

  const fetchCmmModels = async () => {
    if (window.renegadeSwarm) {
      const res = await window.renegadeSwarm.getCmmModels();
      if (res.success && res.data) {
        setCmmModels(res.data);
        setCmmModelCount(res.data.length);
        if (res.data.length > 0) {
          setCmmConnected(true);
        }
      }
    }
  };

  const fetchSharingPolicy = async () => {
    if (window.renegadeSwarm) {
      const res = await window.renegadeSwarm.getSharingPolicy();
      if (res.success && res.data) {
        setSharingPolicy(res.data);
      }
    }
  };

  useEffect(() => {
    fetchTorrents();
    checkCmmStatus();
    fetchCmmModels();
    fetchSharingPolicy();

    // 1-second interval for real-time torrent telemetry
    const torrentInterval = setInterval(fetchTorrents, 1000);
    // 5-second polling check to detect if CMM is running/connected on the machine
    const cmmInterval = setInterval(checkCmmStatus, 5000);

    const onFocus = () => {
      checkCmmStatus();
      fetchTorrents();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(torrentInterval);
      clearInterval(cmmInterval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const handleAddMagnet = async (magnetUri: string) => {
    if (window.renegadeSwarm) {
      await window.renegadeSwarm.addMagnet({ magnetUri, autoOrganizeComfy: true });
      fetchTorrents();
    }
  };

  const handlePause = (infoHash: string) => {
    if (window.renegadeSwarm) {
      window.renegadeSwarm.pauseTorrent({ infoHash });
      fetchTorrents();
    }
  };

  const handleResume = (infoHash: string) => {
    if (window.renegadeSwarm) {
      window.renegadeSwarm.resumeTorrent({ infoHash });
      fetchTorrents();
    }
  };

  const handleRemove = (infoHash: string) => {
    if (window.renegadeSwarm) {
      window.renegadeSwarm.removeTorrent({ infoHash });
      fetchTorrents();
    }
  };

  const handleCreatePackage = async (req: CreateSwarmPackageRequest) => {
    if (window.renegadeSwarm) {
      const res = await window.renegadeSwarm.createPackage(req);
      if (!res.success) {
        throw new Error(res.error || 'Failed to create package');
      }
      fetchTorrents();
      fetchSharingPolicy();
      return res.data;
    }
    return {} as any;
  };

  const handleSyncCmmConfig = async (dbPath: string, rootPath: string) => {
    setCmmDbPath(dbPath);
    setComfyModelsRoot(rootPath);
    if (window.renegadeSwarm) {
      const res = await window.renegadeSwarm.configureCmmSync({
        cmmDbPath: dbPath,
        comfyModelsRoot: rootPath,
        autoImportDownloaded: true,
      });
      const connected = res.success && res.data?.dbConnected;
      setCmmConnected(connected);
      if (connected) {
        fetchCmmModels();
      }
      return connected;
    }
    return false;
  };

  const handleUpdateBandwidth = async (newSettings: Partial<BandwidthSettings>) => {
    if (window.renegadeSwarm) {
      const res = await window.renegadeSwarm.updateBandwidthSettings(newSettings);
      if (res.success && res.data) {
        setBandwidthSettings(res.data);
      }
    }
  };

  const handleUpdateSharingPolicy = async (newPolicy: Partial<SharingPolicySettings>) => {
    if (window.renegadeSwarm) {
      const res = await window.renegadeSwarm.updateSharingPolicy(newPolicy);
      if (res.success && res.data) {
        setSharingPolicy(res.data);
      }
    }
  };

  const handleToggleModelShare = async (modelId: string, optIn: boolean) => {
    if (window.renegadeSwarm) {
      const res = await window.renegadeSwarm.toggleModelShare({ modelId, optIn });
      if (res.success && res.data?.policy) {
        setSharingPolicy(res.data.policy);
      }
    } else {
      // Local state fallback for mock preview
      const opted = new Set(sharingPolicy.optedInModelIds);
      if (optIn) opted.add(modelId);
      else opted.delete(modelId);
      setSharingPolicy({ ...sharingPolicy, optedInModelIds: Array.from(opted) });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--bg-main)' }}>
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        downloadSpeed={downloadSpeedStr}
        uploadSpeed={uploadSpeedStr}
        cmmConnected={cmmConnected}
        cmmModelCount={cmmModelCount}
      />

      <main style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'dashboard' && (
          <DashboardView
            torrents={torrents}
            onAddMagnet={handleAddMagnet}
            onPause={handlePause}
            onResume={handleResume}
            onRemove={handleRemove}
          />
        )}
        {activeTab === 'seeder' && (
          <SeederView
            onCreatePackage={handleCreatePackage}
          />
        )}
        {activeTab === 'cmm' && (
          <CmmSyncView
            cmmDbPath={cmmDbPath}
            comfyModelsRoot={comfyModelsRoot}
            models={cmmModels}
            sharingPolicy={sharingPolicy}
            onSyncConfig={handleSyncCmmConfig}
            onRefreshModels={fetchCmmModels}
            onQuickSeed={() => {
              setActiveTab('seeder');
            }}
            onToggleModelShare={handleToggleModelShare}
          />
        )}
        {activeTab === 'bandwidth' && (
          <BandwidthView
            settings={bandwidthSettings}
            sharingPolicy={sharingPolicy}
            onUpdateSettings={handleUpdateBandwidth}
            onUpdateSharingPolicy={handleUpdateSharingPolicy}
          />
        )}
      </main>
    </div>
  );
}
