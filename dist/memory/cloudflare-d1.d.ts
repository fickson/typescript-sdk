import { BaseMemoryStorage, type MemoryMessage } from './base';
export interface CloudflareD1Config {
    binding?: any;
    accountId?: string;
    databaseId?: string;
    apiToken?: string;
    tableName?: string;
}
export declare class CloudflareD1Storage extends BaseMemoryStorage {
    private binding;
    private config;
    private tableName;
    private useRestApi;
    private tableInitialized;
    constructor(config: CloudflareD1Config);
    private executeQuery;
    private ensureTableExists;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}
