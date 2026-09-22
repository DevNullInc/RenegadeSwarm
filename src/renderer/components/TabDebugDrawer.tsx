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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Terminal,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Copy,
  Check,
  Zap,
  Bug,
  Search,
} from 'lucide-react';
import { DiagnosticLogEvent, TabTelemetry } from '../../shared/ipcContracts';

interface TabDebugDrawerProps {
  tabId: string;
  devMode: boolean;
  tabLabel?: string;
}

export const TabDebugDrawer: React.FC<TabDebugDrawerProps> = ({ tabId, devMode, tabLabel }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [telemetry, setTelemetry] = useState<TabTelemetry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filterLevel, setFilterLevel] = useState<'all' | 'error' | 'warn' | 'info' | 'debug'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [drawerHeight, setDrawerHeight] = useState<number>(360);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartYRef = useRef<number>(0);
  const dragStartHeightRef = useRef<number>(360);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const fetchTelemetry = useCallback(async () => {
    if (!devMode || !window.renegadeSwarm?.getTabTelemetry) return;
    try {
      setIsLoading(true);
      const res = await window.renegadeSwarm.getTabTelemetry(tabId);
      if (res.success && res.data) {
        setTelemetry(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch tab telemetry:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tabId, devMode]);

  useEffect(() => {
    if (devMode) {
      fetchTelemetry();
      const interval = setInterval(fetchTelemetry, 3000);
      return () => clearInterval(interval);
    }
  }, [devMode, fetchTelemetry]);

  // Tab-to-Subsystem Mapping for strict per-tab isolation
  const isSubsystemAllowed = useCallback((subsystem: string) => {
    switch (tabId) {
      case 'dashboard':
        return ['TRACKER', 'SWARM'].includes(subsystem);
      case 'discovery':
        return ['DISCOVERY', 'DHT'].includes(subsystem);
      case 'seeder':
        return ['SEEDER', 'MANIFEST', 'PACKAGE', 'HASHING'].includes(subsystem);
      case 'cmm':
        return ['CMM', 'SQLITE', 'SYNC'].includes(subsystem);
      case 'bandwidth':
        return ['BANDWIDTH', 'QUOTA', 'RATE', 'SOCKET'].includes(subsystem);
      case 'settings':
        return ['SECURITY', 'KEYRING', 'CONFIG'].includes(subsystem);
      default:
        return false;
    }
  }, [tabId]);

  // Subscribe to live push log events strictly filtered to this tab
  useEffect(() => {
    if (!devMode || !window.renegadeSwarm?.onDebugLog) return;
    const unsub = window.renegadeSwarm.onDebugLog((event: DiagnosticLogEvent) => {
      if (!isSubsystemAllowed(event.subsystem)) return;
      setTelemetry((prev) => {
        if (!prev) return prev;
        const exists = prev.recentLogs.some((l) => l.id === event.id);
        if (exists) return prev;
        return {
          ...prev,
          recentLogs: [...prev.recentLogs.slice(-99), event],
        };
      });
    });
    return () => unsub();
  }, [devMode, isSubsystemAllowed]);

  // Handle Drag Resizing on Top Edge
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOpen) {
      setIsOpen(true);
    }
    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = drawerHeight;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = dragStartYRef.current - e.clientY;
      const maxHeight = Math.max(400, window.innerHeight - 120);
      const newHeight = Math.min(maxHeight, Math.max(180, dragStartHeightRef.current + deltaY));
      setDrawerHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!devMode) return null;

  const logs = (telemetry?.recentLogs || [])
    .filter((l) => isSubsystemAllowed(l.subsystem))
    .filter((l) => {
      if (filterLevel !== 'all' && l.level !== filterLevel) return false;
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase();
        const matchMsg = l.message.toLowerCase().includes(q);
        const matchSub = l.subsystem.toLowerCase().includes(q);
        return matchMsg || matchSub;
      }
      return true;
    });

  const handleCopyTelemetry = () => {
    if (!telemetry) return;
    const report = JSON.stringify(telemetry, null, 2);
    navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
  };

  return (
    <div
      style={{
        marginTop: 'auto',
        borderRadius: '10px',
        border: isDragging ? '1px solid rgba(168, 85, 247, 0.8)' : '1px solid rgba(168, 85, 247, 0.35)',
        background: 'rgba(13, 17, 23, 0.98)',
        boxShadow: isDragging ? '0 0 24px rgba(168, 85, 247, 0.35)' : '0 8px 32px rgba(0, 0, 0, 0.5)',
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        height: isOpen ? `${drawerHeight}px` : 'auto',
        maxHeight: isOpen ? `${drawerHeight}px` : '42px',
        transition: isDragging ? 'none' : 'height 0.2s ease, border-color 0.2s ease',
        userSelect: isDragging ? 'none' : 'auto',
      }}
    >
      {/* Top Edge Grabbable Resizer Bar */}
      <div
        onMouseDown={handleMouseDownResize}
        title="Drag up or down to resize debug drawer"
        style={{
          height: '7px',
          width: '100%',
          cursor: 'ns-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isDragging
            ? 'linear-gradient(90deg, #a855f7, #06b6d4, #a855f7)'
            : 'linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.4), rgba(6, 182, 212, 0.4), transparent)',
          transition: 'background 0.2s ease',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '3px',
            borderRadius: '2px',
            background: isDragging ? '#ffffff' : 'rgba(255, 255, 255, 0.4)',
          }}
        />
      </div>

      {/* Drawer Header / Bar */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 16px',
          background: 'linear-gradient(90deg, rgba(168, 85, 247, 0.14), rgba(6, 182, 212, 0.08))',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: isOpen ? '1px solid rgba(168, 85, 247, 0.2)' : 'none',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              padding: '4px',
              borderRadius: '6px',
              background: 'rgba(168, 85, 247, 0.2)',
              color: '#c084fc',
              display: 'flex',
            }}
          >
            <Bug size={14} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>DEBUG TELEMETRY:</span>
            <span style={{ color: '#c084fc' }}>{tabLabel || tabId.toUpperCase()}</span>
          </span>
          <span className="badge mono" style={{ fontSize: '10px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
            Live Probe (3s) • Resizable
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isOpen && (
            <div style={{ display: 'flex', gap: '6px' }} onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={fetchTelemetry}
                disabled={isLoading}
                className="btn-secondary"
                style={{ padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Refresh Telemetry"
              >
                <RefreshCw size={11} className={isLoading ? 'spin' : ''} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={handleCopyTelemetry}
                className="btn-secondary"
                style={{ padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Copy telemetry JSON"
              >
                {copied ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          )}
          <button
            type="button"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              padding: '2px',
            }}
          >
            {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded Telemetry & Console Body */}
      {isOpen && (
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            flex: 1,
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {/* Metrics Key-Value Grid */}
          {telemetry?.metrics && Object.keys(telemetry.metrics).length > 0 && (
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Zap size={12} color="#c084fc" />
                <span>Subsystem Key Performance Indicators & Sockets</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', maxHeight: '110px', overflowY: 'auto' }}>
                {Object.entries(telemetry.metrics).map(([key, val]) => (
                  <div
                    key={key}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '6px',
                      padding: '5px 8px',
                      fontSize: '11px',
                    }}
                  >
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase' }} className="mono">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </div>
                    <div style={{ color: '#fff', fontWeight: 600, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="mono" title={String(val)}>
                      {Array.isArray(val) ? `${val.length} items (${val.slice(0, 2).join(', ')}...)` : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab Subsystem Event Log */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px', flexShrink: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Terminal size={12} color="#06b6d4" />
                <span>Recent Diagnostics ({logs.length} events)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={10} style={{ position: 'absolute', left: '6px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Filter logs..."
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    style={{
                      padding: '2px 6px 2px 20px',
                      fontSize: '10px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '4px',
                      color: '#fff',
                      width: '120px',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['all', 'info', 'warn', 'error', 'debug'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setFilterLevel(lvl)}
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-subtle)',
                        background: filterLevel === lvl ? 'rgba(168, 85, 247, 0.25)' : 'transparent',
                        color: filterLevel === lvl ? '#c084fc' : 'var(--text-muted)',
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                      }}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div
              ref={logContainerRef}
              style={{
                background: '#07090e',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                padding: '8px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '11px',
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                minHeight: '80px',
              }}
            >
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                  No matching diagnostic events recorded for this view.
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      lineHeight: 1.4,
                      color:
                        log.level === 'error'
                          ? '#f87171'
                          : log.level === 'warn'
                          ? '#fbbf24'
                          : log.level === 'debug'
                          ? '#a855f7'
                          : '#e2e8f0',
                    }}
                  >
                    <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>[{formatTime(log.timestamp)}]</span>
                    <span
                      style={{
                        padding: '1px 4px',
                        borderRadius: '3px',
                        fontSize: '9px',
                        fontWeight: 700,
                        flexShrink: 0,
                        background:
                          log.level === 'error'
                            ? 'rgba(239, 68, 68, 0.2)'
                            : log.level === 'warn'
                            ? 'rgba(245, 158, 11, 0.2)'
                            : log.level === 'debug'
                            ? 'rgba(168, 85, 247, 0.2)'
                            : 'rgba(6, 182, 212, 0.2)',
                      }}
                    >
                      {log.subsystem}
                    </span>
                    <span style={{ wordBreak: 'break-all' }}>{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
