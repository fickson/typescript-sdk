import { BaseMemoryStorage, type MemoryMessage } from './base';
export interface UpstashConfig {
    url: string;
    token: string;
    keyPrefix?: string;
}
export declare class UpstashStorage extends BaseMemoryStorage {
    private client;
    private keyPrefix;
    private config;
    private connectionPromise;
    constructor(config: UpstashConfig);
    connect(): Promise<void>;
    private ensureConnected;
    private getKey;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}
