import { BaseMemoryStorage, type MemoryMessage } from './base';
export interface SQLiteConfig {
    filename: string;
    tableName?: string;
    readonly?: boolean;
}
export declare class SQLiteStorage extends BaseMemoryStorage {
    private db;
    private config;
    private tableName;
    private connectionPromise;
    constructor(config: SQLiteConfig);
    connect(): Promise<void>;
    private loadDatabaseDriver;
    private ensureTableExists;
    private ensureConnected;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}
