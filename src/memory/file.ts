import fs from 'node:fs/promises';
import path from 'node:path';
import { BaseMemoryStorage, type MemoryMessage } from './base';

export interface FileStorageConfig {
  path: string;
}

type FileMemoryData = Record<string, MemoryMessage[]>;

export class FileStorage extends BaseMemoryStorage {
  private readonly config: FileStorageConfig;
  private connectionPromise: Promise<void> | null = null;
  private data: FileMemoryData = {};

  constructor(config: FileStorageConfig) {
    super();
    this.config = config;
    this.connectionPromise = this.connect();
  }

  async connect(): Promise<void> {
    if (this._connected) return;
    if (this.connectionPromise && !this._connected) return this.connectionPromise;

    this.connectionPromise = this.initialize();
    return this.connectionPromise;
  }

  private async initialize(): Promise<void> {
    try {
      const filename = this.config.path?.trim();
      if (!filename) {
        throw new Error('File memory path is required');
      }

      const dir = path.dirname(filename);
      if (dir && dir !== '.') {
        await fs.mkdir(dir, { recursive: true });
      }

      try {
        await fs.access(filename);
      } catch {
        await fs.writeFile(filename, '{}', 'utf-8');
      }

      const content = await fs.readFile(filename, 'utf-8');
      this.data = content.trim() ? (JSON.parse(content) as FileMemoryData) : {};
      this._connected = true;
    } catch (error) {
      this.connectionPromise = null;
      throw new Error(`Failed to initialize file memory: ${error}`);
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this._connected) {
      await this.connect();
    }
  }

  private async flush(): Promise<void> {
    await fs.writeFile(this.config.path, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  async add(sessionId: string, message: MemoryMessage): Promise<void> {
    await this.ensureConnected();
    if (!this.data[sessionId]) {
      this.data[sessionId] = [];
    }
    this.data[sessionId].push(message);
    await this.flush();
  }

  async get(sessionId: string, limit?: number): Promise<MemoryMessage[]> {
    await this.ensureConnected();
    const messages = this.data[sessionId] || [];
    if (limit) {
      return messages.slice(-limit);
    }
    return [...messages];
  }

  async clear(sessionId: string): Promise<void> {
    await this.ensureConnected();
    this.data[sessionId] = [];
    await this.flush();
  }

  async delete(sessionId: string): Promise<void> {
    await this.ensureConnected();
    delete this.data[sessionId];
    await this.flush();
  }

  async exists(sessionId: string): Promise<boolean> {
    await this.ensureConnected();
    return Array.isArray(this.data[sessionId]) && this.data[sessionId].length > 0;
  }

  async disconnect(): Promise<void> {
    if (this._connected) {
      await this.flush();
      this._connected = false;
      this.connectionPromise = null;
    }
  }
}
