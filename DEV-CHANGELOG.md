# RenegadeSwarm - Development Changelog (`DEV-CHANGELOG.md`)

> **Developer Note**: This document serves as the active, rolling changelog for unreleased features, improvements, architectural updates, and bug fixes during active development cycles.
>
> **Lifecycle Policy**:
> 1. All incremental changes, fixes, and features are logged here in real-time under **Unreleased (Active Cycle)**.
> 2. When creating a new official version release/build (e.g., `v0.3.0`), the contents of this file are promoted into the permanent `CHANGELOG.md` / Release Notes, and this file is reset/cleared for the next cycle.

---

## [Unreleased] - Active Development Cycle (Target: v0.3.0)

### Major Features & Architectural Additions
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
- **Unit Test Suite Expansion**:
  - Added unit test suites for `preDownloadVerifier.test.ts` (CivitAI, HuggingFace, WoT custom model verification, companion asset generation).
  - Added test coverage for image workflow parameter inspection in `contentValidator.test.ts` and HTML decoding in `modelMetadataExtractor.test.ts`.
  - Total test suite: **99/99 tests passing across 20 test files**.

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
