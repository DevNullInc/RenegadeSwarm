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

import { randomUUID } from 'node:crypto';
import {
  DiscoveredModelEntry,
  DiscoveredModelWithTrust,
  DiscoveryModelType,
  DiscoveryCatalogQuery,
  DiscoveryCatalogResponse,
  DiscoveryTrustLevel,
  DiscoveryCatalogQuerySchema,
  DiscoveryCatalogResponseSchema,
  DiscoveryCatalogAnnounceSchema,
  RENEGADE_SWARM_DISCOVERY_EXTENSION,
} from '../../protocol/discoveryTypes';
import { KeyringManager, keyringManager } from './keyringManager';
import { verifyEd25519Signature } from '../../protocol/crypto';
import { debugLogManager } from '../telemetry/debugLogManager';
import { trackerManager } from './trackerManager';
import { swarmEngine } from './swarmEngine';

export interface DiscoveryPeerConnection {
  peerId: string;
  ip: string;
  port: number;
  extensionId: number; // Remote peer's assigned ID for rs_discovery_v1
  sendDiscoveryMessage: (type: 'catalog_query' | 'catalog_response' | 'catalog_announce', payload: any) => void;
}

export interface DiscoveryEngineStats {
  connectedDiscoveryPeers: number;
  indexedLocalModels: number;
  cachedDiscoveredModels: number;
  totalQueriesProcessed: number;
}

export const MAX_DISCOVERED_CACHE_SIZE = 2000;
export const MAX_MESSAGES_PER_SEC_PER_PEER = 20;

export function normalizeDiscoveryModelType(rawType?: string): DiscoveryModelType {
  if (!rawType) return 'CHECKPOINT';
  const clean = rawType.toUpperCase().replace(/[\s\-_]/g, '');
  if (clean === 'CHECKPOINT') return 'CHECKPOINT';
  if (clean === 'LORA' || clean === 'LOCON') return 'LORA';
  if (clean === 'GGUFLLM' || clean === 'LLM' || clean === 'GGUF') return 'GGUF_LLM';
  if (clean === 'VAE') return 'VAE';
  if (clean === 'TEXTENCODER') return 'TEXT_ENCODER';
  if (clean === 'CONTROLNET') return 'CONTROLNET';
  if (clean === 'DIFFUSIONMODEL' || clean === 'UNET') return 'DIFFUSION_MODEL';
  if (clean === 'EMBEDDING' || clean === 'TEXTUALINVERSION') return 'EMBEDDING';
  return 'OTHER';
}

export class DiscoveryEngine {
  private localCatalog: Map<string, DiscoveredModelEntry> = new Map(); // Key: infoHash
  private discoveredCache: Map<string, DiscoveredModelWithTrust> = new Map(); // Key: infoHash
  private discoveryPeers: Map<string, DiscoveryPeerConnection> = new Map(); // Key: peerId
  private peerRateLimits: Map<string, { count: number; resetTime: number }> = new Map();
  private pendingQueries: Map<string, {
    resolve: (models: DiscoveredModelWithTrust[]) => void;
    results: Map<string, DiscoveredModelWithTrust>;
    timeout: NodeJS.Timeout;
  }> = new Map();

  private keyringManager?: KeyringManager;
  private totalQueriesProcessed = 0;

  constructor(keyringManager?: KeyringManager) {
    this.keyringManager = keyringManager;
  }

  public setKeyringManager(km: KeyringManager) {
    this.keyringManager = km;
  }

  // --- Local Catalog Management ---------------------------------------------

  public syncActiveSwarms() {
    try {
      const activeTorrents = swarmEngine.getActiveTorrents();
      for (const torrent of activeTorrents) {
        const manifest = (swarmEngine as any).manifests?.get(torrent.infoHash.toLowerCase());
        this.indexLocalModel({
          infoHash: torrent.infoHash.toLowerCase(),
          title: torrent.title,
          version: manifest?.model?.version || '1.0.0',
          modelType: normalizeDiscoveryModelType(torrent.modelType || manifest?.model?.modelType),
          baseModel: torrent.baseModel || manifest?.model?.baseModel || 'SD 1.5',
          totalSizeBytes: torrent.totalBytes,
          sha256: manifest?.hashes?.sha256 || torrent.infoHash,
          creator: manifest?.model?.creator || 'Local Seeder',
          creatorPublicKey: manifest?.model?.creatorPublicKey,
          signature: manifest?.signature?.signature,
          publishedAt: Date.now(),
          tags: manifest?.model?.tags || [torrent.modelType || 'Model'],
          description: manifest?.model?.description || `Active swarm transfer: ${torrent.title}`,
          urlList: manifest?.urlList || [],
          nsfw: manifest?.model?.nsfw || false,
        });
      }
    } catch {}
  }

