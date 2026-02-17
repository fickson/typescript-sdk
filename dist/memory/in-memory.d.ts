import { BaseMemoryStorage, type MemoryMessage } from './base';
export declare class InMemoryStorage extends BaseMemoryStorage {
    private storage;
    constructor();
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
}
