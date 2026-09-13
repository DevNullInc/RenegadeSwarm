# RenegadeSwarm - Official Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