  public indexLocalModel(model: DiscoveredModelEntry) {
    this.localCatalog.set(model.infoHash.toLowerCase(), {
      ...model,
      infoHash: model.infoHash.toLowerCase(),
    });
  }

  public removeLocalModel(infoHash: string) {
    this.localCatalog.delete(infoHash.toLowerCase());
  }

  public clearLocalCatalog() {
    this.localCatalog.clear();
  }

  public getLocalCatalog(): DiscoveredModelEntry[] {
    return Array.from(this.localCatalog.values());
  }

  // --- Peer Registration & BEP 10 Lifecycle ---------------------------------

  public registerDiscoveryPeer(peer: DiscoveryPeerConnection) {
    this.discoveryPeers.set(peer.peerId, peer);
  }

  public unregisterDiscoveryPeer(peerId: string) {
    this.discoveryPeers.delete(peerId);
    this.peerRateLimits.delete(peerId);
  }

  public getConnectedDiscoveryPeersCount(): number {
    return this.discoveryPeers.size;
  }

  // --- Inbound Message Handling ---------------------------------------------

  private checkPeerRateLimit(peerId: string): boolean {
    const now = Date.now();
    let rl = this.peerRateLimits.get(peerId);
    if (!rl || now - rl.resetTime >= 1000) {
      rl = { count: 1, resetTime: now };
      this.peerRateLimits.set(peerId, rl);
      return true;
    }

    if (rl.count >= MAX_MESSAGES_PER_SEC_PER_PEER) {
      return false; // Rate limit exceeded
    }

    rl.count++;
    return true;
  }

  public handleInboundMessage(fromPeerId: string, type: string, payload: any) {
    if (!this.checkPeerRateLimit(fromPeerId)) {
      return; // Drop flood messages from this peer
    }

    this.totalQueriesProcessed++;

    switch (type) {
      case 'catalog_query':
        this.handleInboundQuery(fromPeerId, payload);
        break;
      case 'catalog_response':
        this.handleInboundResponse(fromPeerId, payload);
        break;
      case 'catalog_announce':
        this.handleInboundAnnounce(fromPeerId, payload);
        break;
    }
  }

  private handleInboundQuery(fromPeerId: string, rawPayload: any) {
    const parseResult = DiscoveryCatalogQuerySchema.safeParse(rawPayload);
    if (!parseResult.success) return;

    const query = parseResult.data;
    const peer = this.discoveryPeers.get(fromPeerId);
    if (!peer) return;

    // Filter local models matching query
    const matching = this.queryCatalog(this.getLocalCatalog(), query);
    const response: DiscoveryCatalogResponse = {
      queryId: query.queryId,
      responderPeerId: 'local',
      models: matching.slice(0, query.limit || 50),
    };

    peer.sendDiscoveryMessage('catalog_response', response);
  }

  private handleInboundResponse(fromPeerId: string, rawPayload: any) {
    const parseResult = DiscoveryCatalogResponseSchema.safeParse(rawPayload);
    if (!parseResult.success) return;

    const response = parseResult.data;
    const pending = this.pendingQueries.get(response.queryId);

    for (const model of response.models) {
      const modelWithTrust = this.evaluateModelTrust(model, fromPeerId);
      if (modelWithTrust.trustLevel !== 'Blocked') {
        this.cacheDiscoveredModel(modelWithTrust);
        if (pending) {
          pending.results.set(modelWithTrust.infoHash, modelWithTrust);
        }
      }
    }
  }

  private handleInboundAnnounce(fromPeerId: string, rawPayload: any) {
    const parseResult = DiscoveryCatalogAnnounceSchema.safeParse(rawPayload);
    if (!parseResult.success) return;

    for (const model of parseResult.data.models) {
      const modelWithTrust = this.evaluateModelTrust(model, fromPeerId);
      if (modelWithTrust.trustLevel !== 'Blocked') {
        this.cacheDiscoveredModel(modelWithTrust);
      }
    }
  }

  // --- Outbound Search & Aggregation ----------------------------------------

