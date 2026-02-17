import { BaseMemoryStorage, type MemoryMessage } from './base';
export interface PostgresConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    tableName?: string;
    lazyConnect?: boolean;
}
export declare class PostgresStorage extends BaseMemoryStorage {
    private pool;
    private tableName;
    private config;
    private connectionPromise;
    constructor(config: PostgresConfig);
    connect(): Promise<void>;
    private initPool;
    private ensureConnected;
    private createTableIfNotExists;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}
