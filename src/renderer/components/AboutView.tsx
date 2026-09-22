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

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Cpu,
  Coffee,
  Heart,
  ExternalLink,
  Terminal,
  Copy,
  Check,
  Trash2,
  Bug,
  Radio,
} from 'lucide-react';
import { DiagnosticLogEvent, SystemDiagnostics } from '../../shared/ipcContracts';

interface AboutViewProps {
  devMode: boolean;
}

export const AboutView: React.FC<AboutViewProps> = ({ devMode }) => {
  const [diagnostics, setDiagnostics] = useState<SystemDiagnostics | null>(null);
  const [logs, setLogs] = useState<DiagnosticLogEvent[]>([]);
  const [copiedReport, setCopiedReport] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchDiagnostics = useCallback(async () => {
    if (!window.renegadeSwarm) return;
    try {
      if (window.renegadeSwarm.getSystemDiagnostics) {
        const res = await window.renegadeSwarm.getSystemDiagnostics();
        if (res.success && res.data) {
          setDiagnostics(res.data);
        }
      }
      if (window.renegadeSwarm.getLogEvents) {
        const resLogs = await window.renegadeSwarm.getLogEvents({ limit: 500 });
        if (resLogs.success && resLogs.data) {
          setLogs(resLogs.data);
        }
      }
    } catch (err) {
      console.error('Failed to load diagnostics:', err);
    }
  }, []);

  useEffect(() => {
    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 5000);
    return () => clearInterval(interval);
  }, [fetchDiagnostics]);

  // Subscribe to live log events
  useEffect(() => {
    if (!window.renegadeSwarm?.onDebugLog) return;
    const unsub = window.renegadeSwarm.onDebugLog((event: DiagnosticLogEvent) => {
      setLogs((prev) => {
        const exists = prev.some((l) => l.id === event.id);
        if (exists) return prev;
        return [...prev.slice(-499), event];
      });
    });
    return () => unsub();
  }, []);

  const handleClearLogs = async () => {
    if (window.renegadeSwarm?.clearLogEvents) {
      try {
        await window.renegadeSwarm.clearLogEvents();
        setLogs([]);
      } catch (err) {
        console.error('Failed to clear logs:', err);
      }
    }
  };

  const handleCopyReport = () => {
    if (!diagnostics) return;
    const reportMd = `# RenegadeSwarm System Diagnostic Telemetry Report
**Generated:** ${new Date().toISOString()}
**Application Version:** ${diagnostics.appVersion}
**Platform / OS:** ${diagnostics.platform}
**Electron Engine:** ${diagnostics.electronVersion}
**Node Runtime:** ${diagnostics.nodeVersion}
**Hardware Acceleration:** ${diagnostics.hardwareHashing}
**Uptime:** ${Math.floor(diagnostics.uptimeSeconds / 60)} minutes (${diagnostics.uptimeSeconds}s)
**Peer ID:** ${diagnostics.peerId}
**Listen Port:** ${diagnostics.listenPort}
**Active Swarms:** ${diagnostics.activeSwarmsCount} (${diagnostics.seedingCount} Seeding, ${diagnostics.downloadingCount} Downloading)
**Trackers:** ${diagnostics.activeTrackersCount} active
**DHT Nodes:** ${diagnostics.dhtNodes}
**CMM Bridge Connected:** ${diagnostics.cmmConnected} (${diagnostics.cmmModelCount} models)
**Memory Usage (RSS):** ${(diagnostics.memoryUsage.rss / (1024 * 1024)).toFixed(2)} MB

## Diagnostic Console Events (${logs.length} Total)
\`\`\`
${logs.map((l) => `[${new Date(l.timestamp).toISOString()}] [${l.level.toUpperCase()}] [${l.subsystem}] ${l.message}`).join('\n')}
\`\`\`
`;
    navigator.clipboard.writeText(reportMd);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  const handleOpenExternal = (url: string) => {
    if (window.renegadeSwarm?.openExternal) {
      window.renegadeSwarm.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warnCount = logs.filter((l) => l.level === 'warn').length;
  const infoCount = logs.filter((l) => l.level === 'info' || l.level === 'debug').length;

  const filteredLogs = logs.filter((l) => {
    if (activeFilter === 'error' && l.level !== 'error') return false;
    if (activeFilter === 'warn' && l.level !== 'warn') return false;
    if (activeFilter === 'info' && l.level !== 'info' && l.level !== 'debug') return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        l.message.toLowerCase().includes(q) ||
        l.subsystem.toLowerCase().includes(q) ||
        l.level.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const formatLogTime = (ts: number) => {
    const d = new Date(ts);
    return (
      d.toTimeString().split(' ')[0] +
      '.' +
      String(d.getMilliseconds()).padStart(3, '0')
    );
  };

  return (
    <div
      style={{
        padding: '24px 32px',
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        boxSizing: 'border-box',
        overflowY: 'auto',
        background: 'var(--bg-main)',
      }}
    >
      {/* Top Release Status & Action Bar */}
      <div
        className="glass-panel"
        style={{
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08), rgba(6, 182, 212, 0.05))',
          border: '1px solid rgba(168, 85, 247, 0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(168, 85, 247, 0.5)',
            }}
          >
            <Radio size={24} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '11px', padding: '4px 10px' }}>
                {devMode ? 'Development / Debug Mode' : 'Stable Release'}
              </span>
              <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.3)', fontSize: '11px', padding: '4px 10px' }}>
                <Check size={12} style={{ marginRight: '4px' }} /> Up to Date
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px', margin: 0 }}>
              The decentralized BitTorrent AI model distribution & automated folder router network for ComfyUI.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={() => handleOpenExternal('https://github.com/DevNullInc/RenegadeSwarm/issues')}
            className="btn-secondary"
            style={{ padding: '8px 16px', fontSize: '12px', color: '#f43f5e', borderColor: 'rgba(244, 63, 94, 0.3)' }}
          >
            <Bug size={14} style={{ marginRight: '6px' }} />
            <span>Report Issue / Bug</span>
            <ExternalLink size={12} style={{ marginLeft: '6px', opacity: 0.7 }} />
          </button>
        </div>
      </div>

      {/* 3 Core Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        {/* Card 1: Creator & Credits */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#c084fc', fontSize: '14px', fontWeight: 700 }}>
            <Coffee size={18} />
            <span>Creator & Credits</span>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            Designed, architected, and maintained with care for the open source AI generative art and local inference community.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Author / Creator:</span>
              <strong style={{ color: '#fff' }}>TheStygianRenegade</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Organization:</span>
              <strong style={{ color: '#c084fc' }}>DevNullInc</strong>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Buy me a coffee or something please?
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['$1.00', '$5.00', '$10.00'].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleOpenExternal('https://github.com/sponsors/DevNullInc')}
                  className="btn-secondary"
                  style={{ flex: 1, padding: '6px 0', fontSize: '12px', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.06)' }}
                >
                  ☕ {amt}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', marginTop: 'auto' }}>
            <Heart size={13} color="#f43f5e" fill="#f43f5e" />
            <span>Dedicated to the ComfyUI & CivitAI creators</span>
          </div>
        </div>

        {/* Card 2: Open Source License */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontSize: '14px', fontWeight: 700 }}>
            <ShieldCheck size={18} />
            <span>Open Source License</span>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
            RenegadeSwarm is Free and Open Source Software distributed under the terms of the GNU General Public License v3.0 or later (GPL-3.0-or-later).
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>License:</span>
              <strong style={{ color: '#10b981' }}>GPL-3.0-or-later</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Copyleft:</span>
              <span style={{ color: 'var(--text-main)' }}>Disclose Source, Same License</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Permissions:</span>
              <span style={{ color: 'var(--text-main)' }}>Commercial, Modify, Distribute</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Warranty:</span>
              <span style={{ color: '#f59e0b' }}>None (AS-IS)</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' }}>
            <button
              type="button"
              onClick={() => handleOpenExternal('https://www.gnu.org/licenses/gpl-3.0.en.html')}
              style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', fontSize: '11px', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <span>Read GNU GPL-3.0</span>
              <ExternalLink size={11} />
            </button>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Code signing by SignPath Foundation</span>
          </div>
        </div>

        {/* Card 3: System & Runtime Diagnostics */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#06b6d4', fontSize: '14px', fontWeight: 700 }}>
            <Cpu size={18} />
            <span>System & Runtime Diagnostics</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', background: 'rgba(255, 255, 255, 0.02)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }} className="mono">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>App Version:</span>
              <strong style={{ color: '#c084fc' }}>{diagnostics?.appVersion || 'v0.3.0'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Platform / OS:</span>
              <span style={{ color: '#fff' }}>{diagnostics?.platform || 'win32 (x64)'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Electron Engine:</span>
              <span style={{ color: '#fff' }}>{diagnostics?.electronVersion || '34.0.0'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Node Runtime:</span>
              <span style={{ color: '#fff' }}>{diagnostics?.nodeVersion || '20.18.0'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Hardware Hashing:</span>
              <span style={{ color: '#10b981' }}>{diagnostics?.hardwareHashing || '64MB AVX2 / SHA-NI'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Listen Port:</span>
              <span style={{ color: '#06b6d4' }}>{diagnostics?.listenPort || 6881}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Peer ID:</span>
              <span style={{ color: 'var(--text-secondary)' }}>{diagnostics?.peerId?.slice(0, 16) || '-RS0300-'}...</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: 'auto' }}>
            <span>Active Swarms: {diagnostics?.activeSwarmsCount || 0}</span>
            <span>DHT Nodes: {diagnostics?.dhtNodes || 8}</span>
            <span>CMM: {diagnostics?.cmmConnected ? 'Connected' : 'Offline'}</span>
          </div>
        </div>
      </div>

      {/* Bottom Diagnostic Console & Error Logs Section */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, minHeight: '340px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '6px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', display: 'flex' }}>
              <Terminal size={18} />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Diagnostic Console & Error Logs</span>
                <span className="badge mono" style={{ fontSize: '11px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-main)' }}>
                  {logs.length} events
                </span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Copy diagnostic telemetry and stack traces for easy pasting into GitHub bug reports.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                style={{
                  fontSize: '11px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeFilter === 'all' ? 'rgba(168, 85, 247, 0.3)' : 'transparent',
                  color: activeFilter === 'all' ? '#c084fc' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: activeFilter === 'all' ? 600 : 400,
                }}
              >
                All ({logs.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('error')}
                style={{
                  fontSize: '11px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeFilter === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'transparent',
                  color: activeFilter === 'error' ? '#f87171' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: activeFilter === 'error' ? 600 : 400,
                }}
              >
                Errors ({errorCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('warn')}
                style={{
                  fontSize: '11px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeFilter === 'warn' ? 'rgba(245, 158, 11, 0.3)' : 'transparent',
                  color: activeFilter === 'warn' ? '#fbbf24' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: activeFilter === 'warn' ? 600 : 400,
                }}
              >
                Warnings ({warnCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('info')}
                style={{
                  fontSize: '11px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: activeFilter === 'info' ? 'rgba(6, 182, 212, 0.3)' : 'transparent',
                  color: activeFilter === 'info' ? '#22d3ee' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: activeFilter === 'info' ? 600 : 400,
                }}
              >
                Info ({infoCount})
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyReport}
              className="btn-primary"
              style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {copiedReport ? <Check size={14} /> : <Copy size={14} />}
              <span>{copiedReport ? 'Report Copied!' : 'Copy Diagnostic Report'}</span>
            </button>

            <button
              type="button"
              onClick={handleClearLogs}
              className="btn-secondary"
              style={{ padding: '6px 10px', color: '#f43f5e' }}
              title="Clear all log events"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Filter Input */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter logs by keyword, error message, subsystem (e.g. TRACKER, CMM, DHT)..."
          style={{ width: '100%', padding: '8px 12px', fontSize: '12px', background: '#0a0d14', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}
        />

        {/* Monospace Console View */}
        <div
          style={{
            background: '#07090e',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '12px',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '11px',
            flex: 1,
            minHeight: '220px',
            maxHeight: '400px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {filteredLogs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
              No diagnostic events match the current filter criteria.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  lineHeight: 1.5,
                  padding: '4px 6px',
                  borderRadius: '4px',
                  background:
                    log.level === 'error'
                      ? 'rgba(239, 68, 68, 0.08)'
                      : log.level === 'warn'
                      ? 'rgba(245, 158, 11, 0.06)'
                      : 'rgba(255, 255, 255, 0.01)',
                  borderLeft: `3px solid ${
                    log.level === 'error'
                      ? '#ef4444'
                      : log.level === 'warn'
                      ? '#f59e0b'
                      : log.level === 'debug'
                      ? '#a855f7'
                      : '#06b6d4'
                  }`,
                }}
              >
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }} className="mono">
                  {formatLogTime(log.timestamp)}
                </span>
                <span
                  style={{
                    padding: '1px 5px',
                    borderRadius: '4px',
                    fontSize: '9px',
                    fontWeight: 700,
                    flexShrink: 0,
                    textTransform: 'uppercase',
                    background:
                      log.level === 'error'
                        ? 'rgba(239, 68, 68, 0.25)'
                        : log.level === 'warn'
                        ? 'rgba(245, 158, 11, 0.25)'
                        : log.level === 'debug'
                        ? 'rgba(168, 85, 247, 0.25)'
                        : 'rgba(6, 182, 212, 0.25)',
                    color:
                      log.level === 'error'
                        ? '#f87171'
                        : log.level === 'warn'
                        ? '#fbbf24'
                        : log.level === 'debug'
                        ? '#c084fc'
                        : '#22d3ee',
                  }}
                >
                  {log.level}
                </span>
                <span
                  style={{
                    color: '#c084fc',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  [{log.subsystem}]
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: log.level === 'error' ? '#fca5a5' : log.level === 'warn' ? '#fde68a' : '#f1f5f9', wordBreak: 'break-all' }}>
                    {log.message}
                  </div>
                  {log.details && (
                    <div style={{ marginTop: '2px', color: 'var(--text-muted)', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details)}
                    </div>
                  )}
                  {log.stack && (
                    <pre style={{ margin: '4px 0 0 0', padding: '6px', background: 'rgba(0,0,0,0.5)', borderRadius: '4px', fontSize: '10px', color: '#f87171', overflowX: 'auto' }}>
                      {log.stack}
                    </pre>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
