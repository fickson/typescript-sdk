import { SekuireClient } from "./client";
import type { KeyPair, SekuireClientConfig } from "./types";
/**
 * Generate a new Ed25519 keypair for Sekuire operations
 */
export declare function generateKeyPair(): KeyPair;
/**
 * Calculate Sekuire ID from agent configuration (canonical V2 algorithm).
 *
 * projectName and projectVersion are accepted for backwards compatibility
 * but are NOT used in the ID computation.
 */
export declare function calculateSekuireId(params: {
    model: string;
    systemPrompt: string;
    tools: string;
    projectName?: string;
    projectVersion?: string;
}): string;
/**
 * @deprecated Use calculateSekuireId (V2) instead.
 */
export declare function calculateSekuireIdLegacy(params: {
    model: string;
    systemPrompt: string;
    tools: string;
    projectName: string;
    projectVersion: string;
}): string;
/**
 * Create a SekuireClient with sensible defaults
 */
export declare function createSekuireClient(keyPair: KeyPair, registryUrl?: string, options?: Partial<SekuireClientConfig>): SekuireClient;
/**
 * Load keypair from environment variables
 */
export declare function loadKeyPairFromEnv(): KeyPair;
/**
 * Validate agent configuration
 */
export declare function validateAgentConfig(config: {
    model: string;
    systemPrompt: string;
    tools: string;
    projectName: string;
    projectVersion: string;
}): void;
/**
 * Create agent manifest
 */
export declare function createAgentManifest(config: {
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
}): {
    project: {
        name: string;
        version: string;
        description: string | undefined;
        authors: string[];
        license: string | undefined;
    };
    identity: {
        model: string;
        systemPromptPath: string;
        toolsPath: string;
        systemPromptHash: string | undefined;
        toolsHash: string | undefined;
    };
};