  public async search(queryText: string, options: {
    modelType?: any;
    baseModel?: string;
    verifiedOnly?: boolean;
    timeoutMs?: number;
    limit?: number;
  } = {}): Promise<DiscoveredModelWithTrust[]> {
    this.syncActiveSwarms();

    const queryId = randomUUID();
    const query: DiscoveryCatalogQuery = {
      queryId,
      query: queryText.trim(),
      modelType: options.modelType,
      baseModel: options.baseModel,
      verifiedOnly: options.verifiedOnly ?? false,
      limit: options.limit ?? 50,
    };

    debugLogManager.logInfo('DISCOVERY', `Initiating P2P model discovery search for "${queryText || '*'}"...`, {
      query: queryText,
      modelType: options.modelType || 'ALL',
      baseModel: options.baseModel || 'ALL',
      verifiedOnly: options.verifiedOnly ?? false,
    });

    // 1. Gather local matches first
    const localMatches = this.queryCatalog(this.getLocalCatalog(), query).map(m => this.evaluateModelTrust(m, 'local'));

    // 2. Gather matching models from memory cache
    const cachedMatches = this.queryCatalog(
      Array.from(this.discoveredCache.values()),
      query
    ) as DiscoveredModelWithTrust[];

    const aggregated = new Map<string, DiscoveredModelWithTrust>();
    for (const m of localMatches) aggregated.set(m.infoHash, m);
    for (const m of cachedMatches) {
      if (!aggregated.has(m.infoHash)) {
        aggregated.set(m.infoHash, m);
      }
    }

    debugLogManager.logDebug('DISCOVERY', `Found ${localMatches.length} local and ${cachedMatches.length} cached match(es). Inspecting peer health across swarm mesh...`);

    // 3. For any matched models, sync live peer counts from active swarms or trackers
    for (const model of aggregated.values()) {
      const activeTorrent = swarmEngine.getTorrent(model.infoHash);
      if (activeTorrent) {
        model.peerCount = Math.max(1, (activeTorrent.seedersConnected || 0) + (activeTorrent.peersConnected || 0));
      }
    }

    // 4. If we have connected discovery peers, broadcast query and await responses
    const peers = Array.from(this.discoveryPeers.values());
    if (peers.length > 0) {
      const timeoutMs = options.timeoutMs ?? 1500; // 1.5s fast query timeout
      debugLogManager.logInfo('DISCOVERY', `Broadcasting catalog_query to ${peers.length} connected BEP 10 discovery peer(s)...`);

      await new Promise<void>((resolve) => {
        const timeoutHandle = setTimeout(() => {
          this.pendingQueries.delete(queryId);
          resolve();
        }, timeoutMs);

        this.pendingQueries.set(queryId, {
          resolve: () => {
            clearTimeout(timeoutHandle);
            this.pendingQueries.delete(queryId);
            resolve();
          },
          results: aggregated,
          timeout: timeoutHandle,
        });

        // Broadcast query to all connected RenegadeSwarm discovery peers
        for (const peer of peers) {
          try {
            peer.sendDiscoveryMessage('catalog_query', query);
          } catch { }
        }
      });
    }

    // 5. Sort and return results: Verified first, then Community, then Untrusted
    const resultList = Array.from(aggregated.values());
    const ranked = this.rankDiscoveredModels(resultList, query.verifiedOnly);

    debugLogManager.logInfo('DISCOVERY', `Discovery search completed: ${ranked.length} model(s) found matching "${queryText || '*'}"`, {
      totalFound: ranked.length,
      sample: ranked.slice(0, 3).map(r => ({ title: r.title, trust: r.trustLevel, peers: r.peerCount })),
    });

    return ranked;
  }

  // --- Helpers & Evaluation -------------------------------------------------

