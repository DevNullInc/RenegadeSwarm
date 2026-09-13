# RenegadeSwarm - Development Changelog (`DEV-CHANGELOG.md`)

> **Developer Note**: This document serves as the active, rolling changelog for unreleased features, improvements, architectural updates, and bug fixes during active development cycles.
>
> **Lifecycle Policy**:
> 1. All incremental changes, fixes, and features are logged here in real-time under **Unreleased (Active Cycle)**.
> 2. When creating a new official version release/build (e.g., `v0.3.0`), the contents of this file are promoted into the permanent `CHANGELOG.md` / Release Notes, and this file is reset/cleared for the next cycle.

---

## [Unreleased] - Active Development Cycle (Target: v0.3.0)

### Major Features & Architectural Additions
- **RenegadeSwarm-Exclusive P2P Model Search & Discovery Engine (Milestone 1 Completed)**:
  - Implemented BEP 10 extension handshake (`renegade_swarm_discovery_v1`) to discover and query models exclusively across live, certified RenegadeSwarm instances while preserving open BitTorrent data downloading.
  - Implemented `DiscoveryEngine` service (`src/main/engine/discoveryEngine.ts`) with local catalog indexing, peer search broadcast, response deduplication, TTL caching, and Web of Trust trust-scoring.
  - Added dedicated desktop `DiscoveryView` (`src/renderer/components/DiscoveryView.tsx`) with real-time debounced keyword search, category filter chips (`Checkpoints`, `LoRAs`, `GGUF/LLM`, `VAEs`, `ControlNets`), and live swarm peer count telemetry.
  - Built Amber Warning Modal safeguard (`AmberWarningModal.tsx`) requiring explicit confirmation and displaying security disclosures before initiating downloads on unverified community models.
  - Added automated unit and protocol test coverage in `tests/discoveryProtocol.test.ts` and `tests/discoveryEngine.test.ts`.
- **Pre-Download Verification Handshake (`PreDownloadVerifier`)**:
  - Implemented multi-tier pre-download verification engine (`src/main/engine/preDownloadVerifier.ts`) that validates model hashes, creator metadata, and provenance before initiating heavy weight downloads.
  - Multi-Registry Verification: Validates SHA-256 hashes against CivitAI (`/api/v1/model-versions/by-hash/:hash`) and Hugging Face repository endpoints with request timeouts and user-agent branding.
  - Custom Model Verifier: Cryptographically validates Ed25519 creator signatures on unindexed custom models (LoRAs, fine-tunes, checkpoints, GGUFs) against the local Web of Trust (WoT) keyring, rejecting blocked creators immediately.
  - Real-Time UI Handshake: Integrated debounced pre-download verification card into `DashboardView.tsx` Add Magnet modal, rendering live trust scores, base models, creator tags, and preview images.
  - Typed IPC Contracts: Added `PreDownloadVerifyRequestSchema` and `PreDownloadVerificationResult` in `src/shared/ipcContracts.ts`, registered over `swarm:verifyPreDownload`.
- **Automatic Companion File Triplet Harvesting & Persistence**:
  - Added companion file discovery (`discoverCompanionFiles`) in `modelMetadataExtractor.ts` to locate sibling metadata files:
    - `<model_base>.sha256`: Plaintext SHA-256 hash.
    - `<model_base>.civitai.info` / `<model_base>.huggingface.info` / `<model_base>.info`: Complete JSON metadata payload.
    - `<model_base>.<ext>` (`.png`, `.jpg`, `.webp`, `.preview.png`): Sibling preview image asset.
  - Added companion asset auto-generation in `syncQueue.ts` upon model promotion from quarantine and via `PreDownloadVerifier.saveCompanionAssets`.
- **Embedded AI Workflow Parameter Inspection**:
  - Implemented `inspectImageWorkflowMetadata` in `src/protocol/contentValidator.ts` to parse embedded AI generation parameters from image buffers:
    - ComfyUI workflow graphs (`tEXtworkflow`, `class_type`, `nodes`).
    - Automatic1111 / WebUI generation parameters (`tEXtparameters`, `parameters\0`, `Steps:`, `Sampler:`).
    - Extracted LoRA trigger words (`<lora:Name:weight>`) and positive generation prompts.
