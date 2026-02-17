import { BaseMemoryStorage, type MemoryMessage } from './base';

type RedisClientType = any;

export interface RedisConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  url?: string;
  keyPrefix?: string;
  lazyConnect?: boolean;
}

export class RedisStorage extends BaseMemoryStorage {
  private client: RedisClientType | null = null;
  private keyPrefix: string;
  private config: RedisConfig;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: RedisConfig) {
    super();
    this.keyPrefix = config.keyPrefix || 'sekuire:memory:';
    this.config = config;
    if (!config.lazyConnect) {
      this.connectionPromise = this.connect();
    }
  }

  async connect(): Promise<void> {
    if (this._connected) return;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = this.initClient();
    return this.connectionPromise;
  }

  private async initClient(): Promise<void> {
    try {
      const { createClient } = await import('redis');

      if (this.config.url) {
        this.client = createClient({ url: this.config.url });
      } else {
        this.client = createClient({
          socket: {
            host: this.config.host || 'localhost',
            port: this.config.port || 6379,
          },
          password: this.config.password,
          database: this.config.db || 0,
        });
      }

      this.client.on('error', (err: Error) => {
        console.error('Redis client error:', err);
      });

      await this.client.connect();
      this._connected = true;
    } catch (error) {
      this.connectionPromise = null;
      throw new Error(`Failed to initialize Redis: ${error}`);
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
    await this.client.rPush(key, JSON.stringify(message));
  }

  async get(sessionId: string, limit?: number): Promise<MemoryMessage[]> {
    await this.ensureConnected();
    const key = this.getKey(sessionId);
    const start = limit ? -limit : 0;
    const messages = await this.client.lRange(key, start, -1);
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
    if (this._connected && this.client) {
      await this.client.quit();
      this._connected = false;
      this.connectionPromise = null;
    }
  }
}
