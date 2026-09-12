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
  DownloadCloud,
  ExternalLink,
} from 'lucide-react';

export type TabId = 'dashboard' | 'seeder' | 'cmm' | 'bandwidth' | 'settings';

interface NavbarProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  downloadSpeed: string;
  uploadSpeed: string;
  cmmConnected: boolean;
  cmmDiscovered: boolean;
  cmmModelCount?: number;
  onInstallCmm?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  downloadSpeed,
  uploadSpeed,
  cmmConnected,
  cmmDiscovered,
  cmmModelCount = 0,
  onInstallCmm,
}) => {
  const tabs = [
    { id: 'dashboard' as TabId, label: 'Swarm Monitor', icon: Activity },
    { id: 'seeder' as TabId, label: 'Package & Seed', icon: UploadCloud },
    { id: 'cmm' as TabId, label: 'RenegadeCMM Bridge', icon: Database },
    { id: 'bandwidth' as TabId, label: 'Network & Quotas', icon: Sliders },
    { id: 'settings' as TabId, label: 'Keyring & Settings', icon: KeyRound },
  ];

  const handleInstallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onInstallCmm) {
      onInstallCmm();
    } else {
      window.open('https://github.com/DevNullInc/RenegadeCMM/releases', '_blank');
    }
  };

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

        {/* CMM Multi-State Status Badge */}
        {cmmConnected ? (
          /* State 1: Connected (Online & Discovered) */
          <button
            onClick={() => onSelectTab('cmm')}
            title={`RenegadeCMM Connected (${cmmModelCount} local models). Click to view bridge.`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 8px #10b981',
              display: 'inline-block',
            }} />
            <ShieldCheck size={12} />
            <span style={{ fontWeight: 600 }}>
              {`CMM Connected (${cmmModelCount})`}
            </span>
          </button>
        ) : cmmDiscovered ? (
          /* State 2: Discovered but Offline */
          <button
            onClick={() => onSelectTab('cmm')}
            title="RenegadeCMM discovered on disk, but currently offline. Click to configure connection."
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#f59e0b',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#f59e0b',
              display: 'inline-block',
            }} />
            <Database size={12} />
            <span style={{ fontWeight: 600 }}>
              CMM Offline
            </span>
          </button>
        ) : (
          /* State 3: Off and Not Discovered / Not Installed */
          <button
            onClick={handleInstallClick}
            title="RenegadeCMM is not detected. Click to download from GitHub Releases."
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              padding: '4px 12px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.18), rgba(99, 102, 241, 0.18))',
              color: '#c084fc',
              border: '1px solid rgba(168, 85, 247, 0.45)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 0 10px rgba(168, 85, 247, 0.2)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#a855f7';
              e.currentTarget.style.boxShadow = '0 0 14px rgba(168, 85, 247, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.45)';
              e.currentTarget.style.boxShadow = '0 0 10px rgba(168, 85, 247, 0.2)';
            }}
          >
            <DownloadCloud size={13} />
            <span style={{ fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
              Click here to install CMM
            </span>
            <ExternalLink size={11} style={{ opacity: 0.8 }} />
          </button>
        )}
      </div>
    </header>
  );
};
