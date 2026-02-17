import type { MemoryStorage } from './base';
export type StorageFactory = (config: any) => MemoryStorage;
export declare function registerStorage(type: string, factory: StorageFactory, description?: string): void;
export declare function getStorageFactory(type: string): StorageFactory | undefined;
export declare function hasStorage(type: string): boolean;
export declare function listStorageTypes(): string[];
export declare function getStorageInfo(): Array<{
    type: string;
    description?: string;
}>;
export declare function unregisterStorage(type: string): boolean;
export declare function clearRegistry(): void;
