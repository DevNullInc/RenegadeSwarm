/**
 * RenegadeSwarm - Crypto, Ed25519 Provenance Signatures & Piece Verification
 */
import crypto from 'crypto';
import { SwarmManifest, SwarmSignature } from './types';

export interface Ed25519KeyPair {
  publicKeyHex: string;
  privateKeyHex: string;
}

/**
 * Generates an Ed25519 keypair for model provenance and manifest signing.
 */
export function generateEd25519KeyPair(): Ed25519KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });

  // Extract raw 32-byte public key (last 32 bytes of SPKI DER header)
  const rawPubKey = publicKey.subarray(publicKey.length - 32);
  // Extract raw 32-byte private key (last 32 bytes of PKCS8 DER header)
  const rawPrivKey = privateKey.subarray(privateKey.length - 32);

  return {
    publicKeyHex: rawPubKey.toString('hex'),
    privateKeyHex: rawPrivKey.toString('hex'),
  };
}

/**
 * Computes deterministic SHA256 digest over the manifest's core metadata and info_hash.
 */
export function computeManifestSigningDigest(manifest: Omit<SwarmManifest, 'signature'>): string {
  const payload = [
    manifest.swarmSpecVersion,
    manifest.manifestId,
    manifest.createdAt,
    manifest.totalSizeBytes,
    manifest.model.title,
    manifest.model.modelType,
    manifest.model.creator || '',
    manifest.hashes.sha256,
    manifest.hashes.infoHash,
    manifest.files.map((f) => `${f.relativePath}:${f.sizeBytes}:${f.sha256 || ''}`).join('|'),
  ].join('::');

  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Signs a SwarmManifest using an Ed25519 private key.
 */
export function signSwarmManifest(
  manifest: Omit<SwarmManifest, 'signature'>,
  privateKeyHex: string,
  publicKeyHex: string
): SwarmSignature {
  const digestHex = computeManifestSigningDigest(manifest);
  const digestBuffer = Buffer.from(digestHex, 'hex');

  // Construct PKCS8 DER wrapper for raw 32-byte Ed25519 private seed
  // Standard prefix: 302e020100300506032b657004220420
  const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  const privateKeyDer = Buffer.concat([pkcs8Prefix, Buffer.from(privateKeyHex, 'hex')]);

  const privateKey = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8',
  });

  const signature = crypto.sign(null, digestBuffer, privateKey);

  return {
    algorithm: 'ed25519',
    publicKey: publicKeyHex,
    signature: signature.toString('hex'),
    signedPayloadHash: digestHex,
  };
}

/**
 * Verifies an Ed25519 signature on a SwarmManifest.
 */
export function verifySwarmManifestSignature(manifest: SwarmManifest): boolean {
  if (!manifest.signature) return false;

  try {
    const { publicKey: pubKeyHex, signature: sigHex, signedPayloadHash } = manifest.signature;

    // Verify payload digest matches actual manifest contents
    const expectedDigest = computeManifestSigningDigest(manifest);
    if (signedPayloadHash.toLowerCase() !== expectedDigest.toLowerCase()) {
      return false;
    }

    // Construct SPKI DER wrapper for raw 32-byte Ed25519 public key
    // Standard prefix: 302a300506032b6570032100
    const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const publicKeyDer = Buffer.concat([spkiPrefix, Buffer.from(pubKeyHex, 'hex')]);

    const publicKey = crypto.createPublicKey({
      key: publicKeyDer,
      format: 'der',
      type: 'spki',
    });

    const digestBuffer = Buffer.from(signedPayloadHash, 'hex');
    const signatureBuffer = Buffer.from(sigHex, 'hex');

    return crypto.verify(null, digestBuffer, publicKey, signatureBuffer);
  } catch {
    return false;
  }
}

export function verifyPieceSha256(
  pieceBuffer: Uint8Array,
  expectedSha256Hex: string,
  hashFn: (buf: Uint8Array) => string
): boolean {
  const actualHash = hashFn(pieceBuffer).toLowerCase();
  return actualHash === expectedSha256Hex.toLowerCase();
}

export function calculateOptimalPieceLength(totalSizeBytes: number): number {
  if (totalSizeBytes > 30 * 1024 * 1024 * 1024) return 32 * 1024 * 1024; // 32MB
  if (totalSizeBytes > 10 * 1024 * 1024 * 1024) return 16 * 1024 * 1024; // 16MB
  if (totalSizeBytes > 2 * 1024 * 1024 * 1024) return 8 * 1024 * 1024;   // 8MB
  if (totalSizeBytes > 500 * 1024 * 1024) return 4 * 1024 * 1024;        // 4MB
  return 2 * 1024 * 1024;                                                // 2MB
}
