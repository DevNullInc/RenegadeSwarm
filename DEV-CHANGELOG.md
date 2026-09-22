# RenegadeSwarm - Development Changelog (`DEV-CHANGELOG.md`)

> **Developer Note**: This document serves as the active, rolling changelog for unreleased features, improvements, architectural updates, and bug fixes during active development cycles.
>
> **Lifecycle Policy**:
> 1. All incremental changes, fixes, and features are logged here in real-time under **Unreleased (Active Cycle)**.
> 2. When creating a new official version release/build (e.g., `v0.4.0`), the contents of this file are promoted into the permanent `CHANGELOG.md` / Release Notes, and this file is reset/cleared for the next cycle.

---

## [Unreleased] - Active Development Cycle (Target: v0.4.0)

### Major Features & Architectural Additions
- **Sister Wakeup Protocol (`POST /api/sister/wakeup`)**: Implemented bidirectional loopback signaling between RenegadeSwarm (`127.0.0.1:5180`) and RenegadeCMM (`127.0.0.1:5174`). Sends a one-shot 400ms startup poke with Bearer auth to notify dormant sister instances upon boot, eliminating startup race conditions.
- **5-Probe Rate-Limiting Budget & Sleep State Machine**: Capped background CMM status polling to 5 consecutive failed probes. Automatically halts polling timers and enters dormancy (`isAsleep = true`) to eliminate idle CPU and network wakeups when RenegadeCMM is closed.
- **Live HTTP Auto-Detection (`cmm:autoDetect`)**: Integrated dynamic configuration discovery in `CmmDbBridge`. Probes `http://127.0.0.1:5174/api/config` to auto-populate ComfyUI root directories, database paths, and category folder mappings, with automatic fallback to platform-standard filesystem candidate paths.
- **Dedicated Loopback Daemon Endpoints**: Added `/api/sister/wakeup` and `/api/cmm/status` to `SwarmDaemonServer` with timing-safe Bearer token authentication against `daemon.token`.

---

### Security Hardening & Bug Fixes
- **Two-List Blacklist Separation**: Hardened sharing policy engine to strictly separate resolved absolute folder paths (`blacklistDirs`) from keyword patterns (`blacklistFolderNames`), preventing directory selection from inadvertently banning generic tokens.
- **Dialog Containment for Directory Blacklists**: Replaced manual string-based folder addition in the sharing policy IPC handler with privileged native OS dialog picking (`dialog.showOpenDialog`) to prevent arbitrary pattern injection.
- **Fail-Fast Loopback Poke**: Added strict 400ms timeout with silent exception handling for `sendSisterWakeup()` to prevent network timeouts from blocking main process startup.

---

### UI & Layout Improvements
- **Interactive "CMM Offline (Re-ping)" Badge**: Added interactive status badge in the navbar and CMM bridge view allowing users to manually reset the 5-probe budget and re-probe connectivity.
- **Auto-Detect from CMM Button**: Added a one-click auto-detection button in the RenegadeCMM Bridge tab to fetch live paths directly from the running CMM instance.
- **Real-Time Input Synchronization**: Updated `CmmSyncView` to synchronize form input state dynamically when auto-detected paths are discovered.

---

### Seeding Persistence & Transfer Restoration
- **SQLite Transfer State**: Upgraded `swarm_transfers` schema in `cmmDbBridge.ts` to include `file_path`, `manifest_json`, `base_model`, `state`, and `updated_at` columns. Added `saveSwarmTransfer`, `getSwarmTransfers`, and `deleteSwarmTransfer` helpers.
- **Auto-Restore on Launch**: `SwarmEngine.init()` now calls `restorePersistedSwarmTransfers()`, verifying file presence on disk and resuming active or seeding torrents without manual re-packaging.
- **Sidecar Manifest Write**: `registerSeedingManifest` writes the signed `.swarm.json` sidecar alongside the model file and persists the transfer record to SQLite on every new seed.
- **Cleanup on Remove**: `removeTorrent` removes the corresponding SQLite row when a transfer is explicitly stopped.

