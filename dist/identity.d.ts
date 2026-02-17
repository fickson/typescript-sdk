export declare class AgentIdentity {
    readonly name: string;
    readonly sekuireId: string;
    private readonly privateKey?;
    readonly publicKey?: string | undefined;
    constructor(name: string, sekuireId: string, privateKey?: string | undefined, publicKey?: string | undefined);
    static load(manifestPath?: string): Promise<AgentIdentity>;
    /**
     * Sign a message using Ed25519
     * @param message The message string to sign
     * @returns Hex-encoded signature
     */
    sign(message: string): Promise<string>;
    /**
     * Verify a signature (useful for testing)
     */
    verify(message: string, signatureHex: string): boolean;
}
