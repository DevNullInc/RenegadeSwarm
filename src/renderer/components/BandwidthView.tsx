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
import { Save, Check, ShieldCheck, Lock, EyeOff } from 'lucide-react';
import { BandwidthSettings } from '../../shared/ipcContracts';
import { SharingPolicySettings, DEFAULT_SHARING_POLICY } from '../../protocol/sharingPolicy';
import { TabDebugDrawer } from './TabDebugDrawer';

interface BandwidthViewProps {
  settings: BandwidthSettings;
  sharingPolicy?: SharingPolicySettings;
  onUpdateSettings: (settings: Partial<BandwidthSettings>) => Promise<void>;
  onUpdateSharingPolicy?: (policy: Partial<SharingPolicySettings>) => Promise<void>;
  devMode?: boolean;
}

export const BandwidthView: React.FC<BandwidthViewProps> = ({
  settings,
  sharingPolicy = DEFAULT_SHARING_POLICY,
  onUpdateSettings,
  onUpdateSharingPolicy,
  devMode = false,
}) => {
  const [formState, setFormState] = useState<BandwidthSettings>(settings);
  const [policyState, setPolicyState] = useState<SharingPolicySettings>(sharingPolicy);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFormState(settings);
  }, [settings]);

  useEffect(() => {
    setPolicyState(sharingPolicy);
  }, [sharingPolicy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateSettings(formState);
    if (onUpdateSharingPolicy) {
      await onUpdateSharingPolicy(policyState);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: '16px 24px', height: '100%', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box', overflowY: 'auto' }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Network, Bandwidth & Sharing Privacy</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Configure rate limits, P2P listening ports, and granular model sharing privacy filters (Opt-In by default).
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Privacy & Model Sharing Controls */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={20} color="#a855f7" />
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700 }}>Model Sharing & Privacy Policy</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Controls which models and files are allowed to be seeded to the decentralized network.
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Sharing Mode</label>
                <select
                  value={policyState.mode}
                  onChange={(e) => setPolicyState({ ...policyState, mode: e.target.value as any })}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: '#fff', padding: '8px', borderRadius: '6px' }}
                >
                  <option value="opt_in_only">🔒 Opt-In Only (Default - Explicit Approval Required)</option>
                  <option value="filter_blacklist">🛡️ Filter Blacklist (Share all except excluded folders/tags)</option>
                  <option value="disabled">🚫 Disabled (Zero P2P Uploads / Read-Only Client)</option>
                </select>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {policyState.mode === 'opt_in_only' && 'No local models or downloaded files will ever be seeded unless you explicitly click "Opt-In & Seed".'}
                  {policyState.mode === 'filter_blacklist' && 'Models in your library can be seeded EXCEPT those matching excluded folder or tag patterns.'}
                  {policyState.mode === 'disabled' && 'All seeding is disabled across all swarms.'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    checked={policyState.autoSeedDownloads}
                    onChange={(e) => setPolicyState({ ...policyState, autoSeedDownloads: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-purple)' }}
                  />
                  <span>Auto-Seed Completed Downloads</span>
                </label>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '26px' }}>
                  (Default: OFF). When disabled, completed downloads immediately halt and never upload to peers without explicit opt-in.
                </span>

                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                  <input
                    type="checkbox"
                    checked={policyState.allowNsfwSharing}
                    onChange={(e) => setPolicyState({ ...policyState, allowNsfwSharing: e.target.checked })}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-purple)' }}
                  />
                  <span>Allow Sharing NSFW / Mature Models</span>
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <Lock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  Excluded Private Folders (comma-separated)
                </label>
                <input
                  type="text"
                  value={policyState.excludedFolderPatterns.join(', ')}
                  onChange={(e) =>
                    setPolicyState({
                      ...policyState,
                      excludedFolderPatterns: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder="private, personal, drafts, custom"
                  className="mono"
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Files in these folder names are blocked from being seeded.</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <EyeOff size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  Excluded Metadata Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={policyState.excludedTagPatterns.join(', ')}
                  onChange={(e) =>
                    setPolicyState({
                      ...policyState,
                      excludedTagPatterns: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder="private, wip, draft, internal"
                  className="mono"
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Models tagged with these keywords are blocked from being seeded.</span>
              </div>
            </div>
          </div>

          {/* Bandwidth & Transport Rate Limits */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>Bandwidth & Swarm Resource Limits</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Max Download Speed (KB/s, 0 = Unlimited)</label>
                <input
                  type="number"
                  min="0"
                  value={formState.maxDownloadSpeedKbps}
                  onChange={(e) => setFormState({ ...formState, maxDownloadSpeedKbps: parseInt(e.target.value, 10) || 0 })}
                  className="mono"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Max Upload Speed (KB/s, 0 = Unlimited)</label>
                <input
                  type="number"
                  min="0"
                  value={formState.maxUploadSpeedKbps}
                  onChange={(e) => setFormState({ ...formState, maxUploadSpeedKbps: parseInt(e.target.value, 10) || 0 })}
                  className="mono"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Max Active Downloads</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={formState.maxActiveDownloads}
                  onChange={(e) => setFormState({ ...formState, maxActiveDownloads: parseInt(e.target.value, 10) || 3 })}
                  className="mono"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Max Active Seeds</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formState.maxActiveSeeds}
                  onChange={(e) => setFormState({ ...formState, maxActiveSeeds: parseInt(e.target.value, 10) || 10 })}
                  className="mono"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Seeding Ratio Limit (e.g. 2.0 = 200%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formState.seedingRatioLimit}
                  onChange={(e) => setFormState({ ...formState, seedingRatioLimit: parseFloat(e.target.value) || 0 })}
                  className="mono"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>BitTorrent / DHT Listen Port</label>
                <input
                  type="number"
                  min="1024"
                  max="65535"
                  value={formState.listenPort}
                  onChange={(e) => setFormState({ ...formState, listenPort: parseInt(e.target.value, 10) || 6881 })}
                  className="mono"
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={formState.backgroundSeedingEnabled}
                  onChange={(e) => setFormState({ ...formState, backgroundSeedingEnabled: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-purple)' }}
                />
                <span>Keep Seeding in System Tray when window is closed (Continuous Background Swarm Support)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={formState.enableDht}
                  onChange={(e) => setFormState({ ...formState, enableDht: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-purple)' }}
                />
                <span>Enable Mainline DHT (BEP 5 & BEP 42 Security) for Swarm Discovery</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
            <button
              type="submit"
              className="btn-primary"
              style={{ padding: '10px 24px' }}
            >
              {saved ? <Check size={16} /> : <Save size={16} />}
              <span>{saved ? 'Saved & Applied!' : 'Save Privacy & Network Settings'}</span>
            </button>
          </div>
        </form>

      {/* In-Tab Debug & Telemetry Drawer */}
      <TabDebugDrawer tabId="bandwidth" devMode={devMode} tabLabel="Token Bucket Rate Limiting & Sockets" />
    </div>
  );
};
