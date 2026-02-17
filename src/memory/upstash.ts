import { BaseMemoryStorage, type MemoryMessage } from './base';

type UpstashRedisType = any;

export interface UpstashConfig {
  url: string;
  token: string;
  keyPrefix?: string;
}

export class UpstashStorage extends BaseMemoryStorage {
  private client: UpstashRedisType | null = null;
  private keyPrefix: string;
  private config: UpstashConfig;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: UpstashConfig) {
    super();
    this.keyPrefix = config.keyPrefix || 'sekuire:memory:';
    this.config = config;
    this.connectionPromise = this.connect();
  }

  async connect(): Promise<void> {
    if (this._connected) return;
    if (this.connectionPromise && !this._connected) return this.connectionPromise;

    try {
      const { Redis } = await import('@upstash/redis');
      this.client = new Redis({
        url: this.config.url,
        token: this.config.token,
      });
      this._connected = true;
    } catch (error) {
      this.connectionPromise = null;
      throw new Error(`Failed to initialize Upstash Redis: ${error}`);
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this._connected) {
      await this.connect();
    }
  }

  private getKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  async add(sessionId: string, message: MemoryMessage): Promise<void> {
    await this.ensureConnected();
    const key = this.getKey(sessionId);
    await this.client.rpush(key, JSON.stringify(message));
  }

  async get(sessionId: string, limit?: number): Promise<MemoryMessage[]> {
    await this.ensureConnected();
    const key = this.getKey(sessionId);
    const start = limit ? -limit : 0;
    const messages: string[] = await this.client.lrange(key, start, -1);
    return messages.map((msg: string) => JSON.parse(msg));
  }

  async clear(sessionId: string): Promise<void> {
    await this.ensureConnected();
    const key = this.getKey(sessionId);
    await this.client.del(key);
  }

  async delete(sessionId: string): Promise<void> {
    await this.clear(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    await this.ensureConnected();
    const key = this.getKey(sessionId);
    return (await this.client.exists(key)) === 1;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this.client = null;
    this.connectionPromise = null;
  }
}
