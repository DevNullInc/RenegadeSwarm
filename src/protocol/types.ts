/**
 * RenegadeSwarm - Pure TypeScript Protocol Types
 * Independent of Node.js / Electron APIs for universal client/renderer portability.
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

export type SyncQueueState =
  | 'Quarantine'
  | 'Validating'
  | 'Queued'
  | 'Active'
  | 'Completed'
  | 'Verified'
  | 'Rejected'
  | 'Paused'
  | 'Cancelled'
  | 'Failed';

export interface SwarmFileEntry {
  relativePath: string;
  canonicalFileName?: string; // Formatted as model_name_author.extension
  sizeBytes: number;
  fileType: FileType;
  targetSubfolder: string;
  sha256?: string;
}

export interface SwarmModelMetadata {
  title: string;
  version: string;
  modelType: ModelType | string;
  baseModel?: string;
  creator?: string;
  creatorPublicKey?: string; // Ed25519 public key (hex)
  nsfw: boolean;
  description: string;
  tags: string[];
  license: string;
  civitaiModelId?: number;
  civitaiVersionId?: number;
  hfRepoId?: string;
  hfCommitSha?: string;
  quantization?: string;
}

export interface SwarmHashes {
  sha256: string;
  blake3?: string;
  infoHash: string;
  pieceSha256List?: string[];
}

export interface SwarmSignature {
  algorithm: 'ed25519';
  publicKey: string; // 32-byte Ed25519 public key in hex
  signature: string; // 64-byte Ed25519 signature in hex
  signedPayloadHash: string; // SHA256 of canonical manifest info
}

export interface SwarmManifest {
  swarmSpecVersion: '1.0.0';
  manifestId: string;
  createdAt: number;
  createdBy: string;
  pieceLength: number;
  totalSizeBytes: number;
  model: SwarmModelMetadata;
  hashes: SwarmHashes;
  files: SwarmFileEntry[];
  announceList: string[][];
  urlList: string[]; // Web seed fallbacks (e.g. HuggingFace / CivitAI direct URLs)
  signature?: SwarmSignature; // Ed25519 cryptographic signature (Rule 10)
}

export interface SwarmPeerStats {
  peerId: string;
  ip: string;
  port: number;
  downloadSpeedBps: number;
  uploadSpeedBps: number;
  progressPercent: number;
  isSeeder: boolean;
  clientName?: string;
}

export interface SwarmTorrentStatus {
  infoHash: string;
  manifestId: string;
  title: string;
  modelType: string;
  baseModel?: string;
  creator?: string;
  state: 'queued' | 'downloading' | 'seeding' | 'paused' | 'verifying' | 'error';
  queueState: SyncQueueState;
  totalBytes: number;
  downloadedBytes: number;
  uploadedBytes: number;
  downloadSpeedBps: number;
  uploadSpeedBps: number;
  progressRatio: number;
  peersConnected: number;
  seedersConnected: number;
  ratio: number;
  etaSeconds: number | null;
  savePath: string;
  quarantinePath?: string;
  cmmSynced: boolean;
  error?: string;
}