---

### CMM Bridge Opt-In Status & Seeding Flow
- **Dual-State Opt-In Button**: In `CmmSyncView.tsx`, the button now functions as a status flag — shows `Opt-In ➔` with a pointer to the Package button when not seeding; automatically switches to `Seeding` (green indicator) when active, clicking navigates to the Seeder tab.
- **Non-Blocking Toggle**: `sharing:toggleModelShare` in `ipcHandlers.ts` flips the sharing policy flag synchronously without spawning background packaging loops.
- **Live Badge Sync**: `App.tsx` passes `activeTorrents` and `onNavigateTab` into `CmmSyncView` so button state updates in real-time.

---

### Cross-Platform CMM Database Autodetection
- **Persistent Path Resolution**: `cmmDbBridge.ts` adds `getDefaultPersistentCmmDbPath()` with correct platform-standard paths:
  - **Windows**: `%APPDATA%\RenegadeCMM\renegadecmm.sqlite`
  - **macOS**: `~/Library/Application Support/RenegadeCMM/renegadecmm.sqlite`
  - **Linux**: `~/.config/RenegadeCMM/renegadecmm.sqlite` (respects `$XDG_CONFIG_HOME`)
- **Discovery Priority**: `discoverCmmDbPath()` now checks the persistent locations first before falling back to workspace sibling paths.
- **Hardcoded Path Removal**: Removed Windows development paths from initial React state defaults in `App.tsx` and `CmmSyncView.tsx`.

---

### Tracker Announce Telemetry
- **BEP 15 UDP Logging**: `trackerManager.ts` emits structured `[TRACKER]` events at every stage: socket creation, connect transaction dispatch (`txId`), connect response (`connectionId`), 98-byte announce packet transmission (event type, downloaded/uploaded/left), announce response (seeders, leechers, peer list, interval), and timeouts/errors.
- **BEP 3/48 HTTP Logging**: Logs GET request dispatch with compact params, bencode response decoding, `failReason` extraction, and peer count.
- **Tracker Mesh Sync**: Logs start and completion of sync from `trackers_all.txt` and `blacklist.txt` with active and blacklisted tracker counts.
- **Batch Announce Summary**: Emits per-swarm announce start/complete events recording attempted vs. succeeded tracker count and total discovered peers.
- **Periodic Announce Interval Reduced**: `swarmEngine.ts` reduced announce interval from 300s to 60s for faster telemetry feedback during active development.
- **SWARM Lifecycle Logs**: `swarmEngine.ts` emits `[SWARM]` events on startup broadcast, periodic announce cycles, transfer restoration, and new seed registrations.

---

### Force Re-Announce Action
- **UI Button**: Added a **Force Re-Announce** (`Radio` icon) action button in `DashboardView.tsx`, positioned between the Magnet and Pause/Resume buttons in the Swarm Monitor actions column.
- **Spinner & Confirmation**: Shows an animated spinner during dispatch and a 2.5-second cyan `Re-announce Broadcasted!` confirmation badge on completion.
- **Engine Method**: `swarmEngine.ts` adds `reannounceTorrent(infoHash)`, logging the manual trigger to `debugLogManager` before dispatching to `trackerManager.announceTorrent`.
- **IPC Contract**: `swarm:reannounceTorrent` exposed via `ipcHandlers.ts` and `preload.ts` typed IPC contract.

---

