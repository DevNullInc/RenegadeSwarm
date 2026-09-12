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

import React from 'react';
import {
  Activity,
  UploadCloud,
  Database,
  Sliders,
  Radio,
  ShieldCheck,
  KeyRound,
} from 'lucide-react';

export type TabId = 'dashboard' | 'seeder' | 'cmm' | 'bandwidth' | 'settings';

interface NavbarProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  downloadSpeed: string;
  uploadSpeed: string;
  cmmConnected: boolean;
  cmmModelCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  downloadSpeed,
  uploadSpeed,
  cmmConnected,
  cmmModelCount = 0,
}) => {
  const tabs = [
    { id: 'dashboard' as TabId, label: 'Swarm Monitor', icon: Activity },
    { id: 'seeder' as TabId, label: 'Package & Seed', icon: UploadCloud },
    { id: 'cmm' as TabId, label: 'RenegadeCMM Bridge', icon: Database },
    { id: 'bandwidth' as TabId, label: 'Network & Quotas', icon: Sliders },
    { id: 'settings' as TabId, label: 'Keyring & Settings', icon: KeyRound },
  ];

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 24px',
      borderBottom: '1px solid var(--border-subtle)',
      background: '#0d1117'
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 12px rgba(168, 85, 247, 0.4)',
        }}>
          <Radio size={18} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: '15px', fontWeight: 800, letterSpacing: '-0.3px', margin: 0, color: '#fff' }}>
            Renegade<span style={{ color: 'var(--accent-purple)' }}>Swarm</span>
          </h1>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block' }}>
            P2P AI Model Distribution Network
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav style={{ display: 'flex', gap: '4px' }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: 'none',
                background: isActive ? 'rgba(147, 51, 234, 0.15)' : 'transparent',
                color: isActive ? '#c084fc' : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                outline: 'none',
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Live Swarm Telemetry & CMM Detection Badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px' }} className="mono">
          <div style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>↓</span> {downloadSpeed}
          </div>
          <div style={{ color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>↑</span> {uploadSpeed}
          </div>
        </div>

        <button
          onClick={() => onSelectTab('cmm')}
          title={cmmConnected ? `RenegadeCMM Detected & Connected (${cmmModelCount} local models). Click to view.` : 'RenegadeCMM Not Detected. Click to configure path or auto-detect.'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '11px',
            padding: '4px 10px',
            borderRadius: '20px',
            background: cmmConnected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
            color: cmmConnected ? '#10b981' : '#f43f5e',
            border: `1px solid ${cmmConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: cmmConnected ? '#10b981' : '#f43f5e',
            boxShadow: cmmConnected ? '0 0 8px #10b981' : 'none',
            display: 'inline-block',
          }} />
          <ShieldCheck size={12} />
          <span style={{ fontWeight: 600 }}>
            {cmmConnected ? `CMM Connected (${cmmModelCount})` : 'CMM Offline'}
          </span>
        </button>
      </div>
    </header>
  );
};
