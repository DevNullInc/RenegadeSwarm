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

## Instructions for Next Version Release

When preparing the official release (e.g., `v0.4.0`):
1. Copy the entries under `## [Unreleased]` into `CHANGELOG.md` under `## [v0.4.0] - YYYY-MM-DD`.
2. Clear the contents under `## [Unreleased] - Active Development Cycle` in this file to reset it for `v0.5.0`.
3. Update version in `package.json` via `node scripts/bump-version.js` and rebuild binaries via `npm run build` / `npm run dist`.
