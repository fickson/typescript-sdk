export interface RuntimeCredentials {
    installationId?: string;
    runtimeToken?: string;
    refreshToken?: string;
    expiresAt?: string;
}
export interface BootstrapResponseData {
    installation_id: string;
    runtime_token: string;
    refresh_token?: string;
    expires_at: string;
}
export interface BootstrapTarget {
    installationId: string | null;
    runtimeToken: string | null;
    refreshToken: string | null;
    credentialsStore?: RuntimeCredentialsStore | null;
}
export declare function applyBootstrapResponse(target: BootstrapTarget, data: BootstrapResponseData): void;
export declare class RuntimeCredentialsStore {
    private installationId?;
    private runtimeToken?;
    private refreshToken?;
    private expiresAt?;
    private apiBaseUrl?;
    private inflightRefresh;
    constructor(initial?: RuntimeCredentials & {
        apiBaseUrl?: string;
    });
    setApiBaseUrl(url: string): void;
    update(partial: RuntimeCredentials): void;
    setRuntimeToken(runtimeToken: string, expiresAt?: string): void;
    setInstallationId(installationId: string): void;
    setRefreshToken(refreshToken: string): void;
    getInstallationId(): string | undefined;
    getRuntimeToken(): string | undefined;
    getRefreshToken(): string | undefined;
    getExpiresAt(): string | undefined;
    getAll(): RuntimeCredentials;
    hasRecoveryCredentials(): boolean;
    hasRuntimeToken(): boolean;
    refreshRuntimeToken(caller?: string): Promise<void>;
    private doRefresh;
}
