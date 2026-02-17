import { SekuireClient } from "./client";
import { SekuireCrypto } from "./crypto";
import type { KeyPair, SekuireClientConfig } from "./types";

/**
 * Generate a new Ed25519 keypair for Sekuire operations
 */
export function generateKeyPair(): KeyPair {
  return SekuireCrypto.generateKeyPair();
}

/**
 * Calculate Sekuire ID from agent configuration (canonical V2 algorithm).
 *
 * projectName and projectVersion are accepted for backwards compatibility
 * but are NOT used in the ID computation.
 */
export function calculateSekuireId(params: {
  model: string;
  systemPrompt: string;
  tools: string;
  projectName?: string;
  projectVersion?: string;
}): string {
  return SekuireCrypto.calculateSekuireId(params);
}

/**
 * @deprecated Use calculateSekuireId (V2) instead.
 */
export function calculateSekuireIdLegacy(params: {
  model: string;
  systemPrompt: string;
  tools: string;
  projectName: string;
  projectVersion: string;
}): string {
  return SekuireCrypto.calculateSekuireIdLegacy(params);
}

/**
 * Create a SekuireClient with sensible defaults
 */
export function createSekuireClient(
  keyPair: KeyPair,
  registryUrl?: string,
  options?: Partial<SekuireClientConfig>,
): SekuireClient {
  const config: SekuireClientConfig = {
    registryUrl: registryUrl || "https://registry.sekuire.ai",
    timeout: 30000,
    retries: 3,
    ...options,
  };

  return new SekuireClient(keyPair, config);
}

/**
 * Load keypair from environment variables
 */
export function loadKeyPairFromEnv(): KeyPair {
  const privateKey = process.env.SEKUIRE_PRIVATE_KEY;
  const publicKey = process.env.SEKUIRE_PUBLIC_KEY;

  if (!privateKey || !publicKey) {
    throw new Error(
      "Missing SEKUIRE_PRIVATE_KEY or SEKUIRE_PUBLIC_KEY environment variables",
    );
  }

  if (!SekuireCrypto.isValidPrivateKey(privateKey)) {
    throw new Error("Invalid SEKUIRE_PRIVATE_KEY format");
  }

  if (!SekuireCrypto.isValidPublicKey(publicKey)) {
    throw new Error("Invalid SEKUIRE_PUBLIC_KEY format");
  }

  return { privateKey, publicKey };
}

/**
 * Validate agent configuration
 */
export function validateAgentConfig(config: {
  model: string;
  systemPrompt: string;
  tools: string;
  projectName: string;
  projectVersion: string;
}): void {
  if (!config.model || typeof config.model !== "string") {
    throw new Error("Model is required and must be a string");
  }

  if (!config.systemPrompt || typeof config.systemPrompt !== "string") {
    throw new Error("System prompt is required and must be a string");
  }

  if (!config.tools || typeof config.tools !== "string") {
    throw new Error("Tools configuration is required and must be a string");
  }

  if (!config.projectName || typeof config.projectName !== "string") {
    throw new Error("Project name is required and must be a string");
  }

  if (!config.projectVersion || typeof config.projectVersion !== "string") {
    throw new Error("Project version is required and must be a string");
  }
}

/**
 * Create agent manifest
 */
export function createAgentManifest(config: {
  name: string;
  version: string;
  description?: string;
  authors: string[];
  license?: string;
  model: string;
  systemPromptPath: string;
  toolsPath: string;
  systemPromptHash?: string;
  toolsHash?: string;
}) {
  return {
    project: {
      name: config.name,
      version: config.version,
      description: config.description,
      authors: config.authors,
      license: config.license,
    },
    identity: {
      model: config.model,
      systemPromptPath: config.systemPromptPath,
      toolsPath: config.toolsPath,
      systemPromptHash: config.systemPromptHash,
      toolsHash: config.toolsHash,
    },
  };
}
