import { type HexString, type KeyPair } from "./types";
export declare class SekuireCrypto {
    /**
     * Generate a new Ed25519 keypair
     */
    static generateKeyPair(): KeyPair;
    /**
     * Sign a message with a private key
     */
    static sign(message: string | Uint8Array, privateKeyHex: string): HexString;
    /**
     * Verify a signature
     */
    static verify(message: string | Uint8Array, signatureHex: string, publicKeyHex: string): boolean;
    /**
     * Calculate Blake3 hash of data
     */
    static hash(data: string | Uint8Array): HexString;
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
    }): HexString;
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
    }): HexString;
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
    }): HexString;
    /**
     * Generate a cryptographically secure random nonce (32 bytes)
     */
    static generateNonce(): HexString;
    /**
     * Convert hex string to Uint8Array
     */
    static hexToBytes(hex: string): Uint8Array;
    /**
     * Convert Uint8Array to hex string
     */
    static bytesToHex(bytes: Uint8Array): HexString;
    /**
     * Validate hex string format
     */
    static isValidHex(hex: string): boolean;
    /**
     * Validate Ed25519 public key format (32 bytes)
     */
    static isValidPublicKey(hex: string): boolean;
    /**
     * Validate Ed25519 private key format (64 bytes)
     */
    static isValidPrivateKey(hex: string): boolean;
    /**
     * Validate nonce format (32 bytes)
     */
    static isValidNonce(hex: string): boolean;
}
