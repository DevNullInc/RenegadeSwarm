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
import { Save, Check } from 'lucide-react';
import { BandwidthSettings } from '../../shared/ipcContracts';

interface BandwidthViewProps {
  settings: BandwidthSettings;
  onUpdateSettings: (settings: Partial<BandwidthSettings>) => Promise<void>;
}

export const BandwidthView: React.FC<BandwidthViewProps> = ({ settings, onUpdateSettings }) => {
  const [formState, setFormState] = useState<BandwidthSettings>(settings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setFormState(settings);
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateSettings(formState);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '6px' }}>Network & Bandwidth Governance</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Configure rate limits, background seeding quotas, and P2P listening ports.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
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

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--border-subtle)', marginTop: '8px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Anonymous Swarm Health Telemetry</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Help improve swarm routing. Zero tracking of file names, model paths, or personal IPs.</div>
              </div>
              <input
                type="checkbox"
                defaultChecked={false}
                style={{ width: '16px', height: '16px', accentColor: 'var(--accent-purple)' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              type="submit"
              className="btn-primary"
            >
              {saved ? <Check size={16} /> : <Save size={16} />}
              <span>{saved ? 'Saved Successfully' : 'Apply Network Settings'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
