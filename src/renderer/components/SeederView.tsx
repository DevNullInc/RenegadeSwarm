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

import React, { useState, useEffect } from 'react';
import { UploadCloud, Check, Copy, Sparkles, FolderOpen, FileCheck, Image as ImageIcon, RefreshCw, Layers } from 'lucide-react';
import { CreateSwarmPackageRequest } from '../../shared/ipcContracts';
import { SwarmManifest } from '../../protocol/types';
import { CmmLocalModelRow } from '../../main/cmm/cmmDbBridge';

interface SeederViewProps {
  onCreatePackage: (req: CreateSwarmPackageRequest) => Promise<SwarmManifest>;
  initialModel?: CmmLocalModelRow | null;
}

export const SeederView: React.FC<SeederViewProps> = ({ onCreatePackage, initialModel }) => {
  const [modelFilePath, setModelFilePath] = useState('');
  const [modelFileName, setModelFileName] = useState('');
  const [modelFileSize, setModelFileSize] = useState<number | null>(null);
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

  const [isExtracting, setIsExtracting] = useState(false);
  const [metadataSource, setMetadataSource] = useState<string | null>(null);
  const [isPackaging, setIsPackaging] = useState(false);
  const [createdManifest, setCreatedManifest] = useState<SwarmManifest | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialModel) {
      setModelFilePath(initialModel.file_path);
      setModelFileName(initialModel.file_name);
      setModelFileSize(initialModel.file_size);
      if (initialModel.civitai_name) setTitle(initialModel.civitai_name);
      else setTitle(initialModel.file_name.replace(/\.[^/.]+$/, ''));
      if (initialModel.civitai_model_id) setCivitaiId(initialModel.civitai_model_id.toString());
      if (initialModel.hf_repo_id) setHfRepoId(initialModel.hf_repo_id);
      if (initialModel.model_type) setModelType(initialModel.model_type);
      setMetadataSource('Imported from RenegadeCMM library');

      // Trigger metadata extraction
      if (window.renegadeSwarm) {
        setIsExtracting(true);
        window.renegadeSwarm
          .extractModelMetadata(initialModel.file_path)
          .then((res: any) => {
            if (res.success && res.data) {
              const m = res.data;
              if (m.title && !initialModel.civitai_name) setTitle(m.title);
              if (m.creator) setCreator(m.creator);
              if (m.baseModel) setBaseModel(m.baseModel);
              if (m.description) setDescription(m.description);
              if (m.previewFilePath) setPreviewFilePath(m.previewFilePath);
              if (m.tags && m.tags.length > 0) setTagsInput(m.tags.join(', '));
            }
          })
          .catch(() => {})
          .finally(() => setIsExtracting(false));
      }
    }
  }, [initialModel]);

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleBrowseModelFile = async () => {
    setError(null);
    if (!window.renegadeSwarm) return;

    try {
      setIsExtracting(true);
      const res = await window.renegadeSwarm.browseModelFile();
      if (!res.success || !res.data) {
        setIsExtracting(false);
        return;
      }

      const { filePath, metadata } = res.data;
      setModelFilePath(filePath);

      if (metadata) {
        setModelFileName(metadata.fileName || '');
        setModelFileSize(metadata.fileSizeBytes || null);
        if (metadata.title) setTitle(metadata.title);
        if (metadata.version) setVersion(metadata.version);
        if (metadata.modelType) setModelType(metadata.modelType);
        if (metadata.baseModel) setBaseModel(metadata.baseModel);
        if (metadata.creator) setCreator(metadata.creator);
        if (metadata.description) setDescription(metadata.description);
        if (metadata.tags && Array.isArray(metadata.tags)) setTagsInput(metadata.tags.join(', '));
        if (metadata.civitaiModelId) setCivitaiId(metadata.civitaiModelId.toString());
        if (metadata.hfRepoId) setHfRepoId(metadata.hfRepoId);
        if (metadata.previewFilePath) setPreviewFilePath(metadata.previewFilePath);

        if (metadata.civitaiModelId) {
          setMetadataSource('Auto-populated from CivitAI registry & file header');
        } else if (metadata.creator) {
          setMetadataSource('Auto-populated from Safetensors header & local database');
        } else {
          setMetadataSource('Extracted from filename & local environment');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to extract model metadata');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleBrowsePreviewFile = async () => {
    if (!window.renegadeSwarm) return;
    try {
      const res = await window.renegadeSwarm.browsePreviewFile();
      if (res.success && res.data?.filePath) {
        setPreviewFilePath(res.data.filePath);
      }
    } catch {
      // User canceled
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!modelFilePath) {
      setError('Please browse and select a valid model file first.');
      return;
    }

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
    <div style={{ padding: '16px 24px', height: '100%', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box', overflowY: 'auto' }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Package & Seed AI Model</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Browse and publish a local AI model directly to the decentralized swarm. Metadata automatically auto-populates from file headers, CivitAI, and Hugging Face.
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
            onClick={() => {
              setCreatedManifest(null);
              setModelFilePath('');
              setModelFileName('');
              setModelFileSize(null);
              setTitle('');
              setMetadataSource(null);
            }}
            className="btn-secondary"
            style={{ alignSelf: 'flex-start', marginTop: '12px' }}
          >
            Package Another Model
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* File Picker Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={15} color="#06b6d4" />
              <span>Target Model File (Strict File Picker)</span>
            </label>

            {!modelFilePath ? (
              <div
                onClick={handleBrowseModelFile}
                style={{
                  border: '2px dashed var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '24px',
                  textAlign: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-purple)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-subtle)')}
              >
                <FolderOpen size={32} color="#a855f7" style={{ marginBottom: '8px' }} />
                <div style={{ fontSize: '14px', fontWeight: 600 }}>Click to Browse for Model File</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Supports *.safetensors, *.gguf, *.bin, *.pt, *.onnx
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--bg-surface-elevated)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <FileCheck size={24} color="#10b981" style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {modelFileName || modelFilePath}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} className="mono">
                      {modelFilePath} {modelFileSize ? `(${formatBytes(modelFileSize)})` : ''}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexShrink: 0, marginLeft: '16px' }}>
                  <button
                    type="button"
                    onClick={handleBrowseModelFile}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    Change File
                  </button>
                </div>
              </div>
            )}

            {isExtracting && (
              <div style={{ fontSize: '12px', color: '#06b6d4', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RefreshCw size={13} className="spin" />
                <span>Extracting embedded metadata from file & querying online registries...</span>
              </div>
            )}

            {metadataSource && (
              <div style={{ fontSize: '11px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={12} />
                <span>{metadataSource}</span>
              </div>
            )}
          </div>

          {/* Model Metadata Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Model Title</label>
              <input
                type="text"
                placeholder="FLUX.1 [dev] Fine-tuned"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Version</label>
              <input
                type="text"
                placeholder="1.0.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Model Type</label>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Base Model</label>
              <input
                type="text"
                placeholder="Flux.1 D / SDXL / Pony"
                value={baseModel}
                onChange={(e) => setBaseModel(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Creator / Author</label>
              <input
                type="text"
                placeholder="TheStygianRenegade"
                value={creator}
                onChange={(e) => setCreator(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>CivitAI Model ID (Optional)</label>
              <input
                type="number"
                placeholder="827184"
                value={civitaiId}
                onChange={(e) => setCivitaiId(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Hugging Face Repo (Optional)</label>
              <input
                type="text"
                placeholder="user/model-repo"
                value={hfRepoId}
                onChange={(e) => setHfRepoId(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Tags (comma-separated)</label>
              <input
                type="text"
                placeholder="cyberpunk, realism, portrait"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
            </div>
          </div>

          {/* Preview Image Picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ImageIcon size={13} color="#a855f7" />
              <span>Preview Image or Video (Optional)</span>
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="No preview selected (auto-detected if sibling image exists)"
                value={previewFilePath}
                readOnly
                className="mono"
                style={{ flex: 1, background: 'var(--bg-surface)' }}
              />
              <button
                type="button"
                onClick={handleBrowsePreviewFile}
                className="btn-secondary"
                style={{ whiteSpace: 'nowrap' }}
              >
                Browse Preview...
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Description & Generation Notes</label>
            <textarea
              rows={3}
              placeholder="Recommended settings: CFG 3.5, Euler sampler, 25 steps..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ resize: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '6px' }}>
            <button
              type="submit"
              disabled={isPackaging || isExtracting || !modelFilePath}
              className="btn-primary"
              style={{ padding: '10px 24px' }}
            >
              <UploadCloud size={16} />
              <span>{isPackaging ? 'Computing Hashes & Seeding...' : 'Create Swarm & Start Seeding'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