  public evaluateModelTrust(model: DiscoveredModelEntry, sourcePeerId?: string): DiscoveredModelWithTrust {
    let trustLevel: DiscoveryTrustLevel = 'Untrusted';
    let trustScore = 10;

    if (model.creatorPublicKey) {
      const pubKey = model.creatorPublicKey.toLowerCase();

      // Check against local keyring if available
      if (this.keyringManager) {
        const verification = this.keyringManager.verifyCreator(model.creator, pubKey);
        if (verification.isKnown) {
          if (verification.trustLevel === 'Blocked') {
            return {
              ...model,
              trustLevel: 'Blocked',
              trustScore: 0,
              firstSeenAt: Date.now(),
              lastSeenAt: Date.now(),
              sourcePeerId,
            };
          } else if (verification.trustLevel === 'VerifiedCreator') {
            trustLevel = 'VerifiedCreator';
            trustScore = 100;
          } else if (verification.trustLevel === 'Community') {
            trustLevel = 'Community';
            trustScore = 60;
          }
        }
      }

      // If signed and not blocked, verify mathematical signature
      if (model.signature && trustLevel !== 'VerifiedCreator') {
        const messageToVerify = `${model.infoHash}:${model.title}:${model.totalSizeBytes}:${model.publishedAt}`;
        const isValidSig = verifyEd25519Signature(
          Buffer.from(messageToVerify, 'utf8'),
          model.signature,
          model.creatorPublicKey
        );

        if (isValidSig) {
          trustLevel = 'Community';
          trustScore = 50;
        }
      }
    }

    const existing = this.discoveredCache.get(model.infoHash.toLowerCase());
    const now = Date.now();

    return {
      ...model,
      infoHash: model.infoHash.toLowerCase(),
      trustLevel,
      trustScore,
      peerCount: (existing?.peerCount ?? 0) + 1,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
      sourcePeerId,
    };
  }

  private cacheDiscoveredModel(model: DiscoveredModelWithTrust) {
    if (!this.discoveredCache.has(model.infoHash) && this.discoveredCache.size >= MAX_DISCOVERED_CACHE_SIZE) {
      // Find oldest entry to evict
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      for (const [key, entry] of this.discoveredCache.entries()) {
        if (entry.lastSeenAt < oldestTime) {
          oldestTime = entry.lastSeenAt;
          oldestKey = key;
        }
      }
      if (oldestKey) {
        this.discoveredCache.delete(oldestKey);
      }
    }
    this.discoveredCache.set(model.infoHash, model);
  }

  private queryCatalog<T extends DiscoveredModelEntry>(catalog: T[], query: DiscoveryCatalogQuery): T[] {
    const q = (query.query || '').trim().toLowerCase();

    return catalog.filter((m) => {
      if (query.modelType) {
        const queryType = normalizeDiscoveryModelType(query.modelType);
        const modelType = normalizeDiscoveryModelType(m.modelType);
        if (queryType !== modelType) return false;
      }

      if (query.baseModel && query.baseModel !== 'All' && !(m.baseModel || '').toLowerCase().includes(query.baseModel.toLowerCase())) {
        return false;
      }

      if (q) {
        const matchTitle = (m.title || '').toLowerCase().includes(q);
        const matchCreator = (m.creator || '').toLowerCase().includes(q);
        const matchTags = Array.isArray(m.tags) && m.tags.some(t => String(t).toLowerCase().includes(q));
        const matchDesc = (m.description || '').toLowerCase().includes(q);
        const matchBase = (m.baseModel || '').toLowerCase().includes(q);
        const matchHash = (m.infoHash || '').toLowerCase().includes(q) || (m.sha256 && m.sha256.toLowerCase().includes(q));

        if (!matchTitle && !matchCreator && !matchTags && !matchDesc && !matchBase && !matchHash) {
          return false;
        }
      }

      return true;
    });
  }

  private rankDiscoveredModels(models: DiscoveredModelWithTrust[], verifiedOnly = false): DiscoveredModelWithTrust[] {
    const filtered = verifiedOnly
      ? models.filter(m => m.trustLevel === 'VerifiedCreator')
      : models.filter(m => m.trustLevel !== 'Blocked');

    return filtered.sort((a, b) => {
      // 1. Sort by trust score (descending)
      if (b.trustScore !== a.trustScore) {
        return b.trustScore - a.trustScore;
      }
      // 2. Sort by peer count (descending)
      if ((b.peerCount ?? 1) !== (a.peerCount ?? 1)) {
        return (b.peerCount ?? 1) - (a.peerCount ?? 1);
      }
      // 3. Sort by publish / seen date (descending)
      return b.publishedAt - a.publishedAt;
    });
  }

  public getStats(): DiscoveryEngineStats {
    return {
      connectedDiscoveryPeers: this.discoveryPeers.size,
      indexedLocalModels: this.localCatalog.size,
      cachedDiscoveredModels: this.discoveredCache.size,
      totalQueriesProcessed: this.totalQueriesProcessed,
    };
  }
}

export const discoveryEngine = new DiscoveryEngine(keyringManager);