### Developer / Debug Diagnostics Subsystem
- **Android-Style 10-Click Unlock**: Clicking the brand name in `Navbar.tsx` 10 times activates Developer / Debug mode persistently for the session.
- **About & Diagnostics Tab**: `AboutView.tsx` mirrors RenegadeCMM's about layout — Creator/Credits, GPL-3.0 license text, System & Runtime diagnostics, and a real-time Diagnostic Console with severity filters, log search, and Markdown/JSON copy export.
- **Per-Tab Debug Drawers**: `TabDebugDrawer.tsx` embedded across all 6 main tabs with a grabbable top-edge resize handle (`ns-resize`), draggable between 180px and 800px. The terminal section is `flex: 1` to fill the full drawer height.
- **Centralized Log Manager**: `debugLogManager.ts` buffers up to 1,000 structured events in memory and broadcasts live via `debug:logEvent` IPC.

---

### Strict Debug Subsystem Isolation Per Tab
- **Backend Filtering**: `getTabTelemetry(tabId)` in `debugLogManager.ts` strictly scopes returned events to relevant subsystems:
  - `dashboard`: `TRACKER`, `SWARM`
  - `discovery`: `DISCOVERY`, `DHT`
  - `seeder`: `SEEDER`, `MANIFEST`, `PACKAGE`, `HASHING`
  - `cmm`: `CMM`, `SQLITE`, `SYNC`
  - `bandwidth`: `BANDWIDTH`, `QUOTA`, `RATE`, `SOCKET`
  - `settings`: `SECURITY`, `KEYRING`, `CONFIG`
- **Frontend Filtering**: `TabDebugDrawer.tsx` adds `isSubsystemAllowed(subsystem)` to discard unrelated real-time IPC push events before render. Tracker/SWARM logs no longer leak into the packaging tab.
- **Packaging Instrumentation**: `packageJobManager.ts` emits `[SEEDER]` and `[MANIFEST]` events for job initialization, SHA-256 computation, manifest construction, and completion.

---

### P2P Model Discovery Search
- **Local Catalog Sync**: `discoveryEngine.ts` adds `syncActiveSwarms()` to index all active seeding/downloading swarms into the local catalog before each search query.
- **Enhanced Query Matching**: `queryCatalog()` now supports case-insensitive partial matching against title, creator, tags, description, base model, info hash, and SHA-256 sum with normalized model type comparison (`CHECKPOINT`, `LORA`, `GGUF_LLM`, etc.).
- **Live Peer Count Sync**: Matched results receive updated seeder/leecher counts from active transfers and tracker responses.
- **Discovery Logging**: Rich `[DISCOVERY]` debug events for search execution, local/cache hits, BEP 10 peer broadcast, and result sets.
- **Auto-Indexing on Seed**: `swarmEngine.ts` calls `discoveryEngine.indexLocalModel()` during transfer restoration and new package registration so seeds are immediately discoverable.

---

### Swarm Monitor Magnet Link Copy
- **Actions Column Consolidation**: Removed duplicate inline "Copy Magnet" text buttons from the "Model & Payload" cell in `DashboardView.tsx`. Magnet copying is now unified in the dedicated `🧲` icon button in the Actions column.
- **Visual Feedback**: Confirms copy with a green `Magnet Link Copied!` badge and icon swap for 2.5 seconds.

---

### Model Companion & Preview File Placement
- **Co-Located Previews**: `modelMetadataExtractor.ts` saves downloaded preview images alongside the model file (`${baseWithoutExt}.png` / `.preview.png`) instead of `%USERDATA%/.renegadeswarm/previews`, removing permission/sandbox confinement issues.
- **Co-Located Sidecar**: `preDownloadVerifier.ts` writes signed `.swarm.json`, `.info`, and `.sha256` sidecar files in the model directory alongside preview images.

---

## Instructions for Next Version Release

When preparing the official release (e.g., `v0.4.0`):
1. Copy the entries under `## [Unreleased]` into `CHANGELOG.md` under `## [v0.4.0] - YYYY-MM-DD`.
2. Clear the contents under `## [Unreleased] - Active Development Cycle` in this file to reset it for `v0.5.0`.
3. Update version in `package.json` via `node scripts/bump-version.js` and rebuild binaries via `npm run build` / `npm run dist`.
