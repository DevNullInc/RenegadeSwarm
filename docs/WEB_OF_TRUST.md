# RenegadeSwarm: Web of Trust & Key Distribution Guide

RenegadeSwarm uses a decentralized **Web of Trust (WoT)** and **Trust-On-First-Use (TOFU)** model to authenticate model creators, prevent author impersonation, and detect compromised weights without relying on centralized certificate authorities.

---

## 🏛️ Trust Level Tiers

Every downloaded or seeded model manifest is evaluated against the local keyring:

| Trust Tier | Visual Badge | Meaning & Behavior |
|---|---|---|
| **Verified Creator** | 🟢 `[Verified]` | The model is cryptographically signed by an official root key or a creator explicitly pinned in your trusted keyring. |
| **Community** | 🟡 `[Community]` | The signature is mathematically valid, but the public key has not been explicitly pinned by you yet (TOFU tier). |
| **Untrusted** | ⚪ `[Untrusted]` | The model manifest has no cryptographic signature or contains signature verification errors. |
| **Blocked** | 🔴 `[Blocked]` | The creator's public key has been explicitly blacklisted in your keyring. Downloads from this key are halted immediately. |

---

## 🔑 How Users Populate Their Trusted Creator List

Users have four simple ways to discover, add, and manage creator public keys:

### 1. Default Root Creators (Pre-Seeded)
RenegadeSwarm ships with built-in root public keys for the core project maintainers:
* **TheStygianRenegade** (`70fb7e8a57bbec5ffba1d16e317fb915ddeead2a5f3d8853ffb21759155936b7`)
* **DevNullInc** (`af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262`)

### 2. Manual Pinning via Desktop UI
1. Navigate to **Keyring & Settings → Web of Trust**.
2. Click **Add Trusted Creator**.
3. Enter the Creator Name (e.g. `Anon`) and their 64-character Ed25519 public key.
4. Set the trust level to **Verified Creator** (Green), **Community** (Amber), or **Blocked** (Red).

### 3. Identity Attestation (Out-of-Band Verification)
Model creators publish their 64-character public key on their verified web profiles:
* In their **Hugging Face** user profile or repository model cards.
* In their **CivitAI** creator bio.
* In their **GitHub** profile bio or signed release commits.

When you download a `.swarm` manifest from a creator for the first time, RenegadeSwarm displays their public key and offers a **"Verify & Trust Creator"** button to cross-check and pin it in one click.

### 4. Importing & Exporting Key Bundles
Communities can curate and share trusted creator lists in JSON format:

```json
[
  {
    "creatorName": "TheStygianRenegade",
    "publicKeyHex": "70fb7e8a57bbec5ffba1d16e317fb915ddeead2a5f3d8853ffb21759155936b7",
    "trustLevel": "VerifiedCreator",
    "notes": "Official RenegadeSwarm root key"
  }
]
```

To import a bundle, click **Import Keyring JSON** inside **Keyring & Settings → Web of Trust**.

### 5. Anti-Abuse Lockouts & Identity Binding
RenegadeSwarm prevents bad actors who have been blocked by the community from rapidly cycling new public keys on the same client. A mandatory 24-hour regeneration lockout prevents rapid identity churning and reinforces durable accountability.

---

## 💻 Programmatic Keyring Management

For CLI tools and automated workers:

```typescript
import { KeyringEngine, KeyringEntry } from './src/protocol/keyring';

const keyring = new KeyringEngine();

// Add a trusted creator
keyring.addEntry({
  creatorName: 'LyKON',
  publicKeyHex: '4a5c88b2e118b6284f18b3ec48866164287d3d2ae3b0c44298fc1c149afbf4c8',
  trustLevel: 'VerifiedCreator',
  addedAt: Date.now(),
  notes: 'SDXL & DreamShaper author',
});

// Verify trust level of an incoming model manifest
const result = keyring.verifyCreatorKey('LyKON', manifest.model.creatorPublicKey);
console.log('Creator Trust Status:', result.trustLevel); // 'VerifiedCreator'
```
