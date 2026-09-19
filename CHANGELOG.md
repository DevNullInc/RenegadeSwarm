# RenegadeSwarm - Official Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] - 2026-09-19

### Major Features & Architectural Additions

#### 1. RenegadeSwarm-Exclusive P2P Model Search & Discovery Engine (Milestone 4 Completed)
- **BEP 10 Extended Discovery Handshake (`renegade_swarm_discovery_v1`)**:
  - Implemented application-specific extension messaging over BitTorrent protocol to discover and query models exclusively across live, certified RenegadeSwarm instances while preserving open BitTorrent data downloading.
- **DiscoveryEngine Service (`src/main/engine/discoveryEngine.ts`)**:
  - Local catalog indexing, peer search broadcast, response deduplication, TTL caching, and Web of Trust trust-scoring.
- **Dedicated Discovery View (`src/renderer/components/DiscoveryView.tsx`)**:
  - Desktop search interface with real-time debounced keyword search, category filter chips (`Checkpoints`, `LoRAs`, `GGUF/LLM`, `VAEs`, `ControlNets`), and live swarm peer count telemetry.
- **Amber Warning Modal Safeguard**:
  - Safeguard modal requiring explicit confirmation and displaying security disclosures before initiating downloads on unverified community models.
- **Automated Protocol & Engine Tests**:
  - Comprehensive unit and protocol test coverage in `tests/discoveryProtocol.test.ts` and `tests/discoveryEngine.test.ts`.

#### 2. Packaging State Hoisting & Background Job Persistence (Milestone 5 Completed)
- **PackageJobManager Service (`src/main/engine/packageJobManager.ts`)**:
  - Background job manager in the Electron main process to handle long-running model packaging, piece hashing, signature generation, and swarm seeding asynchronously.
- **Tab-Switching State Persistence**:
  - Hoisted active packaging state out of renderer memory, allowing users to navigate between views while 50GB+ models are processed.
- **Streaming SHA-256 Chunk Progress**:
  - Real-time percentage and byte progress streaming across IPC via push events (`swarm:packageProgress`).
- **Cancellation Tokens & Graceful Cleanup**:
  - Safe abort mechanics for active read streams, cleaning up temporary torrent artifacts and resetting engine state on user cancellation.
- **Typed IPC Channels**:
  - Added `swarm:startPackageJob`, `swarm:getActivePackagingJob`, `swarm:cancelPackagingJob`, and `swarm:clearPackagingJob` in `ipcContracts.ts`, `ipcHandlers.ts`, and `preload.ts`.

#### 3. Pre-Download Verification Handshake (`PreDownloadVerifier`)
- **Multi-Tier Pre-Download Verification Engine (`src/main/engine/preDownloadVerifier.ts`)**:
  - Validates model hashes, creator metadata, and provenance before initiating heavy weight downloads.
- **Multi-Registry Verification**:
  - Validates SHA-256 hashes against CivitAI (`/api/v1/model-versions/by-hash/:hash`) and Hugging Face repository endpoints with request timeouts and user-agent branding.
- **Custom Model Verifier**:
  - Cryptographically validates Ed25519 creator signatures on unindexed custom models (LoRAs, fine-tunes, checkpoints, GGUFs) against the local Web of Trust (WoT) keyring, rejecting blocked creators immediately.
- **Real-Time UI Handshake**:
  - Integrated debounced pre-download verification card into `DashboardView.tsx` Add Magnet modal, rendering live trust scores, base models, creator tags, and preview images.

#### 4. Automatic Companion File Triplet Harvesting & Persistence
- **Companion File Discovery (`discoverCompanionFiles`)**:
  - Sibling metadata discovery for `<model_base>.sha256`, `<model_base>.civitai.info` / `<model_base>.huggingface.info` / `<model_base>.info`, and `<model_base>.<ext>` preview image assets.
- **Companion Asset Auto-Generation**:
  - Auto-generation in `syncQueue.ts` upon model promotion from quarantine and via `PreDownloadVerifier.saveCompanionAssets`.

#### 5. Embedded AI Workflow Parameter Inspection
- **Workflow Metadata Inspector (`inspectImageWorkflowMetadata`)**:
  - Parses embedded AI generation parameters from image buffers: ComfyUI workflow graphs, Automatic1111 generation parameters, LoRA trigger words (`<lora:Name:weight>`), and positive prompts.

---

### Security Hardening & Bug Fixes
- **AST-Free HTML Sanitizer & Entity Decoder (CWE-116 & CWE-79)**:
  - Replaced regex-based HTML stripping with an AST-free character scanner (`sanitizeAndDecodeHtml`) in `modelMetadataExtractor.ts`, resolving multi-pass encoded HTML entities while discarding `<script>` and `<style>` blocks.
- **Preview Cache Path Traversal Defense (CWE-22)**:
  - Enforced strict hexadecimal hash sanitization (`/^[a-fA-F0-9]+$/`) and URL scheme validation on `downloadAndCachePreview`.
