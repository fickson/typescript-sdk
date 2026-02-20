import { BaseMemoryStorage, type MemoryMessage } from './base';
export interface FileStorageConfig {
    path: string;
}
export declare class FileStorage extends BaseMemoryStorage {
    private readonly config;
    private connectionPromise;
    private data;
    constructor(config: FileStorageConfig);
    connect(): Promise<void>;
    private initialize;
    private ensureConnected;
    private flush;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}
