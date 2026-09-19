# RenegadeSwarm: Model Creator Provenance & Signing Guide

Cryptographic signing establishes immutable proof of authorship for AI and LLM models. By signing your model manifests with Ed25519, you protect your community against poisoned weights, metadata tampering, and creator impersonation.

---

## Why Sign Models?

1. **Authorship Guarantee**: Downloader clients mathematically verify that the model was published with your private key.
2. **Tamper Detection**: Any modification to model weights, preview images, or metadata immediately invalidates the signature.
3. **Verified Creator Badge**: Signed manifests from known keys unlock the **Verified Creator** badge in both RenegadeSwarm and RenegadeCMM.
4. **Metadata-to-Torrent Binding**: The signature covers both the model's SHA256 file hash and the BitTorrent `infoHash`, preventing malicious metadata swapping.

---

## 1. Generating & Managing Your Ed25519 Keypair

### Desktop UI Key Generator (Recommended)
Inside the desktop application:
1. Navigate to **Keyring & Settings → Creator Identity & Signing**.
2. Enter your public handle (e.g. `@anon`) and click **Generate Keypair**.
3. Your 32-byte Ed25519 keypair is created instantly:
   - **Public Key**: Displayed in hex format with a 1-click copy button to paste into your Hugging Face, CivitAI, or GitHub creator profiles.
   - **Private Key**: Protected in the Electron Main process via machine-bound OS hardware encryption (`safeStorage`), never exposed across the renderer IPC or network bridges.

> [!NOTE]
> **Machine-Bound Hardware Encryption & Anti-Spoofing**:
> Key vaults are sealed using local machine fingerprinting and OS hardware credentials (Windows DPAPI, macOS Keychain / Secure Enclave, Linux Secret Service). This machine-binding ensures that private signing keys cannot be cloned or moved to another device to spoof creator identities or inject malicious payloads into the swarm. All hardware fingerprinting remains 100% local and is never transmitted across the network.

> [!IMPORTANT]
> **Anti-Abuse Regeneration Lockout (24-Hour Cooldown)**:
> To prevent malicious actors from cycling disposable identities and evading Web-of-Trust blacklists, key regeneration enforces a **mandatory 24-hour lockout cooldown**. During this cooldown, the desktop UI displays a real-time countdown badge (`Regen Locked (Xh Ym)`).

---

### Programmatic Key Generation (SDK)
You can also generate an Ed25519 keypair directly in TypeScript using the pure protocol module:

```typescript
import { generateEd25519KeyPair } from '../src/protocol/crypto';

// Generates a 32-byte Ed25519 keypair
const { publicKeyHex, privateKeyHex } = generateEd25519KeyPair();

console.log('Public Key (Share this publicly):', publicKeyHex);
console.log('Private Key (KEEP SECRET):       ', privateKeyHex);
```

> [!CAUTION]
> **Never commit or share your private key.** Store it in an offline vault, hardware security key, or encrypted environment variable. Anyone with your private key can sign models in your name.

---

## 2. Building & Signing a Model Manifest

```typescript
import { buildSwarmManifest } from '../src/main/engine/manifestBuilder';
import { signSwarmManifest, verifySwarmManifestSignature } from '../src/protocol/crypto';
import { serializeSwarmManifest } from '../src/protocol/manifest';
import * as fs from 'fs';

async function createAndSignModel() {
  const privateKeyHex = process.env.SWARM_CREATOR_PRIVATE_KEY!;
  const publicKeyHex = process.env.SWARM_CREATOR_PUBLIC_KEY!;

  // Step 1: Build the manifest from your model file
  const manifest = await buildSwarmManifest({
    modelFilePath: 'D:/models/FLUX_1_Dev_Cyberpunk_TheStygianRenegade.safetensors',
    title: 'FLUX.1-Dev Cyberpunk',
    version: '1.0.0',
    modelType: 'LORA',
    baseModel: 'Flux.1 D',
    creator: 'TheStygianRenegade',
    creatorPublicKey: publicKeyHex,
    description: 'High-detail cyberpunk aesthetics for FLUX.1 models.',
    tags: ['flux', 'cyberpunk', 'lora'],
    license: 'MIT',
    urlList: [
      'https://huggingface.co/TheStygianRenegade/flux-cyberpunk/resolve/main/FLUX_1_Dev_Cyberpunk_TheStygianRenegade.safetensors'
    ],
  });

  // Step 2: Cryptographically sign the manifest
  const signature = signSwarmManifest(manifest, privateKeyHex, publicKeyHex);
  manifest.signature = signature;

  // Step 3: Validate signature before publishing
  const isValid = verifySwarmManifestSignature(manifest);
  if (!isValid) {
    throw new Error('Self-verification failed! Check keypair integrity.');
  }

  // Step 4: Write the .swarm manifest file
  const manifestJson = serializeSwarmManifest(manifest);
  fs.writeFileSync('FLUX_1_Dev_Cyberpunk.swarm', manifestJson, 'utf-8');
  console.log('Successfully created and signed FLUX_1_Dev_Cyberpunk.swarm');
}
```

---

## 3. Verifying Manifests on the Client

When a user imports a `.swarm` file or downloads from a magnet link, RenegadeSwarm automatically executes two verification tiers:

```typescript
import { parseSwarmManifest } from '../src/protocol/manifest';
import { verifySwarmManifestSignature } from '../src/protocol/crypto';
import { KeyringManager } from '../src/protocol/keyring';

// 1. Parse and Zod-validate schema
const manifest = parseSwarmManifest(rawJsonString);

// 2. Verify cryptographic signature math
const isSignatureValid = verifySwarmManifestSignature(manifest);

// 3. Check trust level against local Keyring / Web of Trust
const keyring = new KeyringManager();
const trustAssessment = keyring.assessManifestTrust(manifest);

console.log('Trust Level:', trustAssessment.level); // 'VerifiedCreator' | 'Community' | 'Untrusted' | 'Blocked'
console.log('Reason:', trustAssessment.reason);
```

---

## 4. Key Distribution & Web of Trust (WoT)

RenegadeSwarm uses a multi-layered key discovery and trust architecture:

### A. Root Keyring
RenegadeSwarm includes a pre-seeded root public key for the core project creator (`@TheStygianRenegade` / `/dev/null Inc`).

### B. Creator Identity Attestation
Creators publish their 64-character public key on their official profiles:
- In their **Hugging Face** user profile or model card `README.md`.
- In their **CivitAI** creator bio.
- In their **GitHub** account bio or verified commit GPG/SSH keys.

### C. Local Trust Overrides
Users can manage their trusted keys inside the desktop UI under **Settings → Security & Keyring**:
- **Trust Creator**: Manually elevate a public key to `VerifiedCreator`.
- **Block Key**: Block malicious actors or poisoned swarms permanently.