- **Automated GitHub Actions CodeQL Integration**:
  - Configured `.github/workflows/codeql.yml` with `security-and-quality` query suite and `actions/checkout@v5`.
- **Test Keyring Isolation**:
  - Isolated test keyring management in `tests/preDownloadVerifier.test.ts` to prevent test mock pollution in `.renegadeswarm_security/keyring.json`.
- **Unit Test Suite Expansion**:
  - 111/111 unit & integration tests passing across 23 test suites.

---

## [0.2.0] - 2026-09-12

### Major Features & Architectural Additions

#### 1. CivitAI & Hugging Face Auto-Population & Metadata Synchronization
- **Automatic Model Architecture Detection (`isLlmModel`)**:
  - Automatically identifies Large Language Models (LLMs) via file formats (`.gguf`, `.bin`) and architecture tokens (`llama`, `mistral`, `mixtral`, `qwen`, `gemma`, `deepseek`, `phi`, `chat`, `instruct`, `exl2`, `gptq`, `awq`, `text-generation`).
  - Skips image-centric CivitAI lookups for LLMs to prevent erroneous metadata mappings and reduce extraneous network traffic.
- **CivitAI & Hugging Face Public API Integration**:
  - Computes or retrieves cached SHA256 hashes from the RenegadeCMM database (`renegadecmm.sqlite`).
  - Queries `https://civitai.com/api/v1/model-versions/by-hash/:hash` for diffusion and image generation models (Flux, SDXL, SD 1.5, Pony, LoRA, Checkpoint, VAE, ControlNet).
  - Queries `https://huggingface.co/api/models` for LLMs and GGUF repositories when CivitAI hash is absent, extracting creator authors, pipeline tags, license info, and base models.
  - Auto-populates `title`, `creator`, `tags`, `baseModel`, `modelType`, `description`, `civitaiModelId`, `civitaiVersionId`, `hfRepoId`, and `previewFilePath`.
- **Cross-Database SQLite Write-Back to RenegadeCMM**:
  - Automatically writes back retrieved metadata (Creator name, tags, description, model types, base models, CivitAI/HF IDs, and SHA256 hashes) to the local SQLite database (`cmm.local_models`, `cmm.civitai_models`, `cmm.civitai_versions`).
  - Uses schema-adaptive dynamic column inspection (`PRAGMA cmm.table_info`) and `COALESCE` statements to preserve existing local customizations while bridging enriched metadata back into RenegadeCMM.
- **Verified Metadata Locking & Tamper Protection**:
  - Automatically locks all auto-populated form fields (Title, Version, Model Type, Base Model, Creator, CivitAI ID, HF Repo ID, Tags, Description, Preview) once populated from CivitAI, Hugging Face, or safetensors headers.
  - Intercepts accidental clicks on locked fields with an alert/confirmation modal: `⚠️ Unlock Verified Registry Metadata?` warning against categorization errors (e.g. uploading a LoRA as a Checkpoint or changing canonical names).
  - **Database Write Protection**: Manual overrides are strictly scoped to the local Swarm Manifest and are **never** passed to or written into the CMM SQLite database.
  - **Type Mismatch Diagnostics**: Displays real-time warnings if a user manually changes Model Type away from detected file signatures (e.g., GGUF/LLM files marked as Checkpoints, or LoRA weights mislabeled).
  - **One-Click Re-lock & Restore**: Provides a `🔒 Re-lock & Restore` button to instantly revert manual changes back to verified registry values.
- **Strict SFW Preview Policy Enforcement**:
  - Integrated with `sharingPolicyManager.getPolicy().allowNsfwSharing`.
  - When `allowNsfwSharing` is `false` (default), only preview images where `nsfw === false` and `nsfwLevel <= 1` (`None`, `PG`, `SFW`) are fetched.
  - If a model on CivitAI only contains NSFW preview images, the preview asset is rejected.
  - Downloaded SFW previews are cached locally to `~/.renegadeswarm/previews/<hash>.jpg` and auto-populated as `previewFilePath`.
- **Text Sterilization & Multi-Pass HTML Entity Decoding (`sanitizeAndDecodeHtml`)**:
  - Automatically converts block elements (`<p>`, `<br>`, `<li>`, `<div>`, `<h1>`-`<h6>`) to clean newlines and bullet formatting.
  - Recursively decodes named (`&lt;`, `&gt;`, `&amp;`, `&quot;`, `&#39;`, `&nbsp;`), decimal (`&#60;`), and hexadecimal (`&#x3c;`) HTML entities in generation notes, trigger words, model titles, creator names, and tags.
  - Properly formats LoRA prompts and trigger syntax (e.g. `rlbtyc1tr0n, <lora:R3alB3auty_ANIMAv1_v2:1.0>,`).

#### 2. Multi-Folder RenegadeCMM Sync & Download Routing
- **CMM Database Synchronization**:
  - Queries RenegadeCMM `app_config` table for `comfyui_root`, `comfyui_folders`, `comfyui_install_dir`, and `folder_mappings`.
  - Persists custom folder additions and default download destinations across restarts.
