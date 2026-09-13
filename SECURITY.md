<!--
  RenegadeSwarm - Decentralized AI Model Distribution Network
  Copyright (C) 2026 DevNullInc & The RenegadeSwarm Contributors
  
  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

# Security Policy

The **RenegadeSwarm** maintainers and contributors are committed to ensuring the safety, privacy, and integrity of users across the decentralized AI model distribution network. We take security vulnerabilities seriously and appreciate the efforts of security researchers and community members who practice responsible disclosure.

---

## Supported Versions

We actively provide security patches and updates for the following release branches:

| Version | Supported | Security Patch Window |
| :--- | :---: | :--- |
| **0.2.x (Current / Main)** | ✅ Yes | Active development & critical hotfixes |
| **< 0.2.0** | ❌ No | Deprecated / Unsupported |

---

## Reporting a Vulnerability

If you discover a security vulnerability in RenegadeSwarm, please **do not open a public issue**. Publicly disclosing vulnerabilities puts the entire community at risk before a fix can be staged and deployed.

### Preferred Reporting Channels

1. **GitHub Private Vulnerability Advisory**:  
   Submit a confidential advisory directly via GitHub at [**Security → Advisories → Report a vulnerability**](https://github.com/DevNullInc/RenegadeSwarm/security/advisories/new).
2. **Direct Security Email**:  
   If you prefer encrypted communication or cannot use GitHub Advisories, email the core security team at:  
   [`security@renegadeinc.net`](mailto:security@renegadeinc.net) (or PGP-encrypted to key fingerprint listed in maintainer profiles).

> [!NOTE]
> For standard (non-security) bugs, please open a GitHub issue or email [`bug-report@renegadeinc.net`](mailto:bug-report@renegadeinc.net).  
> For legal inquiries, contact [`legal@renegadeinc.net`](mailto:legal@renegadeinc.net). For general project questions, contact [`contact-us@renegadeinc.net`](mailto:contact-us@renegadeinc.net).

### Information to Include in Your Report

To help us investigate, triage, and patch the issue quickly, please include:
- **Component & File**: Specific file(s), IPC endpoints, protocol structs, or UI views affected.
- **Vulnerability Class & CWE**: (e.g., *CWE-22 Path Traversal*, *CWE-434 Unrestricted File Upload / Polyglot*, *CWE-250 Privilege Escalation*).
- **Impact & Threat Scenario**: What an attacker could achieve (e.g. sandbox breakout, arbitrary file write, unannounced model sharing).
- **Reproduction Steps / PoC**: Minimal, reproducible steps or crafted manifest/buffer payload demonstrating the issue.
- **Estimated Severity**: CVSS v3.1 score and proposed severity (Critical, High, Medium, Low).

---

## Response & Triage Timelines

Our security team adheres to strict SLAs:

| Severity | Initial Response | Triage & Assessment | Target Patch Window |
| :--- | :---: | :---: | :---: |
| **CRITICAL** (e.g. Sandbox escape, RCE, polyglot execution) | < 24 hours | < 48 hours | 72 hours |
| **HIGH** (e.g. Quarantine bypass, path traversal, private file leak) | < 48 hours | < 72 hours | 7 days |
| **MEDIUM** (e.g. DHT rate-limit evasion, non-fatal parsing crash) | < 72 hours | < 5 days | 14 days |
| **LOW** (e.g. Informational leaks, defense-in-depth improvements) | < 5 days | < 7 days | Next sprint / release |

Once a patch is developed and verified, we coordinate a public release along with a GitHub Security Advisory crediting the researcher.

---

## Security Architecture & Trust Boundaries

RenegadeSwarm enforces a **Zero-Trust Defense-in-Depth Architecture** designed around strict isolation:

```
[ Untrusted P2P Network / Web Seeds ]
                 │
                 ▼
[ Pre-Write In-Memory SHA256 Chunk Verification ]
                 │
                 ▼
[ Quarantine Staging (.quarantine/*.part) ]
                 │
                 ▼
[ Multi-Pass Deep Content & Polyglot Validator ]
  ├── Magic Byte Header Checks (SafeTensors, GGUF, ONNX, PyTorch)
  ├── Executable Rejection (Windows PE, Linux ELF, Mach-O, Shebang scripts)
  ├── ZIP Polyglot Defense (PK\x03\x04 Header Detection)
  └── Full-File SHA256 Digest Match
                 │ (Passed)
                 ▼
[ Atomic Promotion to ComfyUI & SQLite ATTACH commit ]
```

### Core Security Controls
1. **Sandboxed Electron Execution**: The renderer operates with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and strict CSP headers.
2. **Typed IPC Contracts**: 100% of IPC channels crossing the main/renderer boundary are runtime-validated with **Zod** schemas.
3. **Strict Opt-In Privacy**: Model sharing defaults to `'opt_in_only'` with `autoSeedDownloads: false`. Automated blacklists block `/private/`, `/drafts/`, `/wip/`, and `private_*` files from public swarms.
4. **Cryptographic Provenance**: Model manifests are signed using **Ed25519** public-key cryptography and pinned to BitTorrent info hashes.
5. **BEP 42 Sybil Hardening**: DHT nodes are validated against IP-derived hashes, and DHT traffic is rate-limited to `< 5 KB/s` to prevent fingerprinting.

---

## Scope & Out-of-Scope Definitions

### In-Scope Vulnerabilities
- Remote Code Execution (RCE) via malicious torrent pieces, manifests, or headers.
- Quarantine isolation bypass or direct write into filesystem outside `.quarantine`.
- Directory traversal attacks escaping designated ComfyUI folders (`../`).
- Polyglot container attacks (e.g. ZIP or executable masquerading as tensor weights).
- Electron context isolation escapes or unauthorized privileged IPC execution.
- Silent or unauthorized seeding of private local files without user opt-in.
- SQL injection or database corruption via SQLite bridge transactions.

### Out-of-Scope
- Denial-of-Service (DoS) attacks targeting public third-party BitTorrent trackers or DHT relays.
- Attacks requiring physical access or local administrator/root compromise of the host machine.
- Social engineering (phishing) attacks against project maintainers or users.
- Issues in untrusted third-party ComfyUI custom nodes downloaded outside of RenegadeSwarm.
- Transport-layer IP visibility inherent to direct P2P BitTorrent connections (users requiring total anonymity should use a VPN/SOCKS5 proxy).

---

## Researcher Safe Harbor

We consider security research conducted under this policy to be **authorized**. We pledge that:
- We will not pursue legal action or initiate law enforcement reports against researchers who:
  - Act in good faith to avoid privacy violations, data destruction, and service interruption.
  - Keep vulnerability details confidential until an agreed-upon public disclosure date.
  - Give us reasonable time to remediate the issue before public disclosure.
- We will provide public attribution in our release notes and Security Advisories for valid, responsibly reported findings (unless anonymity is requested).

---

*Thank you for helping keep RenegadeSwarm and the decentralized AI community secure.*
