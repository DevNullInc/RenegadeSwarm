# RenegadeSwarm: Privacy Policy & Data Handling Specification

**Effective Date**: September 12, 2026  
**Last Updated**: September 12, 2026  
**Applicable Software**: RenegadeSwarm Desktop Application & Protocol Engine  
**License**: GNU General Public License v3.0 (GPL-3.0-or-later)  

---

## 1. Executive Summary & Privacy-First Manifesto

**RenegadeSwarm** is engineered from the ground up on the principles of **Data Minimization, Self-Sovereignty, and Zero-Telemetry Local-First Architecture**.

* **Zero Centralized Telemetry**: The developers, maintainers, and contributors of RenegadeSwarm **do not collect, harvest, monetize, transmit, or store** your personal identity, search queries, model download history, prompt notes, or application usage metrics.
* **No Central Account System**: You do not register with, authenticate through, or submit credentials to any central RenegadeSwarm server.
* **Local-First Data Governance**: All application configuration, transfer queues, cryptographic keypairs, and model metadata remain stored solely and exclusively on your local endpoint.

This Privacy Policy explains how data is handled locally on your machine, how technical metadata is processed across the peer-to-peer (P2P) network, and what interactions occur with external public registries.

---

## 2. Information We Do NOT Collect

To provide total clarity under global data protection regulations (including the EU General Data Protection Regulation **GDPR**, California Consumer Privacy Act / California Privacy Rights Act **CCPA/CPRA**, and Brazil's **LGPD**), the core software **never** collects or transmits the following to RenegadeSwarm maintainers:

| Data Category | Collection Status | Explanation |
|---|---|---|
| **Personal Identifiers** (Name, Email, Physical Address, Phone) | ❌ **NEVER COLLECTED** | No registration required; zero personal profiles created. |
| **Telemetry & Usage Analytics** | ❌ **NEVER COLLECTED** | No background telemetry, crash beacons, or user tracking services. |
| **Model Content & Weight Files** | ❌ **NEVER COLLECTED** | No models, checkpoints, or LoRAs are routed through central servers. |
| **Prompts, Descriptions & Notes** | ❌ **NEVER COLLECTED** | Model generation notes remain local unless explicitly packaged in a public torrent. |
| **Payment or Financial Data** | ❌ **NEVER COLLECTED** | RenegadeSwarm is free and open-source software (FOSS). |

---

## 3. P2P Network Communication & Technical Data Realities

Because RenegadeSwarm operates over decentralized BitTorrent mesh networks, public BitTorrent trackers, and the Mainline Distributed Hash Table (DHT), certain technical disclosures are inherent to the operation of peer-to-peer protocols:

### A. IP Address Broadcast to Swarm Peers
* **Technical Operation**: When you initiate a download or act as a seeder for a specific model InfoHash, your Internet Protocol (IP) address and listening port (default: `6881`) are transmitted to other connected swarm peers, public BitTorrent trackers, and DHT nodes.
* **Purpose**: This transmission is a technical necessity of standard TCP/UDP socket routing to establish direct, peer-to-peer piece block exchanges without an intermediary proxy.
* **Public Visibility**: Any third party participating in the same public torrent swarm or querying the public DHT can technically observe the IP addresses of participating peers.
* **Mitigation / VPNs**: Users seeking IP-level confidentiality are encouraged to operate RenegadeSwarm behind a trusted Virtual Private Network (VPN) or SOCKS5 proxy configured for P2P traffic.

### B. Distributed Hash Table (DHT) & Mainline Kademlia
* RenegadeSwarm implements **BEP 42** cryptographic node verification and query rate-limiting (<5 KB/s idle bandwidth).
* DHT lookups are strictly **pinned** to active swarms you are currently downloading or seeding; the application does not crawl or index arbitrary swarms across the wider DHT network.

---

## 4. Local Data Storage & Security Controls

All data created or processed by RenegadeSwarm is stored locally within your user profile directory and workspace:

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         LOCAL ENDPOINT STORAGE BOUNDARIES                        │
├──────────────────────────────────────────────────────────────────────────────────┤
│ • renegadeswarm.sqlite                Local SQLite database (transfers & state) │
│ • .renegadeswarm_security/            Machine-bound encrypted cryptographic store│
│   ├── identity.vault                  AES-256-GCM encrypted Ed25519 private key │
│   └── keyring.json                    Local Web of Trust trusted public keys     │
│ • ~/.renegadeswarm/previews/          Cached SFW thumbnail images               │
│ • .quarantine/                        Isolated temporary chunks (.part files)    │
│ • D:/gitprojects/RenegadeCMM/         Local RenegadeCMM database (via ATTACH)   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### A. Machine-Bound Cryptographic Key Vault
* Private Ed25519 signing keys are encrypted at rest using **AES-256-GCM** derived from machine-and-user entropy.
* Plaintext private keys are never stored on disk or transmitted over the network.
* An anti-abuse rate-limiter (15-minute regeneration lockout) is maintained locally to prevent disposable identity cycling.

### B. Local SQLite Database
* `renegadeswarm.sqlite` stores active transfer statuses, custom model folder paths, bandwidth allocations, and local sharing permissions.
* The application communicates with your local RenegadeCMM database (`renegadecmm.sqlite`) through direct local SQLite `ATTACH DATABASE` operations, with zero cloud relays.

---

## 5. Opt-In Model Sharing & Privacy Protection Rules

RenegadeSwarm enforces a strict **Opt-In by Default Sharing Policy** (`src/protocol/sharingPolicy.ts`) to prevent unintentional exposure of private or proprietary models:

1. **Strict Opt-In Enforcement**: Local models discovered in your ComfyUI or CMM folders are marked as **Private / Unshared** by default. They are never announced or seeded to the P2P swarm unless you explicitly click *Opt-In* or *Package & Seed*.
2. **Path & Prefix Exclusion Blacklists**:
   - Any folder matching blacklisted patterns (e.g. `/private/`, `/internal/`, `/wip/`, `/confidential/`) is automatically blocked from network exposure.
   - Any model file starting with excluded prefixes (e.g. `private_`, `draft_`, `temp_`, `.` ) is suppressed from swarm discovery.
3. **NSFW Sharing Policy Filter**:
   - When `allowNsfwSharing` is `false` (default), NSFW-flagged models and adult preview images are prevented from automatic packaging and network retrieval.

---

## 6. Third-Party Online Registry Interactions (CivitAI & Hugging Face)

When packaging models in the Seeder or inspecting local models, RenegadeSwarm provides optional online metadata auto-population:

1. **CivitAI API Lookups**:
   - For diffusion/image models, the application queries `https://civitai.com/api/v1/model-versions/by-hash/:hash` via HTTPS.
   - **Data Transmitted**: The SHA256 file hash and client User-Agent header (`RenegadeSwarm/0.1.0`).
   - **Data Received**: Model title, creator username, tags, base model, description, and preview image URLs.
   - **LLM Exemption**: Large Language Models (`.gguf`, Llama, Mistral, Qwen, DeepSeek) are detected automatically and skip CivitAI lookups.
   - **HTML Sterilization**: All incoming text is sanitized and stripped of executable tags and HTML entities (`sanitizeAndDecodeHtml`) before rendering.
2. **Third-Party Privacy Policies**:
   - Queries to external registries are governed by their respective privacy terms:
     - [CivitAI Privacy Policy](https://civitai.com/privacy)
     - [Hugging Face Privacy Policy](https://huggingface.co/privacy)

---

## 7. Global Privacy Rights & User Self-Sovereignty

Because RenegadeSwarm does not maintain central servers or collect user data, your statutory data rights are **100% self-executable** directly on your local computer:

| Statutory Right | Legal Basis (GDPR / CCPA) | How It Is Exercised in RenegadeSwarm |
|---|---|---|
| **Right to Access** | GDPR Art. 15 / CCPA § 1798.100 | All your data is visible in the UI and stored in open SQLite and JSON files on your disk. |
| **Right to Rectification** | GDPR Art. 16 | Edit model titles, tags, descriptions, and identities directly in the app. |
| **Right to Erasure ("To Be Forgotten")** | GDPR Art. 17 / CCPA § 1798.105 | Delete the application data folder (`~/.renegadeswarm`, `.renegadeswarm_security/`, and `renegadeswarm.sqlite`). |
| **Right to Data Portability** | GDPR Art. 20 | Export your Web of Trust Keyring and settings at any time via standard JSON. |
| **Right to Restrict / Object** | GDPR Art. 18, 21 / CCPA Opt-Out | Set sharing policies to private, opt-out of seeding individual models, or run offline. |

---

## 8. Children's Privacy (COPPA & GDPR-K Compliance)

RenegadeSwarm is intended for machine learning developers, researchers, and AI generative artists. The software is not structured or directed to children under the age of 13 (in the United States under **COPPA**) or under the age of 16 (in the European Union under **GDPR Article 8**). Because no personal data is collected or stored on central servers, no children's personal data is ever knowingly acquired or processed.

---

## 9. Changes to This Privacy Policy

As an open-source project, any modifications to this Privacy Policy will be published directly to the project repository. Substantive updates will be documented in the [**Development Changelog (`DEV-CHANGELOG.md`)**](../DEV-CHANGELOG.md) and release notes.

---

## 10. Data Protection & Privacy Contact

If you have questions regarding this Privacy Policy, data protection practices, or cryptographic privacy controls, please contact the project data protection and legal maintainers:

* **Privacy & Data Protection Inquiries**: [`privacy@renegadeinc.net`](mailto:privacy@renegadeinc.net)
* **Legal & Compliance Matters**: [`legal@renegadeinc.net`](mailto:legal@renegadeinc.net)
* **Security Vulnerabilities**: [`security@renegadeinc.net`](mailto:security@renegadeinc.net)
* **Project Repository**: [https://github.com/DevNullInc/RenegadeSwarm](https://github.com/DevNullInc/RenegadeSwarm)
