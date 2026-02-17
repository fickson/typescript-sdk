import type { MemoryStorage } from './base';

export type StorageFactory = (config: any) => MemoryStorage;

interface StorageRegistration {
  factory: StorageFactory;
  description?: string;
}

const storageRegistry = new Map<string, StorageRegistration>();

export function registerStorage(type: string, factory: StorageFactory, description?: string): void {
  if (storageRegistry.has(type)) {
    console.warn(`Storage type '${type}' is already registered. Overwriting.`);
  }
  storageRegistry.set(type, { factory, description });
}

export function getStorageFactory(type: string): StorageFactory | undefined {
  const registration = storageRegistry.get(type);
  return registration?.factory;
}

export function hasStorage(type: string): boolean {
  return storageRegistry.has(type);
}

export function listStorageTypes(): string[] {
  return Array.from(storageRegistry.keys());
}

export function getStorageInfo(): Array<{ type: string; description?: string }> {
  return Array.from(storageRegistry.entries()).map(([type, reg]) => ({
    type,
    description: reg.description,
  }));
}

export function unregisterStorage(type: string): boolean {
  return storageRegistry.delete(type);
}

export function clearRegistry(): void {
  storageRegistry.clear();
}
