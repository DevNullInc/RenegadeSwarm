# RenegadeSwarm: Protocol Status & Legal Classification

**Document Purpose**: Clarify the legal and technical status of RenegadeSwarm as protocol-layer software

## 1. Protocol vs. Platform Classification

RenegadeSwarm is **protocol-layer technology**, not a platform, service, or application-layer product.

### 1.1 Technical Architecture

| Layer | Technology | Function | Legal Analogy |
|-------|-----------|----------|---------------|
| **Application** | RenegadeSwarm Desktop | User interface | Web browser |
| **Protocol** | BitTorrent + Swarm Extensions | Content distribution | HTTP, TCP/IP |
| **Network** | Internet, DHT | Packet routing | Internet backbone |

### 1.2 Legal Classification

RenegadeSwarm falls into the same legal category as:

- **BitTorrent protocol** (content-agnostic P2P)
- **Tor network** (privacy-preserving routing)
- **VPN protocols** (encrypted tunnels)
- **HTTP/HTTPS** (content-neutral transport)

### 1.3 What RenegadeSwarm Is NOT

| Category | Example | RenegadeSwarm Status |
|----------|---------|---------------------|
| **Hosting platform** | Hugging Face, CivitAI | ❌ No servers |
| **Social network** | Twitter, Facebook | ❌ No user accounts |
| **Cloud service** | AWS S3, Google Drive | ❌ No centralized storage |
| **Content platform** | YouTube, TikTok | ❌ No editorial control |

## 2. Common Carrier & Mere Conduit Status

### 2.1 17 U.S.C. § 512(a) - Transitory Network Communications

RenegadeSwarm qualifies for DMCA safe harbor under § 512(a):

> "The material is transmitted through the system or network without modification of its content... the material is transmitted through the system or network without intermediate storage"

### 2.2 Common Carrier Doctrine

As a **content-agnostic protocol**, RenegadeSwarm functions as a common carrier:

- **No editorial control**: Does not select or modify content
- **Neutral transmission**: Treats all data equally
- **User-controlled**: Users decide what to transmit
- **Technical necessity**: Provides essential infrastructure function

## 3. Substantial Non-Infringing Uses

### 3.1 Primary Use Cases

1. **Open-source AI model distribution** (Apache 2.0, MIT, OpenRAIL)
2. **Academic research dataset sharing** (public domain, CC0)
3. **Community fine-tune distribution** (user-created LoRAs)
4. **Fault-tolerant model backup** (redundant storage)
5. **Bandwidth-efficient distribution** (reducing CDN costs)

### 3.2 Legal Precedent: *Sony-Betamax*

> "The sale of copying equipment, like the sale of other articles of commerce, does not constitute contributory infringement if the product is widely used for legitimate, unobjectionable purposes." — *Sony Corp. v. Universal City Studios*, 464 U.S. 417 (1984)

## 4. User Responsibility & Liability Chain

```
User (Uploader) → User Content → RenegadeSwarm Protocol → User (Downloader)
       ↑                                              ↑
   LIABLE                                      LIABLE
       ↑                                              ↑
   Controls content                          Controls download
```

**Protocol Layer (RenegadeSwarm)**: No liability — content-agnostic transport only

## 5. Regulatory Compliance

### 5.1 EU Digital Services Act

RenegadeSwarm is **NOT a "hosting provider"** under DSA Article 14 because:
- No storage of user content
- No editorial control
- No algorithmic content ranking

### 5.2 EU AI Act

RenegadeSwarm is **NOT an "AI system"** under EU AI Act because:
- Does not generate AI outputs
- Does not train models (SwarmForge is separate)
- Is a distribution protocol only

## 6. Contact

For legal classification questions: legal@renegadeinc.net
