# RenegadeSwarm

> **A decentralized, torrent-style AI model distribution network with automatic ComfyUI organization and seamless RenegadeCMM integration.**

[![Version: 0.1.0](https://img.shields.io/badge/version-0.1.0-purple.svg)](https://github.com/DevNullInc/RenegadeSwarm/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-3178c6.svg)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-34+-47848F.svg)](https://www.electronjs.org/)
[![Tests](https://img.shields.io/badge/Tests-79%20Passed-brightgreen.svg)](tests/)
[![Security: Sandboxed](https://img.shields.io/badge/Security-Zero--Trust%20Quarantine-success.svg)](docs/MANIFEST_SPEC.md)

---

## ⚡ Overview

**RenegadeSwarm** is an uncensored, community-powered P2P distribution network engineered specifically for large generative AI and LLM models (Checkpoints, LoRAs, UNets, GGUFs, VAEs, Text Encoders). It empowers creators and users to seed, download, and index multi-gigabyte models without gatekeeping, centralized bandwidth throttling, rate limits, or single-point-of-failure hosting dependencies.

RenegadeSwarm is designed from the ground up to work seamlessly with [**RenegadeCMM**](https://github.com/DevNullInc/RenegadeCMM), matching its ComfyUI directory hierarchies, canonical file naming standards (`model_name_author.extension`), cryptographic model hashing pipeline, and live SQLite database store.

Whether you are distributing a brand-new 25GB base checkpoint or downloading community LoRAs, RenegadeSwarm ensures maximum swarm throughput, instant HTTP Web Seed fallbacks, and zero-compromise security.

---

## 🛡️ Zero-Trust Security & User Safety Principles

Security is the fundamental pillar of RenegadeSwarm. Because P2P networks allow transfers from unknown peers, RenegadeSwarm enforces a strict **Zero-Trust Defense-in-Depth Architecture** across every layer of the application so users can run, download, and seed with 100% peace of mind:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             UNTRUSTED P2P NETWORK                                │
│                   (BitTorrent Peers, DHT Swarms, Web Seeds)                      │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 1. PRE-WRITE CHUNK VERIFICATION (In-Memory SHA256 per Piece)                     │
│    • Corrupt or poisoned pieces dropped before touching the filesystem           │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 2. QUARANTINE ISOLATION STAGING (`.quarantine/*.part`)                           │
│    • Incomplete transfers completely isolated from ComfyUI                       │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 3. MULTI-PASS CONTENT & POLYGLOT VALIDATOR                                       │
│    • SafeTensors / GGUF / ONNX / PyTorch magic byte & header verification        │
│    • Executable rejection (PE `MZ`, ELF `\x7fELF`, Mach-O, scripts)              │
│    • Anti-Polyglot defense (ZIP `PK\x03\x04` header detection)                   │
│    • Full-file SHA256 digest validation                                          │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │ Pass
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 4. ATOMIC PROMOTION & CMM INTEGRATION                                            │
│    • Atomic rename into canonical folder (`checkpoints/`, `loras/`, etc.)        │
│    • Direct commit to `renegadecmm.sqlite` via SQLite `ATTACH DATABASE`          │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 1. Hardened Process Boundary Isolation
* **100% Sandboxed Renderer**: The user interface runs strictly within an isolated Webview (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`).
* **Zero Direct OS/Disk Access**: The renderer process has zero access to Node.js runtime globals, file system handles, child-process spawners, or raw sockets.
* **Zod-Validated IPC Contracts**: Every message crossing the Electron IPC boundary is strictly validated against strict Zod runtime schemas (`src/shared/ipcContracts.ts`). Any malformed or unauthorized payload is rejected immediately.

### 2. Multi-Pass Zero-Masquerade Content Validation
RenegadeSwarm is built exclusively for AI models. It inspects all payloads at the byte level before they are allowed anywhere near your system:
* **Deep Magic-Byte Inspection**: Validates SafeTensors 8-byte uint64 headers, GGUF magic bytes (`GGUF\x03\x00\x00\x00`), ONNX Protobuf signatures, and PyTorch serialization headers.
* **Strict Anti-Polyglot Defense**: Blocks ZIP archive headers (`PK\x03\x04`) and archive bombs masquerading as valid tensor weights.
* **Zero Executable Tolerance**: Instantly identifies and rejects Windows PE (`MZ`, `.exe`, `.dll`), Linux ELF (`\x7fELF`), macOS Mach-O, shell scripts (`.sh`, `.bat`, `.ps1`), Python source files (`.py`), and video/media containers (`.mkv`, `.mp4`).

### 3. Quarantine Isolation State Machine
* All incoming data is written with temporary `.part` suffixes inside a dedicated, isolated `.quarantine/` directory.
* Files remain quarantined until the transfer reaches 100%, passes in-memory piece SHA256 checks, passes full-file SHA256 verification, and clears deep content inspection.
* Only after all safety gates pass is the file atomically renamed and promoted to your active ComfyUI models directory.

### 4. Cryptographic Provenance, Machine-Bound Vault & Anti-Abuse Key Lockout
* Manifests are signed by model creators using 32-byte **Ed25519** public keys.
* **Machine-Bound AES-256-GCM Vault**: Private keys are encrypted at rest using machine-and-user entropy, ensuring plaintext keys are never stored on disk.
* **Anti-Abuse Regeneration Lockout**: Enforces a 24-hour cooldown between keypair regenerations to prevent malicious actors from cycling disposable identities and evading Web of Trust blacklists.
* **Web of Trust Keyring**: Downloader clients verify signatures against the local Keyring and Web-of-Trust tiers (`VerifiedCreator`, `Community`, `Untrusted`, `Blocked`). See [Web of Trust Guide](docs/WEB_OF_TRUST.md) for details.

### 5. Swarm & DHT Sybil Attack Hardening
* **BEP 42 Node ID Verification**: Validates IP-derived hashes on incoming DHT nodes to prevent Sybil routing table poisoning.
* **Pinned Swarms & Query Throttling**: Rate-limits DHT maintenance queries (<5 KB/s idle) and isolates active swarm lookups.
* **Pre-Write Piece SHA256 Verification**: Every downloaded piece is verified in memory before disk allocation, completely neutralizing piece-poisoning attacks.

### 6. Directory Traversal & Injection Defense
* File entries inside manifests are sanitized and validated against directory traversal attacks (`../`, `..\\`, absolute paths).
* File names are forced into canonical ComfyUI naming conventions: `^[a-zA-Z0-9_-]+_[a-zA-Z0-9_-]+\.(safetensors|gguf|bin|pt|onnx)$` (`model_name_author.extension`).

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🔒 **Opt-In Model Sharing & Privacy Policy** | Strict **Opt-In by default**. Local models and completed downloads are never seeded without explicit user permission. Built-in folder and tag blacklists protect private LoRAs and proprietary checkpoints. |
| 🔑 **Ed25519 Creator Provenance & Web of Trust** | Immutable public-key signing locks metadata to the BitTorrent `infoHash`. Includes pre-seeded root keys, manual creator pinning, JSON bundle import/export, and machine-bound AES-256-GCM key storage. |
| 🛡️ **Anti-Abuse Key Lockout Safeguard** | Mandatory 24-hour regeneration cooldown prevents bad actors from cycling identities or evading community blacklists. |
| 🚀 **50GB+ Memory-Safe Streaming** | Tuned random-access disk streaming with pre-write in-memory SHA256 chunk verification prevents buffer fragmentation on multi-gigabyte models. |
| 🛡️ **Zero-Masquerade Content Validation** | Deep magic-byte inspection strictly validates SafeTensors, GGUF, ONNX, and PyTorch headers while rejecting executables, scripts, media, and polyglots. |
| ⚡ **Atomic RenegadeCMM Bridge** | SQLite `ATTACH DATABASE` synchronization commits downloads directly into ComfyUI folder structures (`checkpoints/`, `loras/`, `vae/`) with zero sync lag. |
| 🌐 **BEP 19 Web Seed Bootstrapping** | New swarms bootstrap immediately from Hugging Face or CivitAI HTTP endpoints while transitioning seamlessly into decentralized P2P sharing. |
| 💻 **Cyberpunk Desktop UI & Settings** | Dark-themed responsive dashboard with live swarm telemetry, background tray seeding, ratio governance, and complete Web of Trust settings. |

---

## 📁 Project Architecture

```
RenegadeSwarm/
├── docs/                       # Technical specifications and developer guides
│   ├── MANIFEST_SPEC.md        # .swarm manifest schema & piece sizing matrix
│   ├── SIGNING_GUIDE.md        # Ed25519 key generation, signing & creator provenance
│   ├── WEB_OF_TRUST.md         # Keyring tiers, discovery & Web of Trust model
│   ├── TROUBLESHOOTING.md      # Diagnostics, NAT traversal, quarantine rejection codes
│   └── LEGAL_DISCLAIMER.md     # Safe harbor notices, Betamax doctrine & liability limits
├── src/
│   ├── protocol/               # Pure TypeScript protocol layer (Universal / No Node/Electron APIs)
│   │   ├── types.ts            # Core protocol interfaces & data models
│   │   ├── validation.ts       # Zod schemas & canonical naming validators
│   │   ├── crypto.ts           # Ed25519 signing, verification & piece hashing
│   │   ├── manifest.ts         # Manifest parsing, serialization & magnet URI generation
│   │   ├── contentValidator.ts # Magic byte inspection, polyglot & executable defense
│   │   ├── keyring.ts          # Web-of-Trust engine & trusted creator key store
│   │   ├── sharingPolicy.ts    # Model sharing filter & opt-in permission evaluator
│   │   └── wireProtocol.ts     # BEP 3 BitTorrent wire protocol framing & bitfields
│   ├── main/                   # Privileged Electron Core
│   │   ├── index.ts            # App lifecycle, single-instance lock & window management
│   │   ├── preload.ts          # Capability-scoped Context Bridge
│   │   ├── ipcHandlers.ts      # Zod-validated IPC handler registry
│   │   ├── tray.ts             # System tray manager for 24/7 background seeding
│   │   ├── engine/             # P2P Engine & Storage Layer
│   │   │   ├── keyringManager.ts     # Keyring persistence & anti-abuse lockout governor
│   │   │   ├── secureStorage.ts      # Machine-bound AES-256-GCM credential encryption
│   │   │   ├── swarmEngine.ts        # Swarm coordinator & active transfer manager
│   │   │   ├── syncQueue.ts          # Quarantine state machine & atomic promoter
│   │   │   ├── pieceStreamEngine.ts  # Tuned highWaterMark disk writer
│   │   │   ├── peerManager.ts        # Peer pool, Tit-for-Tat upload ranking & optimistic unchoking
│   │   │   ├── bandwidthScheduler.ts # Token Bucket rate limiter & seeding ratio governor
│   │   │   ├── dhtHardening.ts       # BEP 42 Sybil defense & DHT query limiter
│   │   │   ├── daemonRpcEngine.ts    # JSON-RPC adapter for transmission-daemon / rqbit sidecars
│   │   │   ├── contentInspector.ts   # Quarantine header reader & extension resolver
│   │   │   └── manifestBuilder.ts    # SHA256 & info-hash builder with Web Seeds
│   │   ├── metadata/           # Multi-Tier Model Metadata Extractor
│   │   │   └── modelMetadataExtractor.ts # SafeTensors uint64 header, CMM DB & CivitAI scraper
│   │   └── cmm/                # RenegadeCMM Integration
│   │       ├── cmmDbBridge.ts        # Non-blocking SQLite bridge with ATTACH DATABASE
│   │       └── cmmFolderRouter.ts    # ComfyUI directory router & traversal protection
│   ├── shared/                 # Shared contracts & types between main and renderer
│   │   ├── cmmTypes.ts         # ComfyUI folders, file types, security whitelists
│   │   ├── ipcContracts.ts     # Type-safe IPC channels & request/response schemas
│   │   └── swarmProtocol.ts    # Swarm manifest schema, hashes & peer metrics
│   └── renderer/               # Desktop UI (React, Vite, Dark Cyberpunk Theme)
│       ├── App.tsx             # Main application layout & live telemetry coordinator
│       ├── components/         # Swarm Monitor, Seeder, CMM Bridge, Bandwidth, Settings views
│       └── styles/             # Design tokens & glassmorphism styling
├── tests/                      # Vitest test suite (19 suites, 79 unit & integration tests)
```

---

## 🔬 Rigorous Security, Privacy & Legal Verification

To give users and creators 100% peace of mind, RenegadeSwarm undergoes multi-layered automated verification, defensive SecOps audits, and penetration testing across all layers of the codebase:

### 1. Comprehensive Test Suite (79 Passing Tests / 19 Suites)
Every commit is validated through automated integration and unit test matrices covering:
* **Ed25519 Cryptographic Provenance & Keyring Vault** (`tests/ed25519Signing.test.ts`, `tests/keyringManager.test.ts`): Signature generation, machine-bound AES-256-GCM encryption at rest, anti-abuse 24h lockout enforcement, SPKI/PKCS8 DER conversion, and tampering rejection.
* **Zero-Masquerade Content Validation** (`tests/contentValidator.test.ts`): Verification of SafeTensors, GGUF, ONNX, and PyTorch headers; instant rejection of polyglot ZIPs (`PK\x03\x04`), Windows MZ (`4D 5A`), Linux ELF (`7F 45 4C 46`), Mach-O, Shebang scripts (`#!`), and MP4/MKV video containers.
* **Quarantine State Isolation Machine** (`tests/syncQueue.test.ts`): Verification of the full lifecycle (`Quarantine → Validating → Queued → Active → Completed → Verified`) preventing unverified piece writes to active directories.
* **P2P Wire Protocol & Sybil Defense** (`tests/wireProtocol.test.ts`, `tests/dhtHardening.test.ts`): BEP 3 wire protocol framing, handshake bitfields, and BEP 42 IP-hash node ID verification.
* **Opt-In Model Sharing & Privacy Governance** (`tests/sharingPolicy.test.ts`): Strict opt-in by default verification, automatic blocking of `/private/`, `/drafts/`, `/wip/`, and `private_*` models.
* **SQLite Zero-Lag WAL Attachment** (`tests/sqliteAttach.test.ts`): Non-blocking cross-database synchronization with `renegadecmm.sqlite`.
* **ComfyUI Directory Routing & Traversal Defense** (`tests/cmmFolderRouter.test.ts`): Directory traversal rejection, path sanitization, and model type routing (`checkpoints/`, `loras/`, `vae/`, etc.).
* **Model Metadata Extraction Pipeline** (`tests/modelMetadataExtractor.test.ts`): SafeTensors uint64 header parsing, sibling preview asset discovery, and CMM database integration.

### 2. Multi-Perspective Security Audit Summary

| Audit Dimension | Methodology & Standards | Verified Safeguards | Status |
|---|---|---|:---:|
| **Application Security** | OWASP Top 10, ASVS, CWE Mapping (CWE-798, CWE-20, CWE-22, CWE-89) | Zero hardcoded secrets, 100% Zod-validated Electron IPC contracts, parameterized SQLite queries (`?`), and context isolation. | 🟢 **PASSED** |
| **Defensive SecOps** | Fail-Fast Bootstrap, Strict Quarantine, Seeding Ratio Caps | In-memory piece pre-write SHA256 validation, quarantine isolation staging, and configurable seeding ratio governor. | 🟢 **PASSED** |
| **P2P Penetration & Privacy** | Threat Modeling, Metadata Leakage & Sybil Analysis | Local paths sanitized via `path.basename()`, transmission daemon RPC locked to `127.0.0.1`, and BEP 42 DHT hardening. | 🟢 **PASSED** |
| **Legal Compliance** | Betamax Doctrine (*Sony v. Universal*), Anti-Inducement (*MGM v. Grokster*), GPLv3 §§15–17 | Standardized GPL-3.0 headers across all 48 source files, neutral protocol safe-harbor notices, and comprehensive liability limits. | 🟢 **PASSED** |

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: `>= 22.0.0`
- **npm**: `>= 10.0.0`
- **RenegadeCMM** (Optional, for automatic ComfyUI library synchronization): [RenegadeCMM Repository](https://github.com/DevNullInc/RenegadeCMM)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/DevNullInc/RenegadeSwarm.git
cd RenegadeSwarm

# 2. Install dependencies
npm install
```

### Running Locally

```bash
# Run the Vite UI development server
npm run dev

# Launch the full Electron desktop application
npm run electron:dev
```

### Trusted Creator Setup
RenegadeSwarm pre-seeds trusted root keys for `@TheStygianRenegade` and `@DevNullInc`. To add your own trusted creators, navigate to **Settings → Trusted Creators & Keyring** in the desktop application or see the [**Web of Trust Guide**](docs/WEB_OF_TRUST.md).

### Running the Test Suite

```bash
npm test
```

---

## 🛠️ Programmatic Usage (Protocol SDK)

RenegadeSwarm exports a pure TypeScript protocol layer (`src/protocol/`) with zero Node.js/Electron API dependencies, making it suitable for CLI tools, web workers, and CI pipelines.

```typescript
import { buildSwarmManifest } from './src/main/engine/manifestBuilder';
import { generateEd25519KeyPair, signSwarmManifest, verifySwarmManifestSignature } from './src/protocol/crypto';
import { generateMagnetUri, serializeSwarmManifest } from './src/protocol/manifest';

// 1. Generate an Ed25519 keypair for model signing
const { publicKeyHex, privateKeyHex } = generateEd25519KeyPair();

// 2. Construct the model manifest with Web Seeds
const manifest = await buildSwarmManifest({
  modelFilePath: 'D:/models/FLUX_1_Dev_Cyberpunk_TheStygianRenegade.safetensors',
  title: 'FLUX.1-Dev Cyberpunk',
  version: '1.0.0',
  modelType: 'LORA',
  baseModel: 'Flux.1 D',
  creator: 'TheStygianRenegade',
  creatorPublicKey: publicKeyHex,
  urlList: [
    'https://huggingface.co/TheStygianRenegade/flux-cyberpunk/resolve/main/FLUX_1_Dev_Cyberpunk_TheStygianRenegade.safetensors'
  ],
});

// 3. Cryptographically sign the manifest
manifest.signature = signSwarmManifest(manifest, privateKeyHex, publicKeyHex);

// 4. Validate signature before distribution
const isVerified = verifySwarmManifestSignature(manifest);
console.log('Manifest Verified:', isVerified);

// 5. Generate standard BitTorrent magnet link with Web Seeds
const magnetUri = generateMagnetUri(manifest);
console.log('Shareable Magnet Link:', magnetUri);
```

---

## 📚 Documentation

Detailed technical specifications and operational guides are available in the [`docs/`](docs/) directory:

- [**Manifest Specification (`docs/MANIFEST_SPEC.md`)**](docs/MANIFEST_SPEC.md) — Complete specification of the `.swarm` metadata schema, piece sizing formulas, and hash algorithms.
- [**Signing & Provenance Guide (`docs/SIGNING_GUIDE.md`)**](docs/SIGNING_GUIDE.md) — Guide to generating Ed25519 keys, signing models, and cryptographic verification.
- [**Web of Trust Guide (`docs/WEB_OF_TRUST.md`)**](docs/WEB_OF_TRUST.md) — Detailed guide on key distribution, trust levels, TOFU verification, and keyring import/export.
- [**Troubleshooting Guide (`docs/TROUBLESHOOTING.md`)**](docs/TROUBLESHOOTING.md) — Operational solutions for NAT traversal, quarantine rejections, and CMM database locks.
- [**Security Policy (`SECURITY.md`)**](SECURITY.md) — Responsible disclosure guidelines, response SLAs, threat boundaries, and researcher safe-harbor terms.
- [**Legal Disclaimer & Non-Liability Notice (`docs/LEGAL_DISCLAIMER.md`)**](docs/LEGAL_DISCLAIMER.md) — Comprehensive legal notice regarding decentralized P2P architecture, Betamax doctrine, and limitation of liability.

---

## 📦 Building for Production

```bash
# Package for Windows (NSIS Installer & Portable Executable)
npm run dist:win

# Package for Linux (AppImage & tar.gz)
npm run dist:linux

# Package for macOS (DMG)
npm run dist:mac
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these standards:
1. Ensure all new IPC contracts or manifest fields are validated with **Zod**.
2. Run `npm test` before submitting pull requests.
3. Adhere to sandboxed process isolation rules (no privileged Node APIs in the renderer).

---

## ⚖️ Usage Compliance

RenegadeSwarm is a neutral distribution protocol. Users are solely and exclusively responsible for complying with local laws regarding data sharing, copyright, and AI model distribution. The content validation filters are technical safeguards against malware and corruption, not legal guarantees. See [**Legal Disclaimer**](docs/LEGAL_DISCLAIMER.md) for full terms and conditions.

---

## 📬 Contact & Official Channels

- **Bug Reports & Issues**: 📧 [`bug-report@renegadeinc.net`](mailto:bug-report@renegadeinc.net)
- **General Inquiries & Community**: 📧 [`contact-us@renegadeinc.net`](mailto:contact-us@renegadeinc.net)
- **Security Vulnerability Disclosures**: 📧 [`security@renegadeinc.net`](mailto:security@renegadeinc.net)
- **Legal Inquiries & Copyright Notices**: 📧 [`legal@renegadeinc.net`](mailto:legal@renegadeinc.net)

---

## 📜 License

Licensed under the **GNU General Public License v3.0 or later** (GPL-3.0-or-later). See [`LICENSE`](LICENSE) for details.
