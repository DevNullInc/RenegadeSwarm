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

import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  Check,
  Copy,
  Sparkles,
  FolderOpen,
  FileCheck,
  Image as ImageIcon,
  RefreshCw,
  Layers,
  Lock,
  Unlock,
  AlertTriangle,
  ShieldAlert,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { CreateSwarmPackageRequest } from '../../shared/ipcContracts';
import { SwarmManifest } from '../../protocol/types';
import { CmmLocalModelRow } from '../../main/cmm/cmmDbBridge';

interface SeederViewProps {
  onCreatePackage: (req: CreateSwarmPackageRequest) => Promise<SwarmManifest>;
  initialModel?: CmmLocalModelRow | null;
}

interface VerifiedModelDetails {
  title: string;
  version: string;
  modelType: string;
  baseModel: string;
  creator: string;
  description: string;
  tagsInput: string;
  civitaiId: string;
  hfRepoId: string;
  previewFilePath: string;
}

export const SeederView: React.FC<SeederViewProps> = ({ onCreatePackage, initialModel }) => {
  const [modelFilePath, setModelFilePath] = useState('');
  const [modelFileName, setModelFileName] = useState('');
  const [modelFileSize, setModelFileSize] = useState<number | null>(null);
  const [previewFilePath, setPreviewFilePath] = useState('');
  const [workflowInfo, setWorkflowInfo] = useState<{ hasWorkflow: boolean; workflowType?: string } | null>(null);
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
  const [isMetadataLocked, setIsMetadataLocked] = useState(false);
  const [hasVerifiedData, setHasVerifiedData] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const verifiedDataRef = useRef<VerifiedModelDetails | null>(null);

  const [isPackaging, setIsPackaging] = useState(false);
  const [createdManifest, setCreatedManifest] = useState<SwarmManifest | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyAndLockVerifiedMetadata = (details: Partial<VerifiedModelDetails>, sourceMsg: string) => {
    const verified: VerifiedModelDetails = {
      title: details.title ?? title,
      version: details.version ?? '1.0.0',
      modelType: details.modelType ?? modelType,
      baseModel: details.baseModel ?? baseModel,
      creator: details.creator ?? creator,
      description: details.description ?? description,
      tagsInput: details.tagsInput ?? tagsInput,
      civitaiId: details.civitaiId ?? civitaiId,
      hfRepoId: details.hfRepoId ?? hfRepoId,
      previewFilePath: details.previewFilePath ?? previewFilePath,
    };

    if (details.title !== undefined) setTitle(details.title);
    if (details.version !== undefined) setVersion(details.version);
    if (details.modelType !== undefined) setModelType(details.modelType);
    if (details.baseModel !== undefined) setBaseModel(details.baseModel);
    if (details.creator !== undefined) setCreator(details.creator);
    if (details.description !== undefined) setDescription(details.description);
    if (details.tagsInput !== undefined) setTagsInput(details.tagsInput);
    if (details.civitaiId !== undefined) setCivitaiId(details.civitaiId);
    if (details.hfRepoId !== undefined) setHfRepoId(details.hfRepoId);
    if (details.previewFilePath !== undefined) setPreviewFilePath(details.previewFilePath);

    verifiedDataRef.current = verified;
    setMetadataSource(sourceMsg);
    setIsMetadataLocked(true);
    setHasVerifiedData(true);
  };

  const handleRestoreVerifiedMetadata = () => {
    if (verifiedDataRef.current) {
      const v = verifiedDataRef.current;
      setTitle(v.title);
      setVersion(v.version);
      setModelType(v.modelType);
      setBaseModel(v.baseModel);
      setCreator(v.creator);
      setDescription(v.description);
      setTagsInput(v.tagsInput);
      setCivitaiId(v.civitaiId);
      setHfRepoId(v.hfRepoId);
      setPreviewFilePath(v.previewFilePath);
      setIsMetadataLocked(true);
    }
  };

  useEffect(() => {
    if (initialModel) {
      setModelFilePath(initialModel.file_path);
      setModelFileName(initialModel.file_name);
      setModelFileSize(initialModel.file_size);
      const initTitle = initialModel.civitai_name || initialModel.file_name.replace(/\.[^/.]+$/, '');
      const initCivitaiId = initialModel.civitai_model_id ? initialModel.civitai_model_id.toString() : '';
      const initHfRepoId = initialModel.hf_repo_id || '';
      const initModelType = initialModel.model_type || 'Checkpoint';

      setTitle(initTitle);
      setCivitaiId(initCivitaiId);
      setHfRepoId(initHfRepoId);
      setModelType(initModelType);

      applyAndLockVerifiedMetadata(
        {
          title: initTitle,
          civitaiId: initCivitaiId,
          hfRepoId: initHfRepoId,
          modelType: initModelType,
        },
        'Imported from RenegadeCMM library'
      );

      // Trigger metadata extraction and automatic database synchronization
      if (window.renegadeSwarm) {
        setIsExtracting(true);
        window.renegadeSwarm
          .extractModelMetadata(initialModel.file_path)
          .then((res: any) => {
            if (res.success && res.data) {
              const m = res.data;
              let sourceText = 'Imported and verified against CMM database';
              if (m.civitaiModelId) {
                sourceText = 'Auto-populated from CivitAI & synced to CMM database';
              } else if (m.hfRepoId || m.isLlm) {
                sourceText = 'Auto-populated from Hugging Face & synced to CMM database';
              } else if (m.creator) {
                sourceText = 'Auto-populated from Safetensors header & synced to CMM database';
              }

              if (m.hasWorkflow) {
                setWorkflowInfo({ hasWorkflow: true, workflowType: m.workflowType });
              }

              applyAndLockVerifiedMetadata(
                {
                  title: m.title || initTitle,
                  creator: m.creator || '',
                  baseModel: m.baseModel || 'Flux.1 D',
                  description: m.description || '',
                  previewFilePath: m.previewFilePath || '',
                  tagsInput: m.tags && m.tags.length > 0 ? m.tags.join(', ') : '',
                  civitaiId: m.civitaiModelId ? m.civitaiModelId.toString() : initCivitaiId,
                  hfRepoId: m.hfRepoId || initHfRepoId,
                  modelType: m.modelType || initModelType,
                },
                sourceText
              );
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

        let sourceText = 'Extracted from filename & local environment';
        if (metadata.civitaiModelId) {
          sourceText = 'Auto-populated from CivitAI & synced to CMM database';
        } else if (metadata.hfRepoId || metadata.isLlm) {
          sourceText = 'Auto-populated from Hugging Face & synced to CMM database';
        } else if (metadata.creator) {
          sourceText = 'Auto-populated from Safetensors header & synced to CMM database';
        }

        if (metadata.hasWorkflow) {
          setWorkflowInfo({ hasWorkflow: true, workflowType: metadata.workflowType });
        }

        applyAndLockVerifiedMetadata(
          {
            title: metadata.title || '',
            version: metadata.version || '1.0.0',
            modelType: metadata.modelType || 'Checkpoint',
            baseModel: metadata.baseModel || 'Flux.1 D',
            creator: metadata.creator || '',
            description: metadata.description || '',
            tagsInput: metadata.tags && Array.isArray(metadata.tags) ? metadata.tags.join(', ') : '',
            civitaiId: metadata.civitaiModelId ? metadata.civitaiModelId.toString() : '',
            hfRepoId: metadata.hfRepoId || '',
            previewFilePath: metadata.previewFilePath || '',
          },
          sourceText
        );
      }
    } catch (err: any) {
      setError(err.message || 'Failed to extract model metadata');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleLockedFieldClick = () => {
    if (isMetadataLocked) {
      setShowUnlockModal(true);
    }
  };

  const handleBrowsePreviewFile = async () => {
    if (!window.renegadeSwarm) return;
    try {
      const res = await window.renegadeSwarm.browsePreviewFile();
      if (res.success && res.data?.filePath) {
        setPreviewFilePath(res.data.filePath);
        if (res.data.workflowMeta?.hasWorkflow) {
          setWorkflowInfo({ hasWorkflow: true, workflowType: res.data.workflowMeta.workflowType });
          if (res.data.workflowMeta.prompt && !description) {
            setDescription(res.data.workflowMeta.prompt);
          }
        }
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
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
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

  // Potential Type Mismatch Detection
  const fileNameLower = (modelFileName || modelFilePath).toLowerCase();
  const isGgufOrLlmFile = fileNameLower.endsWith('.gguf') || fileNameLower.includes('llama') || fileNameLower.includes('mistral') || fileNameLower.includes('qwen') || fileNameLower.includes('gemma');
  const isLoraFileName = fileNameLower.includes('lora') || fileNameLower.includes('lycoris');
  const isTypeMismatched = (!isMetadataLocked && hasVerifiedData) && (
    (isGgufOrLlmFile && modelType !== 'LLM') ||
    (isLoraFileName && modelType !== 'LORA') ||
    (!isLoraFileName && !isGgufOrLlmFile && modelType === 'LORA' && (modelFileSize || 0) > 2000000000)
  );

  return (
    <div style={{ padding: '16px 24px', height: '100%', width: '100%', display: 'flex', flexDirection: 'column', gap: '16px', boxSizing: 'border-box', overflowY: 'auto', position: 'relative' }}>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Package & Seed AI Model</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          Browse and publish a local AI model directly to the decentralized swarm. Metadata automatically auto-populates from file headers, CivitAI, and Hugging Face.
        </p>
      </div>

      {/* Unlock Confirmation Modal */}
      {showUnlockModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setShowUnlockModal(false)}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '520px',
              width: '100%',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              background: 'var(--bg-surface-elevated)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#f59e0b' }}>
              <div style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.15)', borderRadius: '8px' }}>
                <AlertTriangle size={24} />
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                Unlock Verified Registry Metadata?
              </h3>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ margin: 0 }}>
                This model&apos;s information was auto-populated and verified from official registries (CivitAI / Hugging Face / Safetensors header).
              </p>
              <div style={{ padding: '10px 14px', background: 'rgba(245, 158, 11, 0.08)', borderRadius: '8px', borderLeft: '3px solid #f59e0b', color: 'var(--text-primary)' }}>
                <strong>Warning:</strong> Modifying canonical names, base models, or changing model types (e.g. uploading a LoRA as a Checkpoint) can result in peer discovery rejection or swarm misclassification penalties.
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
                🔒 <em>Database Protection:</em> Any manual modifications will apply <strong>only</strong> to the Swarm Manifest and will <strong>never</strong> overwrite or corrupt your local CMM SQLite database.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowUnlockModal(false)}
                style={{ padding: '8px 18px', fontSize: '13px' }}
              >
                Keep Locked (Recommended)
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setIsMetadataLocked(false);
                  setShowUnlockModal(false);
                }}
                style={{ padding: '8px 16px', fontSize: '13px', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}
              >
                <Unlock size={14} style={{ marginRight: '4px' }} />
                Unlock for Manifest Only
              </button>
            </div>
          </div>
        </div>
      )}

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
              setPreviewFilePath('');
              setWorkflowInfo(null);
              setTitle('');
              setMetadataSource(null);
              setIsMetadataLocked(false);
              setHasVerifiedData(false);
              verifiedDataRef.current = null;
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

            {/* Lock / Verification Status Bar */}
            {hasVerifiedData && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: isMetadataLocked ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                  border: isMetadataLocked ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(245, 158, 11, 0.3)',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isMetadataLocked ? (
                    <Lock size={15} color="#10b981" />
                  ) : (
                    <AlertTriangle size={15} color="#f59e0b" />
                  )}
                  <div>
                    <strong style={{ color: isMetadataLocked ? '#10b981' : '#f59e0b' }}>
                      {isMetadataLocked ? 'Verified Registry Metadata (Locked)' : 'Manual Override Active (Manifest Only)'}
                    </strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>
                      {isMetadataLocked
                        ? (metadataSource || 'Auto-populated fields are locked to prevent misclassification.')
                        : 'Manual edits apply to this package only and will NEVER update the local CMM SQLite database.'}
                    </span>
                  </div>
                </div>

                {isMetadataLocked ? (
                  <button
                    type="button"
                    onClick={() => setShowUnlockModal(true)}
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
                  >
                    <Unlock size={12} />
                    <span>Unlock to Edit</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRestoreVerifiedMetadata}
                    className="btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', flexShrink: 0 }}
                  >
                    <RotateCcw size={12} />
                    <span>Re-lock & Restore</span>
                  </button>
                )}
              </div>
            )}

            {/* Type Mismatch Warning */}
            {isTypeMismatched && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  color: '#f43f5e',
                  fontSize: '12px',
                }}
              >
                <ShieldAlert size={16} style={{ flexShrink: 0 }} />
                <span>
                  <strong>Potential Model Type Mismatch:</strong> File signatures suggest this may not be a {modelType}. Please verify you are not packaging a LoRA/LLM as a Checkpoint.
                </span>
              </div>
            )}
          </div>

          {/* Model Metadata Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={handleLockedFieldClick}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Model Title</span>
                {isMetadataLocked && <Lock size={11} color="var(--text-muted)" />}
              </label>
              <input
                type="text"
                placeholder="FLUX.1 [dev] Fine-tuned"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                readOnly={isMetadataLocked}
                required
                style={{
                  cursor: isMetadataLocked ? 'not-allowed' : 'text',
                  opacity: isMetadataLocked ? 0.85 : 1,
                  background: isMetadataLocked ? 'var(--bg-surface)' : undefined,
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={handleLockedFieldClick}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Version</span>
                {isMetadataLocked && <Lock size={11} color="var(--text-muted)" />}
              </label>
              <input
                type="text"
                placeholder="1.0.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                readOnly={isMetadataLocked}
                style={{
                  cursor: isMetadataLocked ? 'not-allowed' : 'text',
                  opacity: isMetadataLocked ? 0.85 : 1,
                  background: isMetadataLocked ? 'var(--bg-surface)' : undefined,
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={handleLockedFieldClick}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Model Type</span>
                {isMetadataLocked && <Lock size={11} color="var(--text-muted)" />}
              </label>
              <select
                value={modelType}
                onChange={(e) => setModelType(e.target.value)}
                disabled={isMetadataLocked}
                style={{
                  cursor: isMetadataLocked ? 'not-allowed' : 'pointer',
                  opacity: isMetadataLocked ? 0.85 : 1,
                  background: isMetadataLocked ? 'var(--bg-surface)' : undefined,
                }}
              >
                <option value="Checkpoint">Checkpoint</option>
                <option value="LORA">LoRA</option>
                <option value="UNet">UNet</option>
                <option value="VAE">VAE</option>
                <option value="TextEncoder">Text Encoder</option>
                <option value="Controlnet">ControlNet</option>
                <option value="Upscaler">Upscaler</option>
                <option value="LLM">LLM / Language Model</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={handleLockedFieldClick}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Base Model</span>
                {isMetadataLocked && <Lock size={11} color="var(--text-muted)" />}
              </label>
              <input
                type="text"
                placeholder="Flux.1 D / SDXL / Pony"
                value={baseModel}
                onChange={(e) => setBaseModel(e.target.value)}
                readOnly={isMetadataLocked}
                style={{
                  cursor: isMetadataLocked ? 'not-allowed' : 'text',
                  opacity: isMetadataLocked ? 0.85 : 1,
                  background: isMetadataLocked ? 'var(--bg-surface)' : undefined,
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={handleLockedFieldClick}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Creator / Author</span>
                {isMetadataLocked && <Lock size={11} color="var(--text-muted)" />}
              </label>
              <input
                type="text"
                placeholder="TheStygianRenegade"
                value={creator}
                onChange={(e) => setCreator(e.target.value)}
                readOnly={isMetadataLocked}
                style={{
                  cursor: isMetadataLocked ? 'not-allowed' : 'text',
                  opacity: isMetadataLocked ? 0.85 : 1,
                  background: isMetadataLocked ? 'var(--bg-surface)' : undefined,
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={handleLockedFieldClick}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>CivitAI Model ID (Optional)</span>
                {isMetadataLocked && <Lock size={11} color="var(--text-muted)" />}
              </label>
              <input
                type="number"
                placeholder="827184"
                value={civitaiId}
                onChange={(e) => setCivitaiId(e.target.value)}
                readOnly={isMetadataLocked}
                style={{
                  cursor: isMetadataLocked ? 'not-allowed' : 'text',
                  opacity: isMetadataLocked ? 0.85 : 1,
                  background: isMetadataLocked ? 'var(--bg-surface)' : undefined,
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={handleLockedFieldClick}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Hugging Face Repo (Optional)</span>
                {isMetadataLocked && <Lock size={11} color="var(--text-muted)" />}
              </label>
              <input
                type="text"
                placeholder="user/model-repo"
                value={hfRepoId}
                onChange={(e) => setHfRepoId(e.target.value)}
                readOnly={isMetadataLocked}
                style={{
                  cursor: isMetadataLocked ? 'not-allowed' : 'text',
                  opacity: isMetadataLocked ? 0.85 : 1,
                  background: isMetadataLocked ? 'var(--bg-surface)' : undefined,
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={handleLockedFieldClick}>
              <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Tags (comma-separated)</span>
                {isMetadataLocked && <Lock size={11} color="var(--text-muted)" />}
              </label>
              <input
                type="text"
                placeholder="cyberpunk, realism, portrait"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                readOnly={isMetadataLocked}
                style={{
                  cursor: isMetadataLocked ? 'not-allowed' : 'text',
                  opacity: isMetadataLocked ? 0.85 : 1,
                  background: isMetadataLocked ? 'var(--bg-surface)' : undefined,
                }}
              />
            </div>
          </div>

          {/* Preview Image Picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ImageIcon size={13} color="#a855f7" />
                <span>Preview Image or Video (Optional)</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {workflowInfo?.hasWorkflow && (
                  <span style={{ fontSize: '10px', color: '#a855f7', background: 'rgba(168, 85, 247, 0.12)', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(168, 85, 247, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <Zap size={10} color="#a855f7" />
                    <span>Workflow Included ({workflowInfo.workflowType || 'Prompt Data'})</span>
                  </span>
                )}
                <span style={{ fontSize: '10px', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.25)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  <span>✓</span>
                  <span>Unlocked (No WoT score impact)</span>
                </span>
              </div>
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                placeholder="No preview selected (auto-detected if sibling image exists)"
                value={previewFilePath}
                readOnly
                className="mono"
                style={{ flex: 1, background: 'var(--bg-surface)', cursor: 'default' }}
              />
              <button
                type="button"
                onClick={handleBrowsePreviewFile}
                className="btn-secondary"
                style={{ whiteSpace: 'nowrap' }}
              >
                Browse Preview...
              </button>
              {previewFilePath && (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewFilePath('');
                    setWorkflowInfo(null);
                  }}
                  className="btn-secondary"
                  style={{ color: '#f43f5e' }}
                  title="Remove Preview"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} onClick={handleLockedFieldClick}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Description & Generation Notes</span>
              {isMetadataLocked && <Lock size={11} color="var(--text-muted)" />}
            </label>
            <textarea
              rows={3}
              placeholder="Recommended settings: CFG 3.5, Euler sampler, 25 steps..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              readOnly={isMetadataLocked}
              style={{
                resize: 'none',
                cursor: isMetadataLocked ? 'not-allowed' : 'text',
                opacity: isMetadataLocked ? 0.85 : 1,
                background: isMetadataLocked ? 'var(--bg-surface)' : undefined,
              }}
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
