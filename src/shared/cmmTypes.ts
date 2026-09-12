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

export type ModelType =
  | 'Checkpoint'
  | 'TextualInversion'
  | 'Hypernetwork'
  | 'AestheticGradient'
  | 'LORA'
  | 'LoCon'
  | 'Controlnet'
  | 'Upscaler'
  | 'MotionModule'
  | 'VAE'
  | 'Wildcards'
  | 'Workflows'
  | 'Other'
  | 'TextEncoder'
  | 'DiffusionModel'
  | 'UNet';

export type FileType =
  | 'Model'
  | 'Pruned Model'
  | 'VAE'
  | 'Text Encoder'
  | 'Config'
  | 'Training Data'
  | 'Negative'
  | 'Preview';

export const COMFYUI_STANDARD_MODEL_SUBFOLDERS = [
  'checkpoints',
  'clip',
  'clip_vision',
  'configs',
  'controlnet',
  'diffusion_models',
  'embeddings',
  'gligen',
  'hypernetworks',
  'loras',
  'photomaker',
  'style_models',
  'text_encoders',
  'unet',
  'upscale_models',
  'vae',
  'vae_approx',
] as const;

export const DEFAULT_FOLDER_MAP: Record<string, string> = {
  Checkpoint: 'checkpoints',
  LORA: 'loras',
  LoCon: 'loras',
  Controlnet: 'controlnet',
  Upscaler: 'upscale_models',
  MotionModule: 'loras',
  VAE: 'vae',
  TextualInversion: 'embeddings',
  TextEncoder: 'text_encoders',
  DiffusionModel: 'diffusion_models',
  UNet: 'unet',
  Hypernetwork: 'hypernetworks',
  Other: 'checkpoints',
};

export const ALLOWED_MODEL_EXTENSIONS = new Set([
  '.safetensors',
  '.gguf',
  '.bin',
  '.pt',
  '.pth',
  '.ckpt',
  '.yaml',
  '.json',
  '.png',
  '.jpg',
  '.webp',
  '.preview.png',
]);

export const FORBIDDEN_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.py',
  '.dll',
  '.so',
  '.dylib',
  '.vbs',
  '.ps1',
  '.msi',
]);
