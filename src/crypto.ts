import * as blake3 from "blake3";
import naclDefault from "tweetnacl";
import * as naclStar from "tweetnacl";
const nacl = naclDefault ?? naclStar;
import { CryptoError, type HexString, type KeyPair } from "./types";

export class SekuireCrypto {
  /**
   * Generate a new Ed25519 keypair
   */
  static generateKeyPair(): KeyPair {
    const keyPair = nacl.sign.keyPair();
    return {
      publicKey: Buffer.from(keyPair.publicKey).toString("hex"),
      privateKey: Buffer.from(keyPair.secretKey).toString("hex"),
    };
  }

  /**
   * Sign a message with a private key
   */
  static sign(message: string | Uint8Array, privateKeyHex: string): HexString {
    try {
      const privateKey = SekuireCrypto.hexToBytes(privateKeyHex);
      const messageBytes =
        typeof message === "string" ? Buffer.from(message, "utf8") : message;

      // Accept both 32-byte Ed25519 seeds (CLI-generated) and 64-byte nacl secret keys.
      const secretKey =
        privateKey.length === 32
          ? nacl.sign.keyPair.fromSeed(privateKey).secretKey
          : privateKey;

      if (secretKey.length !== 64) {
        throw new CryptoError(
          `Invalid private key length: expected 32-byte seed or 64-byte secret key, got ${privateKey.length} bytes`,
        );
      }

      const signature = nacl.sign.detached(messageBytes, secretKey);
      return Buffer.from(signature).toString("hex");
    } catch (error) {
      throw new CryptoError(
        `Failed to sign message: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Verify a signature
   */
  static verify(
    message: string | Uint8Array,
    signatureHex: string,
    publicKeyHex: string,
  ): boolean {
    try {
      const messageBytes =
        typeof message === "string" ? Buffer.from(message, "utf8") : message;
      const signature = SekuireCrypto.hexToBytes(signatureHex);
      const publicKey = SekuireCrypto.hexToBytes(publicKeyHex);

      return nacl.sign.detached.verify(messageBytes, signature, publicKey);
    } catch (error) {
      throw new CryptoError(
        `Failed to verify signature: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Calculate Blake3 hash of data
   */
  static hash(data: string | Uint8Array): HexString {
    try {
      const dataBytes =
        typeof data === "string" ? Buffer.from(data, "utf8") : data;

      const hash = blake3.hash(dataBytes);
      return hash.toString("hex");
    } catch (error) {
      throw new CryptoError(`Failed to hash data: ${(error as Error).message}`);
    }
  }

  /**
   * Calculate Sekuire ID using the canonical algorithm (V2).
   *
   * Matches the CLI reference implementation (auth.rs:243-250):
   *   fingerprint = "model:{model}|prompt:{BLAKE3(trim(prompt))}|tools:{BLAKE3(canonical_json(tools))}"
   *   sekuire_id  = BLAKE3(fingerprint)
   *
   * projectName and projectVersion are accepted for backwards compatibility
   * but are NOT used in the ID computation.
   */
  static calculateSekuireId(params: {
    model: string;
    systemPrompt: string;
    tools: string;
    projectName?: string;
    projectVersion?: string;
  }): HexString {
    return SekuireCrypto.calculateSekuireIdV2(params);
  }

  /**
   * Canonical identity algorithm aligned with CLI (auth.rs:243-250).
   *
   * 1. promptHash  = BLAKE3(trim(systemPrompt))
   * 2. toolsHash   = BLAKE3(JSON.stringify(JSON.parse(tools)))  // canonical JSON
   * 3. fingerprint = "model:{model}|prompt:{promptHash}|tools:{toolsHash}"
   * 4. sekuireId   = BLAKE3(fingerprint)
   */
  static calculateSekuireIdV2(params: {
    model: string;
    systemPrompt: string;
    tools: string;
  }): HexString {
    const promptHash = SekuireCrypto.hash(params.systemPrompt.trim());

    let canonicalTools: string;
    try {
      canonicalTools = JSON.stringify(JSON.parse(params.tools));
    } catch {
      canonicalTools = params.tools;
    }
    const toolsHash = SekuireCrypto.hash(canonicalTools);

    const fingerprint = `model:${params.model}|prompt:${promptHash}|tools:${toolsHash}`;
    return SekuireCrypto.hash(fingerprint);
  }

  /**
   * @deprecated Use calculateSekuireId (V2) instead. This legacy algorithm
   * concatenates all fields in a single pass and does not match the CLI.
   */
  static calculateSekuireIdLegacy(params: {
    model: string;
    systemPrompt: string;
    tools: string;
    projectName: string;
    projectVersion: string;
  }): HexString {
    const combined = [
      params.model,
      params.systemPrompt,
      params.tools,
      params.projectName,
      params.projectVersion,
    ].join("");

    return SekuireCrypto.hash(combined);
  }

  /**
   * Generate a cryptographically secure random nonce (32 bytes)
   */
  static generateNonce(): HexString {
    const bytes = nacl.randomBytes(32);
    return Buffer.from(bytes).toString("hex");
  }

  /**
   * Convert hex string to Uint8Array
   */
  static hexToBytes(hex: string): Uint8Array {
    // Remove 0x prefix if present
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;

    // Ensure even length
    if (cleanHex.length % 2 !== 0) {
      throw new CryptoError("Invalid hex string: odd length");
    }

    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
    }

    return bytes;
  }

  /**
   * Convert Uint8Array to hex string
   */
  static bytesToHex(bytes: Uint8Array): HexString {
    return Buffer.from(bytes).toString("hex");
  }

  /**
   * Validate hex string format
   */
  static isValidHex(hex: string): boolean {
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    return (
      /^[0-9a-fA-F]*$/.test(cleanHex) &&
      cleanHex.length > 0 &&
      cleanHex.length % 2 === 0
    );
  }

  /**
   * Validate Ed25519 public key format (32 bytes)
   */
  static isValidPublicKey(hex: string): boolean {
    if (!SekuireCrypto.isValidHex(hex)) return false;
    try {
      return SekuireCrypto.hexToBytes(hex).length === 32;
    } catch {
      return false;
    }
  }

  /**
   * Validate Ed25519 private key format (32-byte seed or 64-byte secret key)
   */
  static isValidPrivateKey(hex: string): boolean {
    if (!SekuireCrypto.isValidHex(hex)) return false;
    try {
      const len = SekuireCrypto.hexToBytes(hex).length;
      return len === 32 || len === 64;
    } catch {
      return false;
    }
  }

  /**
   * Validate nonce format (32 bytes)
   */
  static isValidNonce(hex: string): boolean {
    if (!SekuireCrypto.isValidHex(hex)) return false;
    try {
      return SekuireCrypto.hexToBytes(hex).length === 32;
    } catch {
      return false;
    }
  }
}
