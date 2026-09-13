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

interface DiscoveryViewProps {
  onSelectModelForDownload: (magnetUri: string, modelTitle?: string) => void;
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

export const DiscoveryView: React.FC<DiscoveryViewProps> = ({ onSelectModelForDownload }) => {
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
    <div className="flex-1 flex flex-col min-h-0 bg-[#07090e] p-6 space-y-6 overflow-y-auto">
      {/* Header & Network Telemetry */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <Compass className="h-7 w-7 text-cyan-400 animate-pulse" />
            P2P Model Search & Discovery
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Decentralized in-app model discovery broadcast exclusively across certified RenegadeSwarm peers.
          </p>
        </div>

        {/* Live Discovery Stats */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-cyan-500/20 bg-cyan-950/20 text-cyan-300 text-xs font-mono">
            <Users className="h-3.5 w-3.5 text-cyan-400" />
            <span>
              Swarm Nodes: <strong className="text-white">{peerStats.connectedDiscoveryPeers}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-purple-500/20 bg-purple-950/20 text-purple-300 text-xs font-mono">
            <Layers className="h-3.5 w-3.5 text-purple-400" />
            <span>
              Local Catalog: <strong className="text-white">{peerStats.indexedLocalModels}</strong>
            </span>
          </div>
          <button
            onClick={() => {
              fetchStats();
              performSearch();
            }}
            disabled={isLoading}
            className="p-2 rounded-xl border border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
            title="Refresh Swarm Discovery"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search Bar & Filters */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && performSearch()}
              placeholder="Search by model title, creator handle, tags, base architecture (e.g. Flux, SDXL, Llama)..."
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/90 border border-zinc-800 rounded-xl text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors shadow-inner"
            />
          </div>

          <button
            onClick={performSearch}
            disabled={isLoading}
            className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-950/40 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search Swarm
          </button>
        </div>

        {/* Filter Chips & Verification Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500 flex items-center gap-1 font-medium mr-1">
              <Filter className="h-3 w-3" /> Filters:
            </span>
            {MODEL_TYPE_FILTERS.map((f) => {
              const active = selectedType === f.value;
              return (
                <button
                  key={f.label}
                  onClick={() => setSelectedType(f.value)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'bg-cyan-500 text-black font-bold shadow-md shadow-cyan-950/40'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              className="rounded bg-zinc-900 border-zinc-700 text-cyan-500 focus:ring-cyan-500"
            />
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Verified Creators Only
            </span>
          </label>
        </div>
      </div>

      {/* Results Grid / List */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-zinc-500">
            <RefreshCw className="h-8 w-8 animate-spin text-cyan-400" />
            <p className="text-xs font-mono">Broadcasting query across active RenegadeSwarm peers...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-center p-6 border border-dashed border-zinc-800/80 rounded-2xl bg-zinc-950/30">
            <Sparkles className="h-10 w-10 text-zinc-600" />
            <div className="text-sm font-semibold text-zinc-300">No matching models found in active swarm</div>
            <p className="text-xs text-zinc-500 max-w-md">
              Search queries live-broadcast to connected RenegadeSwarm peers. Try broadening your keywords, clearing filters, or seeding models in the <strong>Package & Seed</strong> tab.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((model) => (
              <div
                key={model.infoHash}
                className="group relative rounded-2xl border border-zinc-800/90 bg-gradient-to-b from-zinc-900/70 to-zinc-950/80 p-4 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-950/20 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top Bar: Type & Trust Badge */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-800 text-cyan-300 border border-zinc-700/50">
                      {model.modelType}
                    </span>

                    {model.trustLevel === 'VerifiedCreator' ? (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        <ShieldCheck className="h-3 w-3" />
                        🟢 Verified
                      </span>
                    ) : model.trustLevel === 'Community' ? (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                        <ShieldAlert className="h-3 w-3" />
                        🟡 Community
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800/80 text-zinc-400 border border-zinc-700">
                        ⚪ Unverified
                      </span>
                    )}
                  </div>

                  {/* Title & Base Model */}
                  <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                    {model.title}
                  </h3>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    Base: <span className="text-zinc-200">{model.baseModel || 'General AI'}</span>
                  </div>

                  {/* Description snippet */}
                  {model.description && (
                    <p className="text-xs text-zinc-400 mt-2 line-clamp-2 leading-relaxed">
                      {model.description}
                    </p>
                  )}

                  {/* Tags */}
                  {model.tags && model.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {model.tags.slice(0, 3).map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded bg-zinc-800/60 text-[10px] text-zinc-400 border border-zinc-800">
                          #{t}
                        </span>
                      ))}
                      {model.tags.length > 3 && (
                        <span className="text-[10px] text-zinc-500 self-center">+{model.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Bottom Bar: Metadata & Action Button */}
                <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                  <div className="text-xs font-mono text-zinc-400 flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3 text-zinc-500" />
                      {formatSize(model.totalSizeBytes)}
                    </span>
                    {model.peerCount !== undefined && model.peerCount > 1 && (
                      <span className="flex items-center gap-1 text-cyan-400">
                        <Users className="h-3 w-3" />
                        {model.peerCount} peers
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleDownloadClick(model)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-black font-bold text-xs rounded-xl shadow-md transition-all hover:scale-105 active:scale-95"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
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
    </div>
  );
};
