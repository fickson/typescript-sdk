export interface HttpClientConfig {
    baseUrl: string;
    timeout?: number;
    retries?: number;
    apiKey?: string;
    authToken?: string;
}
export declare class HttpClient {
    private baseUrl;
    private timeout;
    private retries;
    private apiKey?;
    private authToken?;
    constructor(config: HttpClientConfig);
    setAuthToken(token: string): void;
    setApiKey(apiKey: string): void;
    get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T>;
    post<T>(path: string, data?: unknown): Promise<T>;
    put<T>(path: string, data?: unknown): Promise<T>;
    delete<T>(path: string): Promise<T>;
    private resolveUrl;
    private fetchWithRetry;
    private shouldRetry;
    private delay;
}
