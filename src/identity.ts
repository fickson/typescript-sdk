import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { join, resolve } from "path";
import nacl from "tweetnacl";
import { SekuireCrypto } from "./crypto";

export class AgentIdentity {
  constructor(
    public readonly name: string,
    public readonly sekuireId: string,
    private readonly privateKey?: string,
    public readonly publicKey?: string,
  ) {}

  static async load(manifestPath = "sekuire.json"): Promise<AgentIdentity> {
    // 1. Resolve Manifest
    const path = resolve(process.cwd(), manifestPath);
    if (!existsSync(path)) {
      // Check env vars as fallback
      if (process.env.SEKUIRE_AGENT_NAME) {
        return new AgentIdentity(
          process.env.SEKUIRE_AGENT_NAME,
          process.env.SEKUIRE_AGENT_ID || "unknown",
          process.env.SEKUIRE_PRIVATE_KEY,
          process.env.SEKUIRE_PUBLIC_KEY,
        );
      }
      throw new Error(`Manifest not found at ${path}`);
    }

    const content = await readFile(path, "utf-8");
    const manifest = JSON.parse(content);

    // 2. Load Keys
    let privateKey = process.env.SEKUIRE_PRIVATE_KEY;
    let publicKey = process.env.SEKUIRE_PUBLIC_KEY;

    if (!privateKey) {
      const keyPath = join(resolve(path, ".."), ".sekuire", "secret.key");
      if (existsSync(keyPath)) {
        privateKey = (await readFile(keyPath, "utf-8")).trim();
      }
    }

    // Derive public key from private key if not provided
    if (privateKey && !publicKey) {
      const privateKeyBytes = SekuireCrypto.hexToBytes(privateKey);
      // tweetnacl expects a 64-byte secret key (seed + public key)
      // or we generate a keypair from 32-byte seed
      if (privateKeyBytes.length === 32) {
        const keyPair = nacl.sign.keyPair.fromSeed(privateKeyBytes);
        publicKey = SekuireCrypto.bytesToHex(keyPair.publicKey);
      } else if (privateKeyBytes.length === 64) {
        // Full secret key includes public key in last 32 bytes
        publicKey = SekuireCrypto.bytesToHex(privateKeyBytes.slice(32));
      }
    }

    return new AgentIdentity(
      manifest.name || "Unknown",
      manifest.sekuire_id || process.env.SEKUIRE_AGENT_ID || "unknown",
      privateKey,
      publicKey,
    );
  }

  /**
   * Sign a message using Ed25519
   * @param message The message string to sign
   * @returns Hex-encoded signature
   */
  async sign(message: string): Promise<string> {
    if (!this.privateKey) {
      throw new Error("No private key available for signing");
    }

    const privateKeyBytes = SekuireCrypto.hexToBytes(this.privateKey);
    const messageBytes = new TextEncoder().encode(message);

    let secretKey: Uint8Array;

    if (privateKeyBytes.length === 32) {
      // 32-byte seed - derive full keypair
      const keyPair = nacl.sign.keyPair.fromSeed(privateKeyBytes);
      secretKey = keyPair.secretKey;
    } else if (privateKeyBytes.length === 64) {
      // Full 64-byte secret key
      secretKey = privateKeyBytes;
    } else {
      throw new Error(
        `Invalid private key length: ${privateKeyBytes.length}. Expected 32 or 64 bytes.`
      );
    }

    // Sign the message (returns signature + message, we extract just signature)
    const signedMessage = nacl.sign(messageBytes, secretKey);
    const signature = signedMessage.slice(0, nacl.sign.signatureLength);

    return SekuireCrypto.bytesToHex(signature);
  }

  /**
   * Verify a signature (useful for testing)
   */
  verify(message: string, signatureHex: string): boolean {
    if (!this.publicKey) {
      throw new Error("No public key available for verification");
    }

    const publicKeyBytes = SekuireCrypto.hexToBytes(this.publicKey);
    const signatureBytes = SekuireCrypto.hexToBytes(signatureHex);
    const messageBytes = new TextEncoder().encode(message);

    // Reconstruct signed message format for verification
    const signedMessage = new Uint8Array(
      signatureBytes.length + messageBytes.length
    );
    signedMessage.set(signatureBytes);
    signedMessage.set(messageBytes, signatureBytes.length);

    const result = nacl.sign.open(signedMessage, publicKeyBytes);
    return result !== null;
  }
}
