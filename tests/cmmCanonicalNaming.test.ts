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

import { describe, it, expect } from 'vitest';
import {
  formatCmmCanonicalFileName,
  isValidCmmCanonicalFileName,
} from '../src/protocol/validation';

describe('CMM Canonical Model Naming (Rule 13)', () => {
  it('should format title and creator into canonical model_name_author.extension pattern', () => {
    const formatted = formatCmmCanonicalFileName('FLUX.1 Dev FineTune', 'TheStygianRenegade', 'safetensors');
    expect(formatted).toBe('FLUX_1_Dev_FineTune_TheStygianRenegade.safetensors');
    expect(isValidCmmCanonicalFileName(formatted)).toBe(true);
  });

  it('should handle leading dots in extension properly', () => {
    const formatted = formatCmmCanonicalFileName('sdxl_cyberpunk', 'JohnDoe', '.gguf');
    expect(formatted).toBe('sdxl_cyberpunk_JohnDoe.gguf');
    expect(isValidCmmCanonicalFileName(formatted)).toBe(true);
  });

  it('should strip illegal special characters and consecutive underscores', () => {
    const formatted = formatCmmCanonicalFileName('Model: Special <v1> *!', 'Creator/Author [Dev]', 'safetensors');
    expect(formatted).toBe('Model_Special_v1_Creator_Author_Dev.safetensors');
    expect(isValidCmmCanonicalFileName(formatted)).toBe(true);
  });

  it('should validate canonical format regex strictly', () => {
    expect(isValidCmmCanonicalFileName('flux_model_author.safetensors')).toBe(true);
    expect(isValidCmmCanonicalFileName('sdxl_lora_creator.gguf')).toBe(true);
    expect(isValidCmmCanonicalFileName('flux_model_author.bin')).toBe(true);

    // Invalid cases: spaces, forbidden extensions, missing author
    expect(isValidCmmCanonicalFileName('flux model author.safetensors')).toBe(false);
    expect(isValidCmmCanonicalFileName('flux_model_author.exe')).toBe(false);
    expect(isValidCmmCanonicalFileName('fluxmodel.safetensors')).toBe(false);
  });
});
