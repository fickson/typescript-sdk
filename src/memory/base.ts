export interface MemoryMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryStorage {
  add(sessionId: string, message: MemoryMessage): Promise<void>;
  get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
  clear(sessionId: string): Promise<void>;
  delete(sessionId: string): Promise<void>;
  exists(sessionId: string): Promise<boolean>;

  connect?(): Promise<void>;
  disconnect?(): Promise<void>;
  isConnected?(): boolean;
}

export abstract class BaseMemoryStorage implements MemoryStorage {
  protected _connected: boolean = false;

  abstract add(sessionId: string, message: MemoryMessage): Promise<void>;
  abstract get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
  abstract clear(sessionId: string): Promise<void>;
  abstract delete(sessionId: string): Promise<void>;
  abstract exists(sessionId: string): Promise<boolean>;

  async connect(): Promise<void> {
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }
}
