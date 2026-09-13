# RenegadeSwarm: Model Manifest & Provenance Specification (v1.0.0)

A **Swarm Model Manifest** (`.swarm`) is a cryptographically signed Bill of Materials (BOM) and BitTorrent metadata envelope engineered for AI and LLM models. It encapsulates model metadata, multi-hash verification (SHA256, InfoHash), BitTorrent piece dimensions, Web Seed HTTP/HTTPS fallbacks (BEP 19), and an Ed25519 creator signature.

---

## Manifest JSON Schema & Example

Manifests are stored as human-readable JSON files with the `.swarm` extension or embedded directly into BitTorrent magnet links.

```json
{
  "swarmSpecVersion": "1.0.0",
  "manifestId": "a4b88950-8b9f-4df0-94e8-ec5ef4a67e10",
  "createdAt": 1723456789000,
  "createdBy": "RenegadeSwarm/0.1.0",
  "pieceLength": 4194304,
  "totalSizeBytes": 2400000000,
  "model": {
    "title": "FLUX.1-Dev-Cyberpunk",
    "version": "1.0.0",
    "modelType": "LORA",
    "baseModel": "Flux.1 D",
    "creator": "TheStygianRenegade",
    "creatorPublicKey": "70fb7e8a57bbec5ffba1d16e317fb915ddeead2a5f3d8853ffb21759155936b7",
    "nsfw": false,
    "description": "High detail Cyberpunk aesthetics for FLUX.1",
    "tags": ["cyberpunk", "flux", "style"],
    "license": "MIT",
    "civitaiModelId": 827184,
    "civitaiVersionId": 2514310,
    "hfRepoId": "TheStygianRenegade/flux-cyberpunk",
    "quantization": "fp8"
  },
  "hashes": {
    "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "infoHash": "4a5c88b2e118b6284f18b3ec48866164287d3d2a"
  },
  "files": [
    {
      "relativePath": "FLUX_1_Dev_Cyberpunk_TheStygianRenegade.safetensors",
      "canonicalFileName": "FLUX_1_Dev_Cyberpunk_TheStygianRenegade.safetensors",
      "sizeBytes": 2400000000,
      "fileType": "Model",
      "targetSubfolder": "loras",
      "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    }
  ],
  "announceList": [
    ["udp://tracker.opentrackr.org:1337/announce"],
    ["wss://tracker.webtorrent.dev"]
  ],
  "urlList": [
    "https://huggingface.co/TheStygianRenegade/flux-cyberpunk/resolve/main/FLUX_1_Dev_Cyberpunk_TheStygianRenegade.safetensors"
  ],
  "signature": {
    "algorithm": "ed25519",
    "publicKey": "70fb7e8a57bbec5ffba1d16e317fb915ddeead2a5f3d8853ffb21759155936b7",
    "signature": "3b2c9...",
    "signedPayloadHash": "d4e5f..."
  }
}
```

---

## Field Reference

### Root Structure

| Field | Type | Description |
|---|---|---|
| `swarmSpecVersion` | `string` | Must be `"1.0.0"`. |
| `manifestId` | `string` (UUID v4) | Unique identifier for this manifest revision. |
| `createdAt` | `number` | Unix timestamp in milliseconds. |
| `createdBy` | `string` | Client identification string (e.g. `RenegadeSwarm/0.1.0`). |
| `pieceLength` | `number` | BitTorrent piece length in bytes (power of 2, 256KB to 32MB). |
| `totalSizeBytes` | `number` | Total payload size in bytes across all files. |
| `model` | `object` | Comprehensive model metadata and upstream platform IDs. |
| `hashes` | `object` | Cryptographic digests (`sha256`, `infoHash`, optional `blake3`). |
| `files` | `array` | Target file list with canonical names and destination subfolders. |
| `announceList` | `string[][]` | Tiered list of tracker URLs (UDP, HTTP, WSS). |
| `urlList` | `string[]` | BEP 19 Web Seed direct HTTP/HTTPS URLs. |
| `signature` | `object` (optional) | Ed25519 provenance signature block. |

