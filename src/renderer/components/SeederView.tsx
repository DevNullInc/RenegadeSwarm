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

import React, { useState } from 'react';
import { UploadCloud, Check, Copy, Sparkles } from 'lucide-react';
import { CreateSwarmPackageRequest } from '../../shared/ipcContracts';
import { SwarmManifest } from '../../protocol/types';

interface SeederViewProps {
  onCreatePackage: (req: CreateSwarmPackageRequest) => Promise<SwarmManifest>;
}

export const SeederView: React.FC<SeederViewProps> = ({ onCreatePackage }) => {
  const [modelFilePath, setModelFilePath] = useState('');
  const [previewFilePath, setPreviewFilePath] = useState('');
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [modelType, setModelType] = useState('Checkpoint');
  const [baseModel, setBaseModel] = useState('Flux.1 D');
  const [creator, setCreator] = useState('');
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [civitaiId, setCivitaiId] = useState('');
  const [hfRepoId, setHfRepoId] = useState('');

  const [isPackaging, setIsPackaging] = useState(false);
  const [createdManifest, setCreatedManifest] = useState<SwarmManifest | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsPackaging(true);

    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      const req: CreateSwarmPackageRequest = {
        modelFilePath,
        previewFilePath: previewFilePath.trim() ? previewFilePath.trim() : undefined,
        title,
        version,
        modelType,
        baseModel: baseModel.trim() ? baseModel.trim() : undefined,
        creator: creator.trim() ? creator.trim() : undefined,
        description,
        tags,
        license: 'OpenAI/CreativeML/MIT',
        civitaiModelId: civitaiId ? parseInt(civitaiId, 10) : undefined,
        hfRepoId: hfRepoId.trim() ? hfRepoId.trim() : undefined,
      };

      const manifest = await onCreatePackage(req);
      setCreatedManifest(manifest);
    } catch (err: any) {
      setError(err.message || 'Failed to create swarm package');
    } finally {
      setIsPackaging(false);
    }
  };

  const getMagnetLink = () => {
    if (!createdManifest) return '';
    return `magnet:?xt=urn:btih:${createdManifest.hashes.infoHash}&dn=${encodeURIComponent(createdManifest.model.title)}&tr=udp://tracker.opentrackr.org:1337/announce`;
  };

  const handleCopyMagnet = () => {
    navigator.clipboard.writeText(getMagnetLink());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: '840px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '6px' }}>Package & Seed AI Model</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Publish a local AI model directly to the decentralized swarm. Calculates cryptographic hashes, attaches metadata, and initiates peer seeding.
          </p>
        </div>

        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '8px', color: '#f43f5e', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {createdManifest ? (
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981' }}>
              <Sparkles size={20} />
              <span style={{ fontWeight: 700, fontSize: '16px' }}>Swarm Package Created & Seeding Active!</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Title:</span> <strong>{createdManifest.model.title}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Type:</span> <strong>{createdManifest.model.modelType}</strong>
              </div>
              <div className="mono">
                <span style={{ color: 'var(--text-muted)' }}>InfoHash:</span> {createdManifest.hashes.infoHash}
              </div>
              <div className="mono">
                <span style={{ color: 'var(--text-muted)' }}>SHA256:</span> {createdManifest.hashes.sha256.slice(0, 16)}...
              </div>
            </div>

            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>MAGNET LINK</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  readOnly
                  value={getMagnetLink()}
                  style={{ flex: 1 }}
                  className="mono"
                />
                <button
                  onClick={handleCopyMagnet}
                  className="btn-primary"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copied ? 'Copied!' : 'Copy Magnet'}</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => setCreatedManifest(null)}
              className="btn-secondary"
              style={{ alignSelf: 'flex-start', marginTop: '12px' }}
            >
              Package Another Model
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Model File Path (*.safetensors, *.gguf)</label>
                <input
                  type="text"
                  placeholder="D:\ComfyUI\models\checkpoints\flux1-dev.safetensors"
                  value={modelFilePath}
                  onChange={(e) => setModelFilePath(e.target.value)}
                  className="mono"
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Preview Image Path (Optional)</label>
                <input
                  type="text"
                  placeholder="D:\ComfyUI\models\checkpoints\flux1-dev.preview.png"
                  value={previewFilePath}
                  onChange={(e) => setPreviewFilePath(e.target.value)}
                  className="mono"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Model Title</label>
                <input
                  type="text"
                  placeholder="FLUX.1 [dev] Fine-tuned"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Version</label>
                <input
                  type="text"
                  placeholder="1.0.0"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Model Type</label>
                <select value={modelType} onChange={(e) => setModelType(e.target.value)}>
                  <option value="Checkpoint">Checkpoint</option>
                  <option value="LORA">LoRA</option>
                  <option value="UNet">UNet</option>
                  <option value="VAE">VAE</option>
                  <option value="TextEncoder">Text Encoder</option>
                  <option value="Controlnet">ControlNet</option>
                  <option value="Upscaler">Upscaler</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Base Model</label>
                <input
                  type="text"
                  placeholder="Flux.1 D / SDXL / Pony"
                  value={baseModel}
                  onChange={(e) => setBaseModel(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Creator / Author</label>
                <input
                  type="text"
                  placeholder="TheStygianRenegade"
                  value={creator}
                  onChange={(e) => setCreator(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>CivitAI Model ID (Optional)</label>
                <input
                  type="number"
                  placeholder="827184"
                  value={civitaiId}
                  onChange={(e) => setCivitaiId(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Hugging Face Repo (Optional)</label>
                <input
                  type="text"
                  placeholder="user/model-repo"
                  value={hfRepoId}
                  onChange={(e) => setHfRepoId(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Tags (comma-separated)</label>
                <input
                  type="text"
                  placeholder="cyberpunk, realism"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Description & Generation Notes</label>
              <textarea
                rows={3}
                placeholder="Recommended settings: CFG 3.5, Euler sampler, 25 steps..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
              <button
                type="submit"
                disabled={isPackaging}
                className="btn-primary"
              >
                <UploadCloud size={16} />
                <span>{isPackaging ? 'Computing Hashes & Seeding...' : 'Create Swarm & Start Seeding'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
