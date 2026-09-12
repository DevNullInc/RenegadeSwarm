import React, { useState } from 'react';
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
  CheckCircle2
} from 'lucide-react';
import { SwarmTorrentStatus } from '../../protocol/types';

interface DashboardViewProps {
  torrents: SwarmTorrentStatus[];
  onAddMagnet: (magnetUri: string) => Promise<void>;
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
    await onAddMagnet(magnetInput.trim());
    setMagnetInput('');
    setShowAddModal(false);
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
      {/* Top Metrics Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>
            <span>ACTIVE SWARMS</span>
            <Zap size={16} color="#a855f7" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>
            {torrents.length} <span style={{ fontSize: '13px', color: '#a855f7', fontWeight: 500 }}>({torrents.filter(t => t.state === 'seeding').length} Seeding)</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>
            <span>AGGREGATE DOWNLOAD</span>
            <Download size={16} color="#10b981" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700 }} className="mono">
            {formatBytes(totalDownSpeed)}/s
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>
            <span>AGGREGATE UPLOAD</span>
            <Upload size={16} color="#06b6d4" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700 }} className="mono">
            {formatBytes(totalUpSpeed)}/s
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '8px' }}>
            <span>CONNECTED PEERS</span>
            <Users size={16} color="#eab308" />
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700 }}>
            {totalPeers} <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 400 }}>Distributed</span>
          </div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setFilter('all')}
            className={filter === 'all' ? 'btn-primary' : 'btn-secondary'}
          >
            All Transfers ({torrents.length})
          </button>
          <button
            onClick={() => setFilter('downloading')}
            className={filter === 'downloading' ? 'btn-primary' : 'btn-secondary'}
          >
            Downloading ({torrents.filter(t => t.state === 'downloading').length})
          </button>
          <button
            onClick={() => setFilter('seeding')}
            className={filter === 'seeding' ? 'btn-primary' : 'btn-secondary'}
          >
            Seeding ({torrents.filter(t => t.state === 'seeding').length})
          </button>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary"
        >
          <Plus size={16} />
          <span>Add Magnet Link</span>
        </button>
      </div>

      {/* Torrents Table */}
      <div className="glass-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <HardDrive size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)' }}>No active transfers in this view</div>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>Add a magnet link or package a local model to begin seeding.</div>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>Model & Payload</th>
                  <th style={{ padding: '12px 16px' }}>Type</th>
                  <th style={{ padding: '12px 16px' }}>Progress</th>
                  <th style={{ padding: '12px 16px' }}>Speed (↓ / ↑)</th>
                  <th style={{ padding: '12px 16px' }}>Peers</th>
                  <th style={{ padding: '12px 16px' }}>Ratio</th>
                  <th style={{ padding: '12px 16px' }}>CMM Status</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.infoHash} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <td style={{ padding: '14px 16px' }}>
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
              <textarea
                value={magnetInput}
                onChange={(e) => setMagnetInput(e.target.value)}
                placeholder="magnet:?xt=urn:btih:...&dn=FLUX.1-Dev.safetensors"
                style={{ width: '100%', height: '100px', resize: 'none', marginBottom: '16px' }}
                className="mono"
                required
              />

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