---

### `model` Metadata Block

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | **Yes** | Human-readable model title (1-250 characters). |
| `version` | `string` | **Yes** | Semantic version of the model (e.g. `1.0.0`). |
| `modelType` | `string` | **Yes** | Model type: `Checkpoint`, `LORA`, `VAE`, `TextEncoder`, `UNet`, `Controlnet`, `Upscaler`, `GGUF`, etc. |
| `baseModel` | `string` | No | Base architecture (e.g. `SD 1.5`, `SDXL 1.0`, `Flux.1 D`, `Pony`, `SD3.5`). |
| `creator` | `string` | No | Author or organization name. |
| `creatorPublicKey`| `string` | No | 64-character hex-encoded Ed25519 public key. |
| `nsfw` | `boolean` | No | Default `false`. Flags mature or adult content. |
| `description` | `string` | No | Model card description or prompt triggers. |
| `tags` | `string[]` | No | Search and categorization tags. |
| `license` | `string` | No | Model license identifier (e.g. `MIT`, `Apache-2.0`, `OpenRAIL-M`). |
| `civitaiModelId` | `number` | No | Upstream CivitAI model ID. |
| `civitaiVersionId`| `number` | No | Upstream CivitAI version ID. |
| `hfRepoId` | `string` | No | Hugging Face repository identifier (e.g. `username/repo`). |
| `quantization` | `string` | No | Precision/quantization format (e.g. `fp16`, `fp8`, `Q4_K_M`). |

---

### `files` Entry Block

| Field | Type | Description |
|---|---|---|
| `relativePath` | `string` | Relative path inside the torrent (traversal `..` is strictly forbidden). |
| `canonicalFileName` | `string` | RenegadeCMM naming: `^[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+\.(safetensors\|gguf\|bin\|pt\|onnx)$` |
| `sizeBytes` | `number` | File size in bytes. |
| `fileType` | `string` | `Model`, `Pruned Model`, `VAE`, `Text Encoder`, `Config`, `Training Data`, `Preview`. |
| `targetSubfolder` | `string` | ComfyUI target directory: `checkpoints`, `loras`, `vae`, `text_encoders`, `unet`, `controlnet`, `upscale_models`. |
| `sha256` | `string` | 64-character hex SHA256 of the individual file. |

---

## Piece Length Sizing Strategy

To balance BitTorrent DHT handshake overhead and memory buffering across 50GB+ models, RenegadeSwarm calculates piece lengths automatically:

| Payload Size Range | Piece Length | Total Pieces (Approx.) |
|---|---|---|
| `< 500 MB` | **2 MB** (`2,097,152` bytes) | `< 250` |
| `500 MB – 2 GB` | **4 MB** (`4,194,304` bytes) | `125 – 500` |
| `2 GB – 10 GB` | **8 MB** (`8,388,608` bytes) | `250 – 1,250` |
| `10 GB – 30 GB` | **16 MB** (`16,777,216` bytes) | `625 – 1,875` |
| `> 30 GB` | **32 MB** (`33,554,432` bytes) | `937+` |

---

## Cryptographic Provenance

RenegadeSwarm uses deterministic Ed25519 payload signing. The signed digest is computed as:

$$\text{Digest} = \text{SHA256}(\text{CanonicalPayloadString} + \text{InfoHash})$$

Where `CanonicalPayloadString` is a deterministic serialization of `manifestId`, `title`, `version`, `creator`, `totalSizeBytes`, and file SHA256 hashes.

This ensures:
1. The model metadata is immutably bound to the BitTorrent `infoHash`.
2. Attackers cannot swap the payload file while retaining the creator's signature.
3. Tampering with even 1 byte in a 50GB model breaks both the BitTorrent piece hash and the creator manifest signature.
