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
