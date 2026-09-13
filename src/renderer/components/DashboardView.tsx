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

import React, { useState, useEffect } from 'react';
import {
  Download,
  Upload,
  Pause,
  Play,
  Trash2,
  Plus,
  Zap,
  Users,
  HardDrive,
  CheckCircle2,
  Folder,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { SwarmTorrentStatus } from '../../protocol/types';
import { ModelFolderEntry, PreDownloadVerificationResult } from '../../shared/ipcContracts';

interface DashboardViewProps {
  torrents: SwarmTorrentStatus[];
  onAddMagnet: (magnetUri: string, customDestination?: string) => Promise<void>;
  onPause: (infoHash: string) => void;
  onResume: (infoHash: string) => void;
  onRemove: (infoHash: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  torrents,
  onAddMagnet,
  onPause,
  onResume,
  onRemove,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [magnetInput, setMagnetInput] = useState('');
  const [filter, setFilter] = useState<'all' | 'downloading' | 'seeding'>('all');
  const [availableFolders, setAvailableFolders] = useState<ModelFolderEntry[]>([]);
  const [selectedDestination, setSelectedDestination] = useState<string>('');

  // Pre-download verification state
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<PreDownloadVerificationResult | null>(null);

  const loadFolders = async () => {
    if (window.renegadeSwarm?.getModelFolders) {
      try {
        const res = await window.renegadeSwarm.getModelFolders();
        if (res.success && res.data) {
          const list: ModelFolderEntry[] = res.data.folders || [];
          setAvailableFolders(list);
          const defaultF = res.data.defaultFolder || (list[0]?.path || '');
          setSelectedDestination(defaultF);
        }
      } catch (err) {
        console.error('Failed to load model folders:', err);
      }
    }
  };

  useEffect(() => {
    loadFolders();
  }, [showAddModal]);

  // Live pre-download verification handshake on magnet input change
  useEffect(() => {
    if (!magnetInput.trim() || !magnetInput.includes('urn:btih:')) {
      setVerifyResult(null);
      setIsVerifying(false);
      return;
    }

    let active = true;
    setIsVerifying(true);
    const timer = setTimeout(async () => {
      if (window.renegadeSwarm?.verifyPreDownload) {
        try {
          const res = await window.renegadeSwarm.verifyPreDownload({ magnetUri: magnetInput.trim() });
          if (active && res.success && res.data) {
            setVerifyResult(res.data);
          }
        } catch {
          if (active) setVerifyResult(null);
        } finally {
          if (active) setIsVerifying(false);
        }
      } else {
        if (active) setIsVerifying(false);
      }
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [magnetInput]);

  const handleBrowseCustomDestination = async () => {
    if (!window.renegadeSwarm?.browseDirectory) return;
    try {
      const res = await window.renegadeSwarm.browseDirectory({ title: 'Select Download Destination Folder' });
      if (res.success && res.data?.folderPath) {
        const selected = res.data.folderPath;
        setSelectedDestination(selected);
        // Also add to available folders temporarily if not present
        if (!availableFolders.some(f => f.path.toLowerCase() === selected.toLowerCase())) {
          setAvailableFolders(prev => [...prev, {
            path: selected,
            source: 'custom',
            isDefault: false,
            label: 'Selected Folder',
          }]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = torrents.filter((t) => {
    if (filter === 'downloading') return t.state === 'downloading';
    if (filter === 'seeding') return t.state === 'seeding';
    return true;
  });

  const totalDownSpeed = torrents.reduce((acc, t) => acc + (t.state === 'downloading' ? t.downloadSpeedBps : 0), 0);
  const totalUpSpeed = torrents.reduce((acc, t) => acc + t.uploadSpeedBps, 0);
  const totalPeers = torrents.reduce((acc, t) => acc + t.peersConnected, 0);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magnetInput.trim()) return;
    await onAddMagnet(magnetInput.trim(), selectedDestination || undefined);
    setMagnetInput('');
    setShowAddModal(false);
  };

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* Top Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div className="glass-panel" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
            <span>ACTIVE SWARMS</span>
            <Zap size={15} color="#a855f7" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>
            {torrents.length} <span style={{ fontSize: '12px', color: '#a855f7', fontWeight: 500 }}>({torrents.filter(t => t.state === 'seeding').length} Seeding)</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
            <span>AGGREGATE DOWNLOAD</span>
            <Download size={15} color="#10b981" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700 }} className="mono">
            {formatBytes(totalDownSpeed)}/s
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
            <span>AGGREGATE UPLOAD</span>
            <Upload size={15} color="#06b6d4" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700 }} className="mono">
            {formatBytes(totalUpSpeed)}/s
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
            <span>CONNECTED PEERS</span>
            <Users size={15} color="#eab308" />
          </div>
          <div style={{ fontSize: '22px', fontWeight: 700 }}>
            {totalPeers} <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}>Distributed</span>
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setFilter('all')}
            className={filter === 'all' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 14px', fontSize: '12px' }}
          >
            All Transfers ({torrents.length})
          </button>
          <button
            onClick={() => setFilter('downloading')}
            className={filter === 'downloading' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 14px', fontSize: '12px' }}
          >
            Downloading ({torrents.filter(t => t.state === 'downloading').length})
          </button>
          <button
            onClick={() => setFilter('seeding')}
            className={filter === 'seeding' ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 14px', fontSize: '12px' }}
          >
            Seeding ({torrents.filter(t => t.state === 'seeding').length})
          </button>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary"
          style={{ padding: '6px 14px', fontSize: '12px' }}
        >
          <Plus size={15} />
          <span>Add Magnet Link</span>
        </button>
      </div>

      {/* Torrents Table */}
      <div className="glass-panel" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {filtered.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <HardDrive size={44} style={{ opacity: 0.3, marginBottom: '10px' }} />
            <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>No active transfers in this view</div>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>Add a magnet link or package a local model to begin seeding.</div>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', overflowX: 'auto', flex: 1, minHeight: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--bg-surface)', zIndex: 1 }}>
                  <th style={{ padding: '10px 14px' }}>Model & Payload</th>
                  <th style={{ padding: '10px 14px', width: '110px' }}>Type</th>
                  <th style={{ padding: '10px 14px', width: '160px' }}>Progress</th>
                  <th style={{ padding: '10px 14px', width: '130px' }}>Speed (↓ / ↑)</th>
                  <th style={{ padding: '10px 14px', width: '110px' }}>Peers</th>
                  <th style={{ padding: '10px 14px', width: '80px' }}>Ratio</th>
                  <th style={{ padding: '10px 14px', width: '100px' }}>CMM Status</th>
                  <th style={{ padding: '10px 14px', width: '130px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.infoHash} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{t.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }} className="mono">
                        {t.infoHash.slice(0, 16)}... | {formatBytes(t.downloadedBytes)} of {formatBytes(t.totalBytes)}
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className="badge" style={{ background: 'rgba(147, 51, 234, 0.15)', color: '#c084fc', border: '1px solid rgba(147, 51, 234, 0.3)' }}>
                        {t.modelType}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', minWidth: '160px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                        <span style={{ textTransform: 'capitalize', color: t.state === 'seeding' ? '#10b981' : '#a855f7' }}>
                          {t.state}
                        </span>
                        <span className="mono">{(t.progressRatio * 100).toFixed(1)}%</span>
                      </div>
                      <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${t.progressRatio * 100}%`,
                            background: t.state === 'seeding'
                              ? 'linear-gradient(90deg, #10b981, #06b6d4)'
                              : 'linear-gradient(90deg, #9333ea, #c084fc)',
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px' }} className="mono">
                      <div style={{ color: '#10b981' }}>↓ {formatBytes(t.downloadSpeedBps)}/s</div>
                      <div style={{ color: '#06b6d4', fontSize: '11px' }}>↑ {formatBytes(t.uploadSpeedBps)}/s</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontSize: '12px' }}>{t.peersConnected} peers</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t.seedersConnected} seeds</div>
                    </td>
                    <td style={{ padding: '14px 16px' }} className="mono">
                      {t.ratio.toFixed(2)}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {t.cmmSynced ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontSize: '12px' }}>
                          <CheckCircle2 size={14} />
                          <span>Routed</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Pending</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        {t.state === 'downloading' || t.state === 'seeding' ? (
                          <button
                            onClick={() => onPause(t.infoHash)}
                            className="btn-secondary"
                            style={{ padding: '6px 8px' }}
                            title="Pause"
                          >
                            <Pause size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => onResume(t.infoHash)}
                            className="btn-secondary"
                            style={{ padding: '6px 8px' }}
                            title="Resume"
                          >
                            <Play size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => onRemove(t.infoHash)}
                          className="btn-secondary"
                          style={{ padding: '6px 8px', color: '#f43f5e' }}
                          title="Remove from Swarm"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Magnet Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
        }}>
          <div className="glass-panel" style={{ width: '560px', padding: '24px', background: '#12161f' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Add Magnet Link</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Paste a BitTorrent or RenegadeSwarm magnet URI. The model will download and automatically route into your ComfyUI models hierarchy.
            </p>

            <form onSubmit={handleAdd}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  BitTorrent / RenegadeSwarm Magnet Link *
                </label>
                <textarea
                  value={magnetInput}
                  onChange={(e) => setMagnetInput(e.target.value)}
                  placeholder="magnet:?xt=urn:btih:...&dn=FLUX.1-Dev.safetensors"
                  style={{ width: '100%', height: '70px', resize: 'none', boxSizing: 'border-box' }}
                  className="mono"
                  required
                />

                {/* Pre-Download Live Verification Panel */}
                {isVerifying && (
                  <div style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(168, 85, 247, 0.08)',
                    border: '1px solid rgba(168, 85, 247, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '11px',
                    color: '#c084fc',
                  }}>
                    <RefreshCw size={13} className="spin" />
                    <span>Verifying reported hash & companion metadata with CivitAI / HuggingFace / WoT...</span>
                  </div>
                )}

                {verifyResult && !isVerifying && (
                  <div style={{
                    marginTop: '8px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: verifyResult.canProceed ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    border: `1px solid ${verifyResult.canProceed ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '11px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: verifyResult.canProceed ? '#34d399' : '#f87171' }}>
                        {verifyResult.status === 'verified_civitai' && <CheckCircle2 size={14} color="#10b981" />}
                        {verifyResult.status === 'verified_huggingface' && <FileCheck size={14} color="#06b6d4" />}
                        {verifyResult.status === 'verified_custom_trusted' && <ShieldCheck size={14} color="#a855f7" />}
                        {verifyResult.status === 'verified_custom_untrusted' && <AlertTriangle size={14} color="#eab308" />}
                        {verifyResult.status === 'rejected' && <Lock size={14} color="#ef4444" />}
                        <span>
                          {verifyResult.status === 'verified_civitai' && 'CivitAI Registry Verified'}
                          {verifyResult.status === 'verified_huggingface' && 'Hugging Face Registry Verified'}
                          {verifyResult.status === 'verified_custom_trusted' && 'Web of Trust Verified Custom Model'}
                          {verifyResult.status === 'verified_custom_untrusted' && 'Unindexed Custom Model (Quarantine Isolated)'}
                          {verifyResult.status === 'rejected' && 'Download Prohibited (Blocked Creator)'}
                          {verifyResult.status === 'mismatch' && 'Signature Tampering Detected'}
                        </span>
                      </div>
                      <span className="badge" style={{ fontSize: '10px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-main)' }}>
                        Trust: {verifyResult.trustScore}%
                      </span>
                    </div>

                    {verifyResult.title && (
                      <div style={{ color: 'var(--text-main)' }}>
                        <strong>{verifyResult.title}</strong>
                        {verifyResult.creator && <span style={{ color: 'var(--text-muted)' }}> by {verifyResult.creator}</span>}
                        {verifyResult.baseModel && <span style={{ color: '#c084fc' }}> • {verifyResult.baseModel}</span>}
                        {verifyResult.modelType && <span style={{ color: 'var(--text-secondary)' }}> [{verifyResult.modelType}]</span>}
                      </div>
                    )}

                    {verifyResult.sha256 && (
                      <div className="mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        SHA256: {verifyResult.sha256.slice(0, 32)}...
                      </div>
                    )}

                    {verifyResult.warnings && verifyResult.warnings.length > 0 && (
                      <div style={{ color: '#fbbf24', fontSize: '10px' }}>
                        {verifyResult.warnings.map((w, idx) => (
                          <div key={idx}>⚠️ {w}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Download Destination Model Folder Selector */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Download Destination Model Directory:
                  </label>
                  <button
                    type="button"
                    onClick={handleBrowseCustomDestination}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--accent-purple)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: 0,
                    }}
                  >
                    <Folder size={12} /> Browse Folder...
                  </button>
                </div>

                {availableFolders.length > 0 ? (
                  <select
                    value={selectedDestination}
                    onChange={(e) => setSelectedDestination(e.target.value)}
                    style={{
                      width: '100%',
                      background: '#0d1117',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '10px 12px',
                      fontSize: '12px',
                      color: 'var(--text-main)',
                      outline: 'none',
                    }}
                  >
                    {availableFolders.map((f) => (
                      <option key={f.path} value={f.path}>
                        {f.path} {f.isDefault ? '(Default)' : ''} [{f.source === 'cmm' ? 'CMM' : 'Custom'}]
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      readOnly
                      value={selectedDestination || 'Default models directory'}
                      style={{
                        flex: 1,
                        background: '#0d1117',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleBrowseCustomDestination}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-subtle)',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      Browse...
                    </button>
                  </div>
                )}
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '6px' }}>
                  Model files will be auto-categorized into subfolders (`checkpoints/`, `loras/`, `vae/`, etc.) inside this directory.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={verifyResult ? !verifyResult.canProceed : false}
                  style={verifyResult && !verifyResult.canProceed ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                >
                  Start Swarm Download
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
