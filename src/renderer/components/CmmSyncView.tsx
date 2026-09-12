import React, { useState } from 'react';
import { Database, FolderTree, RefreshCw, CheckCircle } from 'lucide-react';
import { CmmLocalModelRow } from '../../main/cmm/cmmDbBridge';

interface CmmSyncViewProps {
  cmmDbPath: string;
  comfyModelsRoot: string;
  models: CmmLocalModelRow[];
  onSyncConfig: (dbPath: string, rootPath: string) => Promise<boolean>;
  onRefreshModels: () => Promise<void>;
  onQuickSeed: (model: CmmLocalModelRow) => void;
}

export const CmmSyncView: React.FC<CmmSyncViewProps> = ({
  cmmDbPath,
  comfyModelsRoot,
  models,
  onSyncConfig,
  onRefreshModels,
  onQuickSeed,
}) => {
  const [dbPathInput, setDbPathInput] = useState(cmmDbPath || 'D:\\gitprojects\\RenegadeCMM\\renegadecmm.sqlite');
  const [modelsRootInput, setModelsRootInput] = useState(comfyModelsRoot || 'D:\\ComfyUI\\models');
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const ok = await onSyncConfig(dbPathInput, modelsRootInput);
      setStatusMsg(ok ? 'Connected to RenegadeCMM database successfully!' : 'Could not open SQLite database at specified path.');
    } catch {
      setStatusMsg('Connection error.');
    } finally {
      setIsSaving(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '6px' }}>RenegadeCMM Live Bridge</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Synchronize decentralized swarm downloads and seed packages with your local RenegadeCMM catalog.
          </p>
        </div>

        {/* Configuration Form */}
        <form onSubmit={handleSave} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={16} color="#a855f7" />
            <span>Local CMM Database & Model Root Configuration</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>RenegadeCMM SQLite Path</label>
              <input
                type="text"
                value={dbPathInput}
                onChange={(e) => setDbPathInput(e.target.value)}
                className="mono"
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>ComfyUI Models Root Folder</label>
              <input
                type="text"
                value={modelsRootInput}
                onChange={(e) => setModelsRootInput(e.target.value)}
                className="mono"
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
            {statusMsg && (
              <div style={{ fontSize: '12px', color: statusMsg.includes('success') ? '#10b981' : '#f43f5e' }}>
                {statusMsg}
              </div>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="btn-primary"
              style={{ marginLeft: 'auto' }}
            >
              <CheckCircle size={15} />
              <span>{isSaving ? 'Testing Connection...' : 'Connect & Sync Bridge'}</span>
            </button>
          </div>
        </form>

        {/* Local CMM Library Overview */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FolderTree size={16} color="#06b6d4" />
              <span>Discovered Models in CMM ({models.length})</span>
            </div>
            <button
              onClick={() => onRefreshModels()}
              className="btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
            >
              <RefreshCw size={14} />
              <span>Refresh Library</span>
            </button>
          </div>

          {models.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No models currently detected in the CMM SQLite database. Connect to `renegadecmm.sqlite` or run `cmm scan` in RenegadeCMM.
            </div>
          ) : (
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px' }}>File / Model Name</th>
                    <th style={{ padding: '8px 12px' }}>Type</th>
                    <th style={{ padding: '8px 12px' }}>Size</th>
                    <th style={{ padding: '8px 12px' }}>Source</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Swarm Seeding</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 600 }}>{m.civitai_name || m.file_name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }} className="mono">{m.file_path}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                          {m.model_type || 'Model'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }} className="mono">
                        {formatBytes(m.file_size)}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>
                        {m.source || 'civitai'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <button
                          onClick={() => onQuickSeed(m)}
                          className="btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '12px' }}
                        >
                          Package for Swarm
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
