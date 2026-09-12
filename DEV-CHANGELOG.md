# RenegadeSwarm - Development Changelog (`DEV-CHANGELOG.md`)

> **Developer Note**: This document serves as the active, rolling changelog for unreleased features, improvements, architectural updates, and bug fixes during active development cycles.
>
> **Lifecycle Policy**:
> 1. All incremental changes, fixes, and features are logged here in real-time under **Unreleased (Active Cycle)**.
> 2. When creating a new official version release/build (e.g., `v0.2.0`), the contents of this file are promoted into the permanent `CHANGELOG.md` / Release Notes, and this file is reset/cleared for the next cycle.

---

## [Unreleased] - Active Development Cycle (Target: v0.2.0)

### 🚀 Major Features & Architectural Additions

#### 1. CivitAI SHA256 Hash Matching & Metadata Auto-Population
- **Automatic Model Architecture Detection (`isLlmModel`)**:
  - Automatically identifies Large Language Models (LLMs) via file formats (`.gguf`, `.bin`) and architecture tokens (`llama`, `mistral`, `mixtral`, `qwen`, `gemma`, `deepseek`, `phi`, `chat`, `instruct`, `exl2`, `gptq`, `awq`, `text-generation`).
  - Skips image-centric CivitAI lookups for LLMs to prevent erroneous metadata mappings and reduce extraneous network traffic.
- **CivitAI Public API Integration**:
  - Computes or retrieves cached SHA256 hashes from the RenegadeCMM database (`renegadecmm.sqlite`).
  - Queries `https://civitai.com/api/v1/model-versions/by-hash/:hash` for diffusion and image generation models (Flux, SDXL, SD 1.5, Pony, LoRA, Checkpoint, VAE, ControlNet).
  - Auto-populates `title`, `creator`, `tags`, `baseModel`, `modelType`, `description`, `civitaiModelId`, and `civitaiVersionId`.
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
  - Dedicated **"Set as Default"** action allowing users to route swarm downloads to any discovered ComfyUI model folder.
  - Updated **Add Magnet** modal on Dashboard with a target folder selector dropdown and browse picker.

#### 3. Identity Generation & Web of Trust Keyring Management
- **Ed25519 Identity Generation**:
  - Allows creators to generate Ed25519 signing keypairs directly in the application.
  - Implemented anti-abuse cooldown / lockout mechanism (15-minute rate limit stored in encrypted security vault).
- **Interactive Trusted Creator Keyring**:
  - Added per-key deletion with modal confirmation popups (`x` button).
  - Configured default trusted creator key to:
    `70fb7e8a57bbec5ffba1d16e317fb915ddeead2a5f3d8853ffb21759155936b7`
  - Keyring backup import and export via formatted JSON files.

---

### 🛡️ Security Hardening & Injection Defenses

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

### 🎨 User Interface & Layout Improvements

- **Full-Area Responsive Scaling**:
  - Redesigned all main application views (`DashboardView`, `CmmSyncView`, `SeederView`, `SettingsView`, `BandwidthView`) with dynamic flex layouts.
  - Maximizes screen real estate across window resizing without crowding.
- **Seeder View Enhancements**:
  - Added `LLM / Language Model` model type option.
  - Added a dedicated `Clear` button for preview images.
  - Live metadata source indicators displaying where auto-populated details originated.

---

### 🧪 Quality Assurance & Testing

- **Comprehensive Test Suite**:
  - **85/85** automated unit tests passing across **19** test suites in Vitest.
  - Dedicated test coverage for LLM detection, CivitAI hash checking, SFW vs. NSFW preview filtering, CMM multi-folder routing, and keyring lockout.
- **GNU GPL-3.0 License Verification**:
  - Automated license header application across all 58 repository source and test files.

---

## 📋 Instructions for Next Version Release

When preparing the official release (e.g., `v0.2.0`):
1. Copy the entries under `## [Unreleased]` into `CHANGELOG.md` under `## [v0.2.0] - YYYY-MM-DD`.
2. Clear the contents under `## [Unreleased] - Active Development Cycle` in this file to reset it for `v0.3.0`.
3. Update version in `package.json` and rebuild binaries via `npm run build` / `npm run dist`.