- **Engineering Roadmap Specification (`ROADMAP.md`)**:
  - Authored comprehensive engineering roadmap defining the 5 core milestones:
    - **Milestone 1 (Top Priority)**: RenegadeSwarm-Exclusive P2P Model Search & Discovery Engine with BEP 10 extension filtering.
    - **Milestone 2**: Packaging state hoisting and persistent job manager to prevent tab-switching wipeout.
    - **Milestone 3**: Scoped companion asset harvesting and ComfyUI workspace awareness.
    - **Milestone 4**: Strict AI model payload gatekeeping and executable/magic byte rejection.
    - **Milestone 5**: Companion triplet pre-flight handshake and quarantine verification.
- **GitHub Sponsors & Multi-Channel Backing Integration**:
  - Created `.github/FUNDING.yml` configuring GitHub Sponsors (`DevNullInc`), Ko-fi (`stygianrenegade`), and PayPal channels.
  - Integrated sponsor badges and dedicated support sections across `README.md` and `ROADMAP.md`.

---

### Security Hardening & Bug Fixes
- **AST-Free HTML Sanitizer & Entity Decoder (CWE-116 & CWE-79)**:
  - Replaced regex-based HTML stripping with a robust, AST-free character scanner (`sanitizeAndDecodeHtml`) in `src/main/metadata/modelMetadataExtractor.ts`.
  - Discards `<script>` and `<style>` blocks and their contents completely while transforming structural elements (`<br>`, `<p>`, `<li>`, headings) into clean plaintext formatting.
  - Implemented multi-pass entity decoding to resolve doubly-encoded decimal and hex HTML entities (`&amp;lt;` $\to$ `<`) without introducing XSS vulnerabilities.
- **Local CodeQL Static Analysis**:
  - Created and executed local CodeQL database analysis against `javascript-security-and-quality.qls` (203 queries across 64 files), achieving **0 security blocker alerts**.
  - Resolved static negation warnings, dead variable declarations, and hardened preview cache writes against directory traversal.
- **Preview Cache Path Traversal Defense (CWE-22)**:
  - Enforced strict hexadecimal hash sanitization (`/^[a-fA-F0-9]+$/`) and URL scheme validation on `downloadAndCachePreview`.
- **Specialized Multi-File Version Synchronization Utility**:
  - Implemented standalone Node.js version management CLI (`scripts/bump-version.js`) to synchronize semantic version strings across 10 project files (`package.json`, `package-lock.json`, `README.md`, `SECURITY.md`, `src/protocol/wireProtocol.ts`, `src/main/metadata/modelMetadataExtractor.ts`, `src/main/engine/manifestBuilder.ts`, `src/main/engine/preDownloadVerifier.ts`, `tests/discoveryProtocol.test.ts`, and `docs/MANIFEST_SPEC.md`).
  - Added CLI dispatching in `rs.ps1` (`.\rs.ps1 bump-version --patch|--minor|--major|<version>`).
  - Hardened `.gitignore` to keep version management scripts and local release scripts excluded from git commits.
- **Privacy Policy Update for P2P Search & Discovery**:
  - Added Section 6 to `docs/PRIVACY_POLICY.md` detailing the decentralized, ephemeral nature of P2P model discovery queries and explicitly clarifying that local unshared file libraries, ComfyUI directories, and private models are never scanned, indexed, or exposed to connected swarm peers.
- **Unit Test Suite Expansion**:
  - Added unit and protocol test suites for `discoveryProtocol.test.ts` and `discoveryEngine.test.ts`.
  - Added unit test suites for `preDownloadVerifier.test.ts` (CivitAI, HuggingFace, WoT custom model verification, companion asset generation).
  - Added test coverage for image workflow parameter inspection in `contentValidator.test.ts` and HTML decoding in `modelMetadataExtractor.test.ts`.
  - Total test suite: **106/106 tests passing across 22 test files** (100% pass rate).

---

### UI & Layout Improvements
- **Dashboard Add Magnet Modal**:
  - Added interactive pre-download preview card with real-time verification indicators (spinners, green verified badges, yellow community warnings, red rejection alerts).
  - Added creator badge display, model type chips, base model tags, and trust score metrics.
- **Directory Selection in Download Modal**:
  - Enabled destination folder selection directly within the Add Magnet modal using `dialog:openDirectory`.

---

## Instructions for Next Version Release

When preparing the official release (e.g., `v0.3.0`):
1. Copy the entries under `## [Unreleased]` into `CHANGELOG.md` under `## [v0.3.0] - YYYY-MM-DD`.
2. Clear the contents under `## [Unreleased] - Active Development Cycle` in this file to reset it for `v0.4.0`.
3. Update version in `package.json` and rebuild binaries via `npm run build` / `npm run dist`.
