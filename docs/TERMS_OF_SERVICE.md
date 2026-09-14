# RenegadeSwarm Search: Terms of Use

**Effective Date**: September 12, 2026  
**Last Updated**: September 12, 2026  
**Applicable to**: https://swarm.renegadeinc.net  
**Operator**: DevNullInc, Portland, Oregon  

---

## 1. Service Description

RenegadeSwarm Search is an **automated indexing service** operated from Portland, Oregon that reads publicly available BitTorrent DHT data and displays AI model metadata with anonymized swarm statistics.

**Technical Scope:**
- **Indexed Content**: Magnet links for AI/ML model files only (SafeTensors, GGUF, ONNX, PyTorch checkpoints, LoRAs, VAEs, Text Encoders, UNet weights)
- **Content Validation**: Strict technical filtering via magic-byte inspection; non-AI/ML file types are automatically rejected
- **Anonymized Statistics**: Aggregate swarm health metrics with no IP logging or peer identification
- **Protocol Bridge**: `renegadeswarm://` URI scheme to launch the desktop application

**What We Do NOT Do:**
- Host, store, or transmit model files
- Exercise subjective editorial review over copyright status, licensing disputes, or creator disputes
- Log search queries or user activity

---

## 2. Content Filtering & Technical Limitations

### 2.1 Automatic Technical Rejection (Enforced)
Our systems **automatically and mandatorily** reject and exclude content that fails technical validation:

| Filter Type | Enforcement | Rationale |
|-------------|-------------|-----------|
| **File Type Validation** | Required | Only AI/ML model formats (SafeTensors, GGUF, ONNX, etc.) are indexed; executables, archives, media files, and documents are rejected |
| **Magic-Byte Inspection** | Required | Deep header validation to prevent polyglot attacks and masqueraded malware |
| **Executable Blocking** | Required | Automatic rejection of PE, ELF, Mach-O, scripts, and ZIP headers |
| **Web of Trust Blacklist** | Required | Cryptographic identities (Ed25519 public keys) proven to distribute malware or violate the Software's security are blocked |

### 2.2 No Editorial or Copyright Filtering (Policy)
**We do not filter, remove, or delist content based on:**
- Copyright ownership disputes
- Licensing violations (commercial vs. non-commercial use)
- Creator requests (except verified security threats)
- Moral objections, NSFW status (except where legally required), or subjective quality assessments

**This is a technical policy, not a legal determination.** We are not equipped to adjudicate copyright claims, license compliance, or ownership disputes.

---

## 3. Nature of Indexed Content

### 3.1 Automated DHT Indexing
All search results are **automatically generated** via DHT crawling. No human reviews, approves, or selects indexed entries before they appear in search results.

### 3.2 Immutable DHT Propagation
You acknowledge that:
- Magnet links represent **public cryptographic hashes** (InfoHashes) broadcast to the decentralized DHT
- Once published to the DHT, information propagates across thousands of independent nodes
- Removing content from our index does not remove it from the DHT, BitTorrent swarms, or peers' computers

---

## 4. Copyright & Content Removal Policy

### 4.1 No General Copyright Takedown Process
**RenegadeSwarm Search does not operate a copyright takedown system.** We do not remove, delist, or block magnet links based on:

- Allegations of copyright infringement
- Licensing disputes
- Claims of unauthorized distribution
- Creator "right to be forgotten" requests
- DMCA notices (except as required by specific court order)

### 4.2 Why We Cannot Address Copyright Claims
1. **Technical Neutrality**: We maintain technical filters only (Section 2.1). Adding copyright-based filtering would require subjective legal adjudication we are not equipped to perform.
2. **DHT Persistence**: Even if we removed a link from our index, the content would remain accessible via DHT, other trackers, and direct peer sharing.
3. **Decentralized Nature**: We do not host, seed, or control the actual file distribution — we only display metadata already public on the DHT.

### 4.3 Proper Channels for Rights Holders
Copyright owners seeking enforcement should direct actions to entities with actual control:

| Issue | Proper Channel |
|-------|----------------|
| **Unauthorized distribution** | Contact the ISP of the IP address actively seeding the file |
| **Original platform hosting** | File complaints with CivitAI, Hugging Face, or original host |
| **Legal action** | Pursue claims against individual uploaders in their jurisdiction |
| **Court orders** | Valid court orders from courts with jurisdiction over our operations will be complied with |

### 4.4 Security-Based Removal (Only Grounds for Removal)
We **will** remove or block content from our index **exclusively** for:

- **Malware distribution**: Files cryptographically proven to contain executable payloads, trojans, or malicious code (via our content validation pipeline)
- **Security threats**: Creators (Ed25519 keys) proven to engage in swarm poisoning, piece corruption, or attacks on the network
- **Legal compulsion**: Valid court orders from courts with jurisdiction over our operations

---

## 5. Protocol Handler & Third-Party Software

Clicking `renegadeswarm://` links launches the RenegadeSwarm desktop application (GPL-3.0 licensed). You acknowledge:

- This website does not perform downloads or file transfers
- All P2P activity occurs via the desktop application outside our control
- We are not responsible for content obtained via the decentralized network
- The desktop application is subject to its own license terms

---

## 6. Disclaimers

**NO WARRANTY**: This Service is provided "as is" without warranties of any kind.

**SEARCH ENGINE NEUTRALITY**: This Service operates similarly to a search engine — we index and display publicly available information without endorsing, verifying, or vouching for its accuracy, safety, or legality.

**THIRD-PARTY CONTENT**: All indexed content originates from unaffiliated third parties. We make no representations about copyright status, licensing, or compliance with terms of service of original model platforms.

**LIMITED CONTROL**: While we maintain technical filters for security (Section 2.1), we do not control the decentralized P2P network and cannot prevent distribution of any content via DHT, direct peer connections, or other means.

---

## 7. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY LAW:

- We shall not be liable for any damages arising from use of this Service
- We are not liable for content downloaded via the P2P network
- We are not liable for copyright infringement by third parties
- We are not liable for errors or omissions in DHT-derived data
- Our total liability shall not exceed $100 USD

---

## 8. Governing Law & Jurisdiction

### 8.1 Governing Law
These Terms shall be governed by and construed in accordance with the laws of the **State of Oregon**, United States, without regard to its conflict of law principles.

### 8.2 Jurisdiction & Venue
Any legal action or proceeding arising out of or relating to these Terms or the Service shall be brought exclusively in the **state or federal courts located in Multnomah County, Oregon**. You consent to the personal jurisdiction and venue of these courts.

### 8.3 Class Action Waiver
You agree that any proceedings will be conducted only on an individual basis and not as a class action, consolidated action, or representative action.

---

## 9. Changes to Terms

We may update these Terms at any time. Changes will be posted to this page with an updated date. Continued use constitutes acceptance.

---

## 10. Contact & Legal Agent

**DevNullInc**  
Portland, Oregon  
Multnomah County, USA

| Purpose | Contact |
|---------|---------|
| **Legal, DMCA & Compliance** | [`legal@renegadeinc.net`](mailto:legal@renegadeinc.net) |
| **Privacy & Data Protection** | [`privacy@renegadeinc.net`](mailto:privacy@renegadeinc.net) |
| **Security Vulnerabilities** | [`security@renegadeinc.net`](mailto:security@renegadeinc.net) |
| **Project Repository** | [github.com/DevNullInc/RenegadeSwarm](https://github.com/DevNullInc/RenegadeSwarm) |

**Designated Agent for Copyright Matters** (DMCA Agent):  
Email: [`legal@renegadeinc.net`](mailto:legal@renegadeinc.net)  
Physical Address: Available upon formal legal request

---

**BY USING SWARM.RENEGADEINC.NET, YOU ACKNOWLEDGE THAT THIS SERVICE OPERATES AS A TECHNICAL INDEX ONLY AND DOES NOT ADJUDICATE COPYRIGHT OR LICENSING DISPUTES.**

---