- **Flexible Folder Management**:
  - Added multi-folder overview in Settings with `[CMM Auto]` and `[Custom]` badges.
  - Interactive **(+) Add Folder** and **(x) Remove Folder** controls with deletion confirmation dialogs.
- **Multi-State CMM Connectivity Badge**:
  - **Connected**: Displays green `CMM Connected (count)` badge with pulse indicator; clicking navigates directly to the CMM Bridge view.
  - **Discovered Offline**: Displays amber `CMM Offline` badge when local CMM database is discovered on disk but disconnected/offline.
  - **Not Discovered / Uninstalled**: Dynamically transforms into an interactive gradient action badge: `Click here to install CMM` with external link trigger opening official GitHub Releases.
  - **Safe External Link Execution**: Added typed `shell:openExternal` IPC handler with strict HTTP/HTTPS URI scheme validation to prevent malicious protocol handler exploits.

#### 3. Identity Generation & Web of Trust Keyring Management
- **Ed25519 Identity Generation**:
  - Allows creators to generate Ed25519 signing keypairs directly in the application.
  - Implemented anti-abuse cooldown / lockout mechanism (rate limit stored in encrypted security vault; 24-hour cooldown in production engine).
- **Interactive Trusted Creator Keyring**:
  - Added per-key deletion with modal confirmation popups (`x` button).
  - Configured default trusted creator key to:
    `70fb7e8a57bbec5ffba1d16e317fb915ddeead2a5f3d8853ffb21759155936b7`
  - Keyring backup import and export via formatted JSON files.

---

### Security Hardening & Injection Defenses

#### 1. Strict Browse-Only Path Inputs
- Removed all arbitrary string text inputs for filesystem locations (model files, directory roots, SQLite databases, and preview media).
- Enforced native OS file dialog pickers via Electron IPC handlers:
  - `dialog:openModelFile`
  - `dialog:openDirectory`
  - `dialog:openSqliteFile`
  - `dialog:openPreviewFile`
- Prevents command injection, arbitrary path traversal, and corrupted path entries.

#### 2. Network Isolation & Port Deconfliction
- RenegadeSwarm default dev-server port shifted to `5180` and wire protocol to `6881` to prevent collisions with RenegadeCMM (`5174`/`5173`).
- Enhanced `rs.ps1` process tracking to strictly exclude `RenegadeCMM` processes from termination routines.

---

### User Interface & Layout Improvements

- **Full-Area Responsive Scaling**:
  - Redesigned all main application views (`DashboardView`, `CmmSyncView`, `SeederView`, `SettingsView`, `BandwidthView`) with dynamic flex layouts.
  - Maximizes screen real estate across window resizing without crowding.
- **Seeder View Enhancements**:
  - Added `LLM / Language Model` model type option.
  - Added a dedicated `Clear` button for preview images.
  - Live metadata source indicators displaying where auto-populated details originated.

---

### Documentation Architecture

- **System Architecture & P2P Protocol Guide (`docs/ARCHITECTURE.md`)**:
  - Authored a comprehensive technical architecture guide covering process boundaries, P2P network discovery (Trackers, BEP 42 DHT, PEX), binary BitTorrent wire protocol framing, 16KB piece pipelining, Tit-for-Tat choking/unchoking, sequence diagrams for seeding and downloading, and the RenegadeCMM SQLite `ATTACH DATABASE` bridge.
- **Privacy Policy & Data Handling Specification (`docs/PRIVACY_POLICY.md`)**:
  - Complete zero-telemetry privacy policy covering local storage, P2P IP disclosures, and GDPR/CCPA user rights.
- **Legal Disclaimer & Non-Liability Notice (`docs/LEGAL_DISCLAIMER.md`)**:
  - Legal framework detailing decentralized P2P neutrality, Betamax doctrine protections, and statutory non-liability boundaries.
- **DMCA & Copyright Non-Liability Notice (`docs/DMCA_NOTICE.md`)**:
  - DMCA § 512 non-hosting notice detailing technical impossibility of P2P decentralized takedowns and designated DMCA agent channels.

---

### Quality Assurance & Testing

- **Comprehensive Vitest Test Suite**:
  - **99/99** automated unit tests passing across **20** test suites in Vitest.
  - Dedicated test coverage for LLM detection, HTML entity sterilization & trigger formatting, CivitAI hash checking, Hugging Face API polling, SQLite ATTACH database write-back, SFW vs. NSFW preview filtering, CMM multi-folder routing, and keyring lockout.
- **GNU GPL-3.0 License Verification**:
  - Automated license header application across all 58 repository source and test files.
- **Development Changelog System (`DEV-CHANGELOG.md`)**:
  - Standardized rolling developer changelog to track unreleased improvements across version cycles.

---

## [0.1.0] - 2026-09-01

- Initial project skeleton, P2P engine wire protocol, and desktop prototype.
