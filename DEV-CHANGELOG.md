# RenegadeSwarm - Development Changelog (`DEV-CHANGELOG.md`)

> **Developer Note**: This document serves as the active, rolling changelog for unreleased features, improvements, architectural updates, and bug fixes during active development cycles.
>
> **Lifecycle Policy**:
> 1. All incremental changes, fixes, and features are logged here in real-time under **Unreleased (Active Cycle)**.
> 2. When creating a new official version release/build (e.g., `v0.4.0`), the contents of this file are promoted into the permanent `CHANGELOG.md` / Release Notes, and this file is reset/cleared for the next cycle.

---

## [Unreleased] - Active Development Cycle (Target: v0.4.0)

### Major Features & Architectural Additions
- *Active cycle initialized following v0.3.0 release.*

---

### Security Hardening & Bug Fixes
- *No unreleased fixes logged yet.*

---

### UI & Layout Improvements
- *No unreleased UI changes logged yet.*

---

## Instructions for Next Version Release

When preparing the official release (e.g., `v0.4.0`):
1. Copy the entries under `## [Unreleased]` into `CHANGELOG.md` under `## [v0.4.0] - YYYY-MM-DD`.
2. Clear the contents under `## [Unreleased] - Active Development Cycle` in this file to reset it for `v0.5.0`.
3. Update version in `package.json` via `node scripts/bump-version.js` and rebuild binaries via `npm run build` / `npm run dist`.
