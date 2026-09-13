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

export class DiscoveryEngine {
  private localCatalog: Map<string, DiscoveredModelEntry> = new Map(); // Key: infoHash
  private discoveredCache: Map<string, DiscoveredModelWithTrust> = new Map(); // Key: infoHash
  private discoveryPeers: Map<string, DiscoveryPeerConnection> = new Map(); // Key: peerId
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
  }

  public getConnectedDiscoveryPeersCount(): number {
    return this.discoveryPeers.size;
  }

  // --- Inbound Message Handling ---------------------------------------------

  public handleInboundMessage(fromPeerId: string, type: string, payload: any) {
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
    const queryId = randomUUID();
    const query: DiscoveryCatalogQuery = {
      queryId,
      query: queryText.trim(),
      modelType: options.modelType,
      baseModel: options.baseModel,
      verifiedOnly: options.verifiedOnly ?? false,
      limit: options.limit ?? 50,
    };

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

    // 3. If we have connected discovery peers, broadcast query and await responses
    const peers = Array.from(this.discoveryPeers.values());
    if (peers.length > 0) {
      const timeoutMs = options.timeoutMs ?? 1500; // 1.5s fast query timeout

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

    // 4. Sort and return results: Verified first, then Community, then Untrusted
    const resultList = Array.from(aggregated.values());
    return this.rankDiscoveredModels(resultList, query.verifiedOnly);
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
    this.discoveredCache.set(model.infoHash, model);
  }

  private queryCatalog<T extends DiscoveredModelEntry>(catalog: T[], query: DiscoveryCatalogQuery): T[] {
    const q = query.query.toLowerCase();

    return catalog.filter((m) => {
      if (query.modelType && m.modelType !== query.modelType) return false;
      if (query.baseModel && query.baseModel !== 'All' && !m.baseModel.toLowerCase().includes(query.baseModel.toLowerCase())) return false;

      if (q) {
        const matchTitle = m.title.toLowerCase().includes(q);
        const matchCreator = m.creator.toLowerCase().includes(q);
        const matchTags = m.tags.some(t => t.toLowerCase().includes(q));
        const matchDesc = m.description.toLowerCase().includes(q);
        const matchBase = m.baseModel.toLowerCase().includes(q);
        const matchHash = m.infoHash.toLowerCase().includes(q) || (m.sha256 && m.sha256.toLowerCase().includes(q));

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

