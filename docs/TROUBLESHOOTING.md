# RenegadeSwarm: Troubleshooting & Operations Guide

This guide provides actionable solutions for common network, storage, verification, and RenegadeCMM integration issues.

---

## 🌐 1. Network & Swarm Connectivity

### Symptom: 0 Connected Peers on Active Models
- **Potential Causes**:
  - Closed incoming BitTorrent port (TCP/UDP `6881`).
  - Strict NAT or Carrier-Grade NAT (CGNAT) without port forwarding.
  - Tracker timeouts on restricted networks.
- **Resolution Steps**:
  1. **Check Router UPnP**: Ensure UPnP or NAT-PMP is enabled in your router settings.
  2. **Manual Port Forwarding**: Forward external port `6881` (both TCP and UDP) to your local IP. You can configure custom port bindings in the **Network & Quotas** tab.
  3. **Verify Web Seeds**: Check if the model has Web Seeds enabled. If so, RenegadeSwarm automatically downloads directly from HTTP/HTTPS endpoints (e.g. Hugging Face) while simultaneously broadcasting your piece availability to the P2P swarm.
  4. **WebRTC Fallback**: For environments blocking UDP, ensure WebSocket trackers (`wss://tracker.webtorrent.dev`) are enabled in the manifest `announceList`.

---

## 🛡️ 2. Quarantine & Content Validation Failures

### Symptom: Transfer Status Shows "Quarantine" or "Rejected"
RenegadeSwarm uses a strict multi-pass validation gate before any file is promoted into your ComfyUI models directory.

| Rejection Code / Reason | Cause | Action Required |
|---|---|---|
| `SHA256 Mismatch` | Downloaded file digest does not match manifest `hashes.sha256`. | The download was corrupted or modified in transit. Delete the download and retry from verified peers. |
| `Forbidden Executable Signature` | Payload contains Windows PE (`MZ`), Linux ELF (`\x7fELF`), or Mach-O executable binaries. | **Malicious payload detected.** Do not run this file. RenegadeSwarm has safely quarantined it. |
| `ZIP/Polyglot Exploit Detected` | File starts with `PK\x03\x04` or hides an archive header inside a `.safetensors` file. | File rejected to prevent archive bomb or polyglot code execution. |
| `Truncated SafeTensors Header` | Header size exceeds file length or JSON header is incomplete. | File download is incomplete or damaged. Resume transfer or re-check seed sources. |
| `Invalid CMM Canonical Name` | Filename does not adhere to `model_author.extension` format. | The manifest author did not format canonical names correctly. Rename manually or use RenegadeCMM auto-format. |

---

## 💾 3. RenegadeCMM Bridge Integration

### Symptom: "CMM Bridge Offline" or Database Locked
- **Potential Causes**:
  - `renegadecmm.sqlite` path is incorrect.
  - Another process has acquired an exclusive SQLite write lock outside WAL mode.
- **Resolution Steps**:
  1. **Configure Path**: Open the **RenegadeCMM Bridge** tab and confirm the absolute path to your `renegadecmm.sqlite` database.
  2. **Check SQLite WAL Mode**: Ensure RenegadeCMM is configured with `PRAGMA journal_mode = WAL;`. WAL mode allows concurrent reads and writes across both applications without blocking.
  3. **File Permissions**: Verify that the user account running RenegadeSwarm has read/write permissions to the `.sqlite`, `.sqlite-wal`, and `.sqlite-shm` files.

---

## ⚖️ 4. Seeding Quotas & Bandwidth Governance

### Symptom: Seeding Halts Automatically
- **Expected Behavior**: When **Auto-halt at ratio cap** (e.g. `2.0x`) is enabled in **Network & Quotas**, RenegadeSwarm stops uploading once your total uploaded bytes equal twice the download size.
- **Adjusting Quota**:
  - Navigate to **Network & Quotas**.
  - Adjust the **Target Seeding Ratio** (e.g., `1.0x`, `2.0x`, or `Unlimited`).
  - Toggle **Background Tray Seeding** to continue seeding while the main window is closed.

---

## 📊 5. Extracting Diagnostic Logs

If you encounter unexpected errors:
1. Press `Ctrl + Shift + I` (or `Cmd + Option + I` on macOS) to open the DevTools console.
2. Check the Electron main process logs in your platform data directory:
   - **Windows**: `%APPDATA%\renegade-swarm\logs\`
   - **Linux**: `~/.config/renegade-swarm/logs/`
   - **macOS**: `~/Library/Application Support/renegade-swarm/logs/`
