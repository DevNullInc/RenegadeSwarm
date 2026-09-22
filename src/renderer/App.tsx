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

import { useState, useEffect, useRef } from 'react';
import { Navbar, TabId } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { DiscoveryView } from './components/DiscoveryView';
import { SeederView } from './components/SeederView';
import { CmmSyncView } from './components/CmmSyncView';
import { BandwidthView } from './components/BandwidthView';
import { SettingsView } from './components/SettingsView';
import { AboutView } from './components/AboutView';
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
      reannounceTorrent: (req: any) => Promise<{ success: boolean; data?: any; error?: string }>;
      createPackage: (req: any) => Promise<{ success: boolean; data?: any; error?: string }>;
      getBandwidthSettings: () => Promise<{ success: boolean; data?: BandwidthSettings; error?: string }>;
      updateBandwidthSettings: (settings: Partial<BandwidthSettings>) => Promise<{ success: boolean; data?: BandwidthSettings; error?: string }>;
      getBandwidthStats: () => Promise<{ success: boolean; data?: any; error?: string }>;
      getCmmStatus: () => Promise<{
        success: boolean;
        data?: {
          connected: boolean;
          discovered: boolean;
          dbPath: string;
          modelCount: number;
          isProcessRunning: boolean;
          lastChecked: number;
          comfyuiRoot?: string;
          comfyuiFolders?: string[];
          comfyuiInstallDir?: string;
          folderMappings?: Record<string, string>;
        };
        error?: string;
      }>;
      autoDetectCmm: () => Promise<{
        success: boolean;
        data?: {
          connected: boolean;
          discovered: boolean;
          dbPath: string;
          modelCount: number;
          isProcessRunning: boolean;
          lastChecked: number;
          comfyuiRoot?: string;
          comfyuiFolders?: string[];
          comfyuiInstallDir?: string;
          folderMappings?: Record<string, string>;
        };
        error?: string;
      }>;
      getCmmModels: () => Promise<{ success: boolean; data?: CmmLocalModelRow[]; error?: string }>;
      configureCmmSync: (req: any) => Promise<{ success: boolean; data?: any; error?: string }>;
      getSharingPolicy: () => Promise<{ success: boolean; data?: SharingPolicySettings; error?: string }>;
      updateSharingPolicy: (settings: any) => Promise<{ success: boolean; data?: SharingPolicySettings; error?: string }>;
      addBlacklistDirectory: () => Promise<{ success: boolean; data?: SharingPolicySettings; error?: string }>;
      removeBlacklistDirectory: (dirPath: string) => Promise<{ success: boolean; data?: SharingPolicySettings; error?: string }>;
      removeBlacklistPattern: (pattern: string) => Promise<{ success: boolean; data?: SharingPolicySettings; error?: string }>;
      restoreDefaultBlacklist: () => Promise<{ success: boolean; data?: SharingPolicySettings; error?: string }>;
      toggleModelShare: (req: { modelId: string; optIn: boolean }) => Promise<{ success: boolean; data?: any; error?: string }>;
      browseModelFile: () => Promise<{ success: boolean; data?: { filePath: string; metadata: any }; error?: string }>;
      browsePreviewFile: () => Promise<{ success: boolean; data?: { filePath: string; workflowMeta?: any }; error?: string }>;
      browseDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<{ success: boolean; data?: { folderPath: string }; error?: string }>;
      browseSqliteFile: () => Promise<{ success: boolean; data?: { filePath: string }; error?: string }>;
      getModelFolders: () => Promise<{ success: boolean; data?: { folders: import('../shared/ipcContracts').ModelFolderEntry[]; defaultFolder: string; rootPath: string }; error?: string }>;
      addModelFolder: (folderPath: string) => Promise<{ success: boolean; data?: { folders: import('../shared/ipcContracts').ModelFolderEntry[]; defaultFolder: string; rootPath: string }; error?: string }>;
      removeModelFolder: (folderPath: string) => Promise<{ success: boolean; data?: { folders: import('../shared/ipcContracts').ModelFolderEntry[]; defaultFolder: string; rootPath: string }; error?: string }>;
      setDefaultDownloadFolder: (folderPath: string) => Promise<{ success: boolean; data?: { folders: import('../shared/ipcContracts').ModelFolderEntry[]; defaultFolder: string; rootPath: string }; error?: string }>;
      extractModelMetadata: (filePath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
      getKeyringEntries: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
      addKeyringEntry: (entry: any) => Promise<{ success: boolean; data?: any[]; error?: string }>;
      removeKeyringEntry: (publicKeyHex: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
      exportKeyring: () => Promise<{ success: boolean; data?: string; error?: string }>;
      importKeyring: (jsonString: string) => Promise<{ success: boolean; data?: { importedCount: number; entries: any[] }; error?: string }>;
      getUserIdentity: () => Promise<{ success: boolean; data?: import('../shared/ipcContracts').UserIdentityPublic; error?: string }>;
      updateUserAlias: (req: import('../shared/ipcContracts').UpdateUserAliasRequest) => Promise<{ success: boolean; data?: import('../shared/ipcContracts').UserIdentityPublic; error?: string }>;
      generateIdentity: (creatorName: string) => Promise<{ success: boolean; data?: import('../shared/ipcContracts').UserIdentityPublic; error?: string }>;
      getKeyringLockoutStatus: () => Promise<{ success: boolean; data?: import('../shared/ipcContracts').LockoutStatus; error?: string }>;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      verifyPreDownload: (req: import('../shared/ipcContracts').PreDownloadVerifyRequest) => Promise<{ success: boolean; data?: import('../shared/ipcContracts').PreDownloadVerificationResult; error?: string }>;
      searchDiscoveredModels: (req: import('../shared/ipcContracts').DiscoverySearchRequest) => Promise<{ success: boolean; data?: import('../protocol/discoveryTypes').DiscoveredModelWithTrust[]; error?: string }>;
      getDiscoveryStats: () => Promise<{ success: boolean; data?: { connectedDiscoveryPeers: number; indexedLocalModels: number; cachedDiscoveredModels: number; totalQueriesProcessed: number }; error?: string }>;
      startPackageJob: (req: import('../shared/ipcContracts').CreateSwarmPackageRequest) => Promise<{ success: boolean; data?: import('../shared/ipcContracts').PackageJobProgress; error?: string }>;
      getActivePackagingJob: () => Promise<{ success: boolean; data?: import('../shared/ipcContracts').PackageJobProgress | null; error?: string }>;
      cancelPackagingJob: (jobId?: string) => Promise<{ success: boolean; error?: string }>;
      clearPackagingJob: () => Promise<{ success: boolean; error?: string }>;
      onPackageProgress: (callback: (progress: import('../shared/ipcContracts').PackageJobProgress) => void) => () => void;
      onCmmSisterWakeup?: (callback: (payload: { source: string; ts: number }) => void) => () => void;
      getSystemDiagnostics?: () => Promise<{ success: boolean; data?: import('../shared/ipcContracts').SystemDiagnostics; error?: string }>;
      getLogEvents?: (req?: { level?: string; limit?: number }) => Promise<{ success: boolean; data?: import('../shared/ipcContracts').DiagnosticLogEvent[]; error?: string }>;
      clearLogEvents?: () => Promise<{ success: boolean; error?: string }>;
      getTabTelemetry?: (tabId: string) => Promise<{ success: boolean; data?: import('../shared/ipcContracts').TabTelemetry; error?: string }>;
      onDebugLog?: (callback: (event: import('../shared/ipcContracts').DiagnosticLogEvent) => void) => () => void;
    };
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [devMode, setDevMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('renegadeswarm_devmode') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleDevMode = () => {
    setDevMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('renegadeswarm_devmode', String(next));
      } catch {}
      return next;
    });
  };
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
  const [cmmDiscovered, setCmmDiscovered] = useState(false);
  const [cmmModelCount, setCmmModelCount] = useState(0);
  const [cmmDbPath, setCmmDbPath] = useState('');
  const [comfyModelsRoot, setComfyModelsRoot] = useState('');
  const [isCheckingCmm, setIsCheckingCmm] = useState(false);
  const [cmmProbeBudget, setCmmProbeBudget] = useState(5);

  const cmmConnectedRef = useRef(cmmConnected);
  cmmConnectedRef.current = cmmConnected;

  const cmmProbeBudgetRef = useRef(cmmProbeBudget);
  cmmProbeBudgetRef.current = cmmProbeBudget;

  const [selectedSeederModel, setSelectedSeederModel] = useState<CmmLocalModelRow | null>(null);

  const handleInstallCmm = () => {
    const releasesUrl = 'https://github.com/DevNullInc/RenegadeCMM/releases';
    if (window.renegadeSwarm?.openExternal) {
      window.renegadeSwarm.openExternal(releasesUrl);
    } else {
      window.open(releasesUrl, '_blank');
    }
  };

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

  const checkCmmStatus = async (manual: boolean = false) => {
    if (!window.renegadeSwarm) return;

    // If interval ping and budget is exhausted while disconnected, skip waking up background tasks
    if (!manual && !cmmConnectedRef.current && cmmProbeBudgetRef.current <= 0) {
      return;
    }

    if (manual) {
      cmmProbeBudgetRef.current = 5;
      setCmmProbeBudget(5);
    }

    setIsCheckingCmm(true);
    try {
      const res = await window.renegadeSwarm.getCmmStatus();
      if (res.success && res.data) {
        const wasConnected = cmmConnectedRef.current;
        const isNowConnected = Boolean(res.data.connected);
        const isNowDiscovered = Boolean(res.data.discovered);
        cmmConnectedRef.current = isNowConnected;
        setCmmConnected(isNowConnected);
        setCmmDiscovered(isNowDiscovered);
        setCmmModelCount(res.data.modelCount || 0);

        if (res.data.dbPath) {
          setCmmDbPath(res.data.dbPath);
        }
        if (res.data.comfyuiRoot) {
          setComfyModelsRoot(res.data.comfyuiRoot);
        }

        if (isNowConnected) {
          cmmProbeBudgetRef.current = 5;
          setCmmProbeBudget(5);
          // If CMM status newly transitioned to connected, auto-refresh models
          if (!wasConnected) {
            fetchCmmModels();
          }
        } else {
          const newBudget = Math.max(0, cmmProbeBudgetRef.current - 1);
          cmmProbeBudgetRef.current = newBudget;
          setCmmProbeBudget(newBudget);
        }
      } else {
        cmmConnectedRef.current = false;
        setCmmConnected(false);
        setCmmDiscovered(false);
        const newBudget = Math.max(0, cmmProbeBudgetRef.current - 1);
        cmmProbeBudgetRef.current = newBudget;
        setCmmProbeBudget(newBudget);
      }
    } catch {
      cmmConnectedRef.current = false;
      setCmmConnected(false);
      setCmmDiscovered(false);
      const newBudget = Math.max(0, cmmProbeBudgetRef.current - 1);
      cmmProbeBudgetRef.current = newBudget;
      setCmmProbeBudget(newBudget);
    } finally {
      setIsCheckingCmm(false);
    }
  };

  const handleManualRetryCmm = () => {
    checkCmmStatus(true);
  };

  const handleAutoDetectCmm = async (): Promise<{ success: boolean; data?: any }> => {
    if (!window.renegadeSwarm) return { success: false };
    try {
      const res = window.renegadeSwarm.autoDetectCmm
        ? await window.renegadeSwarm.autoDetectCmm()
        : await window.renegadeSwarm.getCmmStatus();
      if (res.success && res.data) {
        if (res.data.dbPath) setCmmDbPath(res.data.dbPath);
        if (res.data.comfyuiRoot) setComfyModelsRoot(res.data.comfyuiRoot);
        setCmmConnected(Boolean(res.data.connected));
        setCmmDiscovered(Boolean(res.data.discovered));
        if (res.data.modelCount !== undefined) setCmmModelCount(res.data.modelCount);
        if (res.data.connected) {
          fetchCmmModels();
        }
        return res;
      }
      return { success: false, data: res.data };
    } catch (err: any) {
      return { success: false, data: err?.message };
    }
  };

  const fetchCmmModels = async () => {
    if (window.renegadeSwarm) {
      const res = await window.renegadeSwarm.getCmmModels();
      if (res.success && res.data) {
        setCmmModels(res.data);
        setCmmModelCount(res.data.length);
        if (res.data.length > 0) {
          cmmConnectedRef.current = true;
          setCmmConnected(true);
          cmmProbeBudgetRef.current = 5;
          setCmmProbeBudget(5);
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
    checkCmmStatus(true);
    fetchCmmModels();
    fetchSharingPolicy();

    // 1-second interval for real-time torrent telemetry
    const torrentInterval = setInterval(fetchTorrents, 1000);
    // 5-second polling check to detect if CMM is running/connected on the machine (capped at 5 attempts when offline)
    const cmmInterval = setInterval(() => {
      checkCmmStatus(false);
    }, 5000);

    const onFocus = () => {
      // Re-probe on window focus if connected or budget remains
      checkCmmStatus(false);
      fetchTorrents();
    };
    window.addEventListener('focus', onFocus);

    // Listen for sister wakeup pings from CMM (when CMM comes online second)
    const cleanupSisterWakeup = window.renegadeSwarm?.onCmmSisterWakeup
      ? window.renegadeSwarm.onCmmSisterWakeup((data) => {
          console.info('[Swarm] Received sister wakeup from CMM:', data);
          // Reset budget and check CMM status immediately
          checkCmmStatus(true);
        })
      : undefined;

    return () => {
      clearInterval(torrentInterval);
      clearInterval(cmmInterval);
      window.removeEventListener('focus', onFocus);
      if (cleanupSisterWakeup) cleanupSisterWakeup();
    };
  }, []);

  const handleAddMagnet = async (magnetUri: string, customDestination?: string) => {
    if (window.renegadeSwarm) {
      await window.renegadeSwarm.addMagnet({ magnetUri, customDestination, autoOrganizeComfy: true });
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

  const handleSyncCmmConfig = async (dbPath: string, rootPath?: string): Promise<boolean> => {
    setCmmDbPath(dbPath);
    if (rootPath) {
      setComfyModelsRoot(rootPath);
    }
    if (window.renegadeSwarm) {
      const res = await window.renegadeSwarm.configureCmmSync({
        cmmDbPath: dbPath,
        comfyModelsRoot: rootPath,
        autoImportDownloaded: true,
      });
      const connected = !!(res.success && res.data?.connected);
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
      await fetchTorrents();
      await fetchSharingPolicy();
      await fetchCmmModels();
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
        cmmDiscovered={cmmDiscovered}
        cmmModelCount={cmmModelCount}
        onInstallCmm={handleInstallCmm}
        isCheckingCmm={isCheckingCmm}
        cmmProbeBudget={cmmProbeBudget}
        onRetryCmm={handleManualRetryCmm}
        devMode={devMode}
        onToggleDevMode={handleToggleDevMode}
      />

      <main style={{ flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' }}>
        {activeTab === 'dashboard' && (
          <DashboardView
            torrents={torrents}
            onAddMagnet={handleAddMagnet}
            onPause={handlePause}
            onResume={handleResume}
            onRemove={handleRemove}
            devMode={devMode}
          />
        )}
        {activeTab === 'discovery' && (
          <DiscoveryView
            onSelectModelForDownload={(magnetUri) => {
              handleAddMagnet(magnetUri);
              setActiveTab('dashboard');
            }}
            devMode={devMode}
          />
        )}
        {activeTab === 'seeder' && (
          <SeederView
            onCreatePackage={handleCreatePackage}
            initialModel={selectedSeederModel}
            devMode={devMode}
          />
        )}
        {activeTab === 'cmm' && (
          <CmmSyncView
            cmmDbPath={cmmDbPath}
            comfyModelsRoot={comfyModelsRoot}
            models={cmmModels}
            activeTorrents={torrents}
            sharingPolicy={sharingPolicy}
            cmmConnected={cmmConnected}
            cmmDiscovered={cmmDiscovered}
            isCheckingCmm={isCheckingCmm}
            cmmProbeBudget={cmmProbeBudget}
            onRetryCmm={handleManualRetryCmm}
            onSyncConfig={handleSyncCmmConfig}
            onRefreshModels={fetchCmmModels}
            onQuickSeed={(model) => {
              setSelectedSeederModel(model);
              setActiveTab('seeder');
            }}
            onToggleModelShare={handleToggleModelShare}
            onNavigateTab={setActiveTab}
            onInstallCmm={handleInstallCmm}
            onAutoDetect={handleAutoDetectCmm}
            devMode={devMode}
          />
        )}
        {activeTab === 'bandwidth' && (
          <BandwidthView
            settings={bandwidthSettings}
            sharingPolicy={sharingPolicy}
            onUpdateSettings={handleUpdateBandwidth}
            onUpdateSharingPolicy={handleUpdateSharingPolicy}
            devMode={devMode}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsView
            cmmDbPath={cmmDbPath}
            comfyModelsRoot={comfyModelsRoot}
            sharingPolicy={sharingPolicy}
            onSyncCmmConfig={handleSyncCmmConfig}
            onUpdateSharingPolicy={handleUpdateSharingPolicy}
            devMode={devMode}
          />
        )}
        {activeTab === 'about' && (
          <AboutView devMode={devMode} />
        )}
      </main>
    </div>
  );
}
