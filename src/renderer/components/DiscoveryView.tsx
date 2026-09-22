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
  Search,
  Compass,
  ShieldCheck,
  ShieldAlert,
  Download,
  Filter,
  RefreshCw,
  Users,
  HardDrive,
  Sparkles,
  Layers,
} from 'lucide-react';
import { DiscoveredModelWithTrust, DiscoveryModelType } from '../../protocol/discoveryTypes';
import { AmberWarningModal } from './AmberWarningModal';
import { TabDebugDrawer } from './TabDebugDrawer';

interface DiscoveryViewProps {
  onSelectModelForDownload: (magnetUri: string, modelTitle?: string) => void;
  devMode?: boolean;
}

const MODEL_TYPE_FILTERS: { label: string; value?: DiscoveryModelType }[] = [
  { label: 'All Models' },
  { label: 'Checkpoints', value: 'CHECKPOINT' },
  { label: 'LoRAs', value: 'LORA' },
  { label: 'LLM / GGUF', value: 'GGUF_LLM' },
  { label: 'VAEs', value: 'VAE' },
  { label: 'Text Encoders', value: 'TEXT_ENCODER' },
  { label: 'ControlNets', value: 'CONTROLNET' },
];

export const DiscoveryView: React.FC<DiscoveryViewProps> = ({ onSelectModelForDownload, devMode = false }) => {
  const [query, setQuery] = useState('');
  const [selectedType, setSelectedType] = useState<DiscoveryModelType | undefined>(undefined);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [results, setResults] = useState<DiscoveredModelWithTrust[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [peerStats, setPeerStats] = useState({ connectedDiscoveryPeers: 0, indexedLocalModels: 0 });
  const [warningModel, setWarningModel] = useState<DiscoveredModelWithTrust | null>(null);

  const fetchStats = useCallback(async () => {
    if (window.renegadeSwarm?.getDiscoveryStats) {
      try {
        const res = await window.renegadeSwarm.getDiscoveryStats();
        if (res?.success && res.data) {
          setPeerStats({
            connectedDiscoveryPeers: res.data.connectedDiscoveryPeers || 0,
            indexedLocalModels: res.data.indexedLocalModels || 0,
          });
        }
      } catch { }
    }
  }, []);

  const performSearch = useCallback(async () => {
    if (!window.renegadeSwarm?.searchDiscoveredModels) return;

    setIsLoading(true);
    try {
      const res = await window.renegadeSwarm.searchDiscoveredModels({
        query: query.trim(),
        modelType: selectedType,
        verifiedOnly,
        limit: 50,
      });

      if (res?.success && Array.isArray(res.data)) {
        setResults(res.data);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error('Discovery search error:', err);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [query, selectedType, verifiedOnly]);

  // Initial load and periodic stats poll
  useEffect(() => {
    fetchStats();
    performSearch();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [fetchStats, performSearch]);

  const handleDownloadClick = (model: DiscoveredModelWithTrust) => {
    if (model.trustLevel === 'Untrusted' || !model.creatorPublicKey) {
      setWarningModel(model);
    } else {
      executeDownload(model);
    }
  };

  const executeDownload = (model: DiscoveredModelWithTrust) => {
    let magnet = `magnet:?xt=urn:btih:${model.infoHash}&dn=${encodeURIComponent(model.title)}`;
    if (model.urlList && model.urlList.length > 0) {
      for (const url of model.urlList) {
        magnet += `&ws=${encodeURIComponent(url)}`;
      }
    }
    onSelectModelForDownload(magnet, model.title);
  };

  const formatSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 MB';
    if (bytes >= 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{
      padding: '20px 24px',
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '18px',
      boxSizing: 'border-box',
      overflowY: 'auto',
      background: 'var(--bg-main)',
    }}>
      {/* Header & Network Telemetry */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        borderBottom: '1px solid var(--border-subtle)',
        paddingBottom: '16px',
      }}>
        <div>
          <h1 style={{
            fontSize: '22px',
            fontWeight: 800,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            letterSpacing: '-0.02em',
          }}>
            <Compass size={26} color="#06b6d4" className="spin" style={{ animationDuration: '8s' }} />
            <span>P2P Model Search & Discovery</span>
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Decentralized in-app model discovery broadcast exclusively across certified RenegadeSwarm peers.
          </p>
        </div>

        {/* Live Discovery Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            borderRadius: '10px',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            background: 'rgba(6, 182, 212, 0.08)',
            color: '#22d3ee',
            fontSize: '12px',
          }} className="mono">
            <Users size={14} color="#06b6d4" />
            <span>Swarm Nodes: <strong style={{ color: '#fff' }}>{peerStats.connectedDiscoveryPeers}</strong></span>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            borderRadius: '10px',
            border: '1px solid rgba(147, 51, 234, 0.3)',
            background: 'rgba(147, 51, 234, 0.08)',
            color: '#c084fc',
            fontSize: '12px',
          }} className="mono">
            <Layers size={14} color="#a855f7" />
            <span>Local Catalog: <strong style={{ color: '#fff' }}>{peerStats.indexedLocalModels}</strong></span>
          </div>

          <button
            onClick={() => {
              fetchStats();
              performSearch();
            }}
            disabled={isLoading}
            className="btn-secondary"
            style={{ padding: '8px 12px', borderRadius: '10px' }}
            title="Refresh Swarm Discovery"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Search Bar & Filter Controls */}
      <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Search Input Row */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && performSearch()}
              placeholder="Search by model title, creator handle, tags, base architecture (e.g. Flux, SDXL, Llama)..."
              style={{
                width: '100%',
                paddingLeft: '38px',
                paddingRight: '12px',
                height: '42px',
                fontSize: '13px',
                background: '#0c0f16',
              }}
            />
          </div>

          <button
            onClick={performSearch}
            disabled={isLoading}
            className="btn-cyan"
            style={{ height: '42px', padding: '0 20px', whiteSpace: 'nowrap' }}
          >
            {isLoading ? <RefreshCw size={15} className="animate-spin" /> : <Search size={15} />}
            <span>Search Swarm</span>
          </button>
        </div>

        {/* Filter Chips & Verification Toggle */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginRight: '4px', fontWeight: 600 }}>
              <Filter size={13} /> Filters:
            </span>
            {MODEL_TYPE_FILTERS.map((f) => {
              const active = selectedType === f.value;
              return (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => setSelectedType(f.value)}
                  className={`filter-chip ${active ? 'filter-chip-active' : ''}`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              style={{ accentColor: '#06b6d4', width: '15px', height: '15px', cursor: 'pointer' }}
            />
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <ShieldCheck size={15} color="#10b981" />
              <span style={{ color: '#fff', fontWeight: 500 }}>Verified Creators Only</span>
            </span>
          </label>
        </div>
      </div>

      {/* Results Section */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {isLoading ? (
          <div style={{ height: '240px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--text-muted)' }}>
            <RefreshCw size={28} color="#06b6d4" className="animate-spin" />
            <p style={{ fontSize: '13px' }} className="mono">Broadcasting query across active RenegadeSwarm peers...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="glass-panel" style={{
            height: '240px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            textAlign: 'center',
            padding: '24px',
            borderStyle: 'dashed',
          }}>
            <Sparkles size={36} color="var(--text-muted)" />
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
              No matching models found in active swarm
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '460px', lineHeight: 1.5 }}>
              Search queries live-broadcast to connected RenegadeSwarm peers. Try broadening your keywords, clearing filters, or seeding models in the <strong>Package & Seed</strong> tab.
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '16px',
            paddingBottom: '20px',
          }}>
            {results.map((model) => (
              <div key={model.infoHash} className="model-card">
                <div>
                  {/* Top Bar: Model Type & Trust Badge */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
                    <span className="badge" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.3)' }}>
                      {model.modelType}
                    </span>

                    {model.trustLevel === 'VerifiedCreator' ? (
                      <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                        <ShieldCheck size={12} />
                        <span>Verified</span>
                      </span>
                    ) : model.trustLevel === 'Community' ? (
                      <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                        <ShieldAlert size={12} />
                        <span>Community</span>
                      </span>
                    ) : (
                      <span className="badge" style={{ background: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>
                        <span>Unverified</span>
                      </span>
                    )}
                  </div>

                  {/* Title & Base Model */}
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={model.title}>
                    {model.title}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>Base:</span>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{model.baseModel || 'General AI'}</span>
                    {model.creator && (
                      <>
                        <span style={{ color: 'var(--border-subtle)' }}>•</span>
                        <span>by</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{model.creator}</span>
                      </>
                    )}
                  </div>

                  {/* Description */}
                  {model.description && (
                    <p style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      marginTop: '8px',
                      lineHeight: 1.4,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {model.description}
                    </p>
                  )}

                  {/* Tags */}
                  {model.tags && model.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '10px' }}>
                      {model.tags.slice(0, 3).map((t) => (
                        <span key={t} style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border-subtle)',
                        }}>
                          #{t}
                        </span>
                      ))}
                      {model.tags.length > 3 && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', alignSelf: 'center' }}>
                          +{model.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Bar: File Size, Peer Count, Download Button */}
                <div style={{
                  marginTop: '16px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: 'var(--text-muted)' }} className="mono">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <HardDrive size={13} color="var(--text-muted)" />
                      {formatSize(model.totalSizeBytes)}
                    </span>
                    {model.peerCount !== undefined && model.peerCount > 1 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#06b6d4' }}>
                        <Users size={13} />
                        {model.peerCount}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleDownloadClick(model)}
                    className="btn-cyan"
                    style={{ padding: '6px 14px', fontSize: '12px' }}
                  >
                    <Download size={13} />
                    <span>Download</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Amber Warning Modal for Unverified Models */}
      {warningModel && (
        <AmberWarningModal
          model={warningModel}
          isOpen={!!warningModel}
          onClose={() => setWarningModel(null)}
          onProceed={(m) => executeDownload(m)}
        />
      )}

      {/* In-Tab Debug & Telemetry Drawer */}
      <TabDebugDrawer tabId="discovery" devMode={devMode} tabLabel="P2P Discovery & DHT Telemetry" />
    </div>
  );
};
