import { BaseMemoryStorage, type MemoryMessage } from './base';
export interface TursoConfig {
    url: string;
    authToken?: string;
    tableName?: string;
}
export declare class TursoStorage extends BaseMemoryStorage {
    private client;
    private config;
    private tableName;
    private connectionPromise;
    private tableInitialized;
    constructor(config: TursoConfig);
    connect(): Promise<void>;
    private ensureTableExists;
    private ensureConnected;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}
