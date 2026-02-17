import { BaseMemoryStorage, type MemoryMessage } from './base';
export interface DynamoDBConfig {
    tableName: string;
    region?: string;
    endpoint?: string;
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
    };
    createTable?: boolean;
}
export declare class DynamoDBStorage extends BaseMemoryStorage {
    private client;
    private docClient;
    private config;
    private connectionPromise;
    private tableReady;
    constructor(config: DynamoDBConfig);
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
