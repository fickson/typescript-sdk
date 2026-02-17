import { BaseMemoryStorage, type MemoryMessage } from './base';
export interface CloudflareKVConfig {
    binding?: any;
    accountId?: string;
    namespaceId?: string;
    apiToken?: string;
    keyPrefix?: string;
}
export declare class CloudflareKVStorage extends BaseMemoryStorage {
    private binding;
    private config;
    private keyPrefix;
    private useRestApi;
    constructor(config: CloudflareKVConfig);
    private getKey;
    private kvGet;
    private kvPut;
    private kvDelete;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}
