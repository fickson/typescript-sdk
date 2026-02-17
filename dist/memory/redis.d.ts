import { BaseMemoryStorage, type MemoryMessage } from './base';
export interface RedisConfig {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    url?: string;
    keyPrefix?: string;
    lazyConnect?: boolean;
}
export declare class RedisStorage extends BaseMemoryStorage {
    private client;
    private keyPrefix;
    private config;
    private connectionPromise;
    constructor(config: RedisConfig);
    connect(): Promise<void>;
    private initClient;
    private ensureConnected;
    private getKey;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}
