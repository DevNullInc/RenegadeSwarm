import { useState, useEffect } from 'react';
import { Navbar, TabId } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { SeederView } from './components/SeederView';
import { CmmSyncView } from './components/CmmSyncView';
import { BandwidthView } from './components/BandwidthView';
import { SwarmTorrentStatus } from '../protocol/types';
import { BandwidthSettings, CreateSwarmPackageRequest } from '../shared/ipcContracts';
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
      getCmmModels: () => Promise<{ success: boolean; data?: CmmLocalModelRow[]; error?: string }>;
      configureCmmSync: (req: any) => Promise<{ success: boolean; data?: any; error?: string }>;
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
  const [downloadSpeedStr, setDownloadSpeedStr] = useState('0 MB/s');
  const [uploadSpeedStr, setUploadSpeedStr] = useState('0 MB/s');
  const [cmmModels, setCmmModels] = useState<CmmLocalModelRow[]>([]);
  const [cmmConnected, setCmmConnected] = useState(false);
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
    } else {
      // Standalone browser preview mode mock data
      setTorrents([
        {
          infoHash: '4a5c88b2e118b6284f18b3ec48866164287d3d2a',
          manifestId: 'm-1',
          title: 'FLUX.1 [dev] fp8 quantized',
          modelType: 'Checkpoint',
          baseModel: 'Flux.1 D',
          state: 'downloading',
          queueState: 'Active',
          totalBytes: 12500000000,
          downloadedBytes: 8100000000,
          uploadedBytes: 1200000000,
          downloadSpeedBps: 24 * 1024 * 1024,
          uploadSpeedBps: 3.5 * 1024 * 1024,
          progressRatio: 0.648,
          peersConnected: 34,
          seedersConnected: 18,
          ratio: 0.15,
          etaSeconds: 180,
          savePath: 'D:\\ComfyUI\\models\\checkpoints',
          cmmSynced: false,
        },
        {
          infoHash: '9b7f32a1e442c8192a01b5de78891024567a8bc1',
          manifestId: 'm-2',
          title: 'SDXL-Cyberpunk-LoRA-v2',
          modelType: 'LORA',
          baseModel: 'SDXL 1.0',
          state: 'seeding',
          queueState: 'Verified',
          totalBytes: 245000000,
          downloadedBytes: 245000000,
          uploadedBytes: 1250000000,
          downloadSpeedBps: 0,
          uploadSpeedBps: 6.2 * 1024 * 1024,
          progressRatio: 1.0,
          peersConnected: 14,
          seedersConnected: 5,
          ratio: 5.1,
          etaSeconds: null,
          savePath: 'D:\\ComfyUI\\models\\loras',
          cmmSynced: true,
        },
      ]);
      setDownloadSpeedStr('24.0 MB/s');
      setUploadSpeedStr('9.7 MB/s');
      setCmmConnected(true);
    }
  };

  const fetchCmmModels = async () => {
    if (window.renegadeSwarm) {
      const res = await window.renegadeSwarm.getCmmModels();
      if (res.success && res.data) {
        setCmmModels(res.data);
      }
    }
  };

  useEffect(() => {
    fetchTorrents();
    fetchCmmModels();
    const interval = setInterval(fetchTorrents, 1000);
    return () => clearInterval(interval);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--bg-main)' }}>
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        downloadSpeed={downloadSpeedStr}
        uploadSpeed={uploadSpeedStr}
        cmmConnected={cmmConnected}
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
            onSyncConfig={handleSyncCmmConfig}
            onRefreshModels={fetchCmmModels}
            onQuickSeed={() => {
              setActiveTab('seeder');
            }}
          />
        )}
        {activeTab === 'bandwidth' && (
          <BandwidthView
            settings={bandwidthSettings}
            onUpdateSettings={handleUpdateBandwidth}
          />
        )}
      </main>
    </div>
  );
}
