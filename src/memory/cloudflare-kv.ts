import { BaseMemoryStorage, type MemoryMessage } from './base';

export interface CloudflareKVConfig {
  binding?: any;
  accountId?: string;
  namespaceId?: string;
  apiToken?: string;
  keyPrefix?: string;
}

export class CloudflareKVStorage extends BaseMemoryStorage {
  private binding: any = null;
  private config: CloudflareKVConfig;
  private keyPrefix: string;
  private useRestApi: boolean;

  constructor(config: CloudflareKVConfig) {
    super();
    this.config = config;
    this.keyPrefix = config.keyPrefix || 'sekuire:memory:';

    if (config.binding) {
      this.binding = config.binding;
      this.useRestApi = false;
      this._connected = true;
    } else if (config.accountId && config.namespaceId && config.apiToken) {
      this.useRestApi = true;
      this._connected = true;
    } else {
      throw new Error(
        'CloudflareKVConfig requires either a binding (in Workers) or accountId, namespaceId, and apiToken (for REST API)'
      );
    }
  }

  private getKey(sessionId: string): string {
    return `${this.keyPrefix}${sessionId}`;
  }

  private async kvGet(key: string): Promise<string | null> {
    if (!this.useRestApi) {
      return this.binding.get(key);
    }

    const { accountId, namespaceId, apiToken } = this.config;
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`KV GET failed: ${response.statusText}`);
    return response.text();
  }

  private async kvPut(key: string, value: string): Promise<void> {
    if (!this.useRestApi) {
      await this.binding.put(key, value);
      return;
    }

    const { accountId, namespaceId, apiToken } = this.config;
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'text/plain',
      },
      body: value,
    });

    if (!response.ok) throw new Error(`KV PUT failed: ${response.statusText}`);
  }

  private async kvDelete(key: string): Promise<void> {
    if (!this.useRestApi) {
      await this.binding.delete(key);
      return;
    }

    const { accountId, namespaceId, apiToken } = this.config;
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${encodeURIComponent(key)}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`KV DELETE failed: ${response.statusText}`);
    }
  }

  async add(sessionId: string, message: MemoryMessage): Promise<void> {
    const key = this.getKey(sessionId);
    const existing = await this.kvGet(key);
    const messages: MemoryMessage[] = existing ? JSON.parse(existing) : [];
    messages.push(message);
    await this.kvPut(key, JSON.stringify(messages));
  }

  async get(sessionId: string, limit?: number): Promise<MemoryMessage[]> {
    const key = this.getKey(sessionId);
    const data = await this.kvGet(key);
    if (!data) return [];

    const messages: MemoryMessage[] = JSON.parse(data);
    if (limit) {
      return messages.slice(-limit);
    }
    return messages;
  }

  async clear(sessionId: string): Promise<void> {
    const key = this.getKey(sessionId);
    await this.kvDelete(key);
  }

  async delete(sessionId: string): Promise<void> {
    await this.clear(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    const key = this.getKey(sessionId);
    const data = await this.kvGet(key);
    return data !== null;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }
}
