import { BaseMemoryStorage, type MemoryMessage } from './base';

export class InMemoryStorage extends BaseMemoryStorage {
  private storage: Map<string, MemoryMessage[]> = new Map();

  constructor() {
    super();
    this._connected = true;
  }

  async add(sessionId: string, message: MemoryMessage): Promise<void> {
    if (!this.storage.has(sessionId)) {
      this.storage.set(sessionId, []);
    }
    this.storage.get(sessionId)!.push(message);
  }

  async get(sessionId: string, limit?: number): Promise<MemoryMessage[]> {
    const messages = this.storage.get(sessionId) || [];
    if (limit) {
      return messages.slice(-limit);
    }
    return messages;
  }

  async clear(sessionId: string): Promise<void> {
    this.storage.set(sessionId, []);
  }

  async delete(sessionId: string): Promise<void> {
    this.storage.delete(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    return this.storage.has(sessionId);
  }
}
