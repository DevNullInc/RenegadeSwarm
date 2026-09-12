/**
 * RenegadeSwarm - Pure Manifest Serialization and Helper Tools
 */
import { SwarmManifest } from './types';
import { SwarmManifestSchema } from './validation';

export function parseSwarmManifest(jsonString: string): SwarmManifest {
  const raw = JSON.parse(jsonString);
  return SwarmManifestSchema.parse(raw);
}

export function serializeSwarmManifest(manifest: SwarmManifest): string {
  const validated = SwarmManifestSchema.parse(manifest);
  return JSON.stringify(validated, null, 2);
}

export function generateMagnetUri(manifest: SwarmManifest): string {
  const dn = encodeURIComponent(manifest.model.title);
  let uri = `magnet:?xt=urn:btih:${manifest.hashes.infoHash}&dn=${dn}&xl=${manifest.totalSizeBytes}`;

  // Add primary announce trackers
  for (const tier of manifest.announceList) {
    for (const tracker of tier) {
      uri += `&tr=${encodeURIComponent(tracker)}`;
    }
  }

  // Add Web seed fallbacks (BEP 19 standard 'ws' parameter)
  for (const webSeed of manifest.urlList) {
    uri += `&ws=${encodeURIComponent(webSeed)}`;
  }

  return uri;
}
