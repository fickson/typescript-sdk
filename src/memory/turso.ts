import { BaseMemoryStorage, type MemoryMessage } from './base';

type LibSQLClientType = any;

export interface TursoConfig {
  url: string;
  authToken?: string;
  tableName?: string;
}

export class TursoStorage extends BaseMemoryStorage {
  private client: LibSQLClientType | null = null;
  private config: TursoConfig;
  private tableName: string;
  private connectionPromise: Promise<void> | null = null;
  private tableInitialized: boolean = false;

  constructor(config: TursoConfig) {
    super();
    this.config = config;
    this.tableName = config.tableName || 'sekuire_memory';
    this.connectionPromise = this.connect();
  }

  async connect(): Promise<void> {
    if (this._connected) return;
    if (this.connectionPromise && !this._connected) return this.connectionPromise;

    try {
      const { createClient } = await import('@libsql/client');

      this.client = createClient({
        url: this.config.url,
        authToken: this.config.authToken,
      });

      await this.ensureTableExists();
      this._connected = true;
    } catch (error) {
      this.connectionPromise = null;
      throw new Error(`Failed to initialize Turso: ${error}`);
    }
  }

  private async ensureTableExists(): Promise<void> {
    if (this.tableInitialized) return;

    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_session_id ON ${this.tableName}(session_id)
    `);

    this.tableInitialized = true;
  }

  private async ensureConnected(): Promise<void> {
    if (!this._connected) {
      await this.connect();
    }
  }

  async add(sessionId: string, message: MemoryMessage): Promise<void> {
    await this.ensureConnected();

    await this.client.execute({
      sql: `
        INSERT INTO ${this.tableName} (session_id, role, content, timestamp, metadata)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [
        sessionId,
        message.role,
        message.content,
        message.timestamp,
        message.metadata ? JSON.stringify(message.metadata) : null,
      ],
    });
  }

  async get(sessionId: string, limit?: number): Promise<MemoryMessage[]> {
    await this.ensureConnected();

    let sql = `
      SELECT role, content, timestamp, metadata
      FROM ${this.tableName}
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `;

    if (limit) {
      sql += ` LIMIT ${limit}`;
    }

    const result = await this.client.execute({
      sql,
      args: [sessionId],
    });

    return result.rows.map((row: any) => ({
      role: row.role,
      content: row.content,
      timestamp: Number(row.timestamp),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  async clear(sessionId: string): Promise<void> {
    await this.ensureConnected();

    await this.client.execute({
      sql: `DELETE FROM ${this.tableName} WHERE session_id = ?`,
      args: [sessionId],
    });
  }

  async delete(sessionId: string): Promise<void> {
    await this.clear(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    await this.ensureConnected();

    const result = await this.client.execute({
      sql: `SELECT COUNT(*) as count FROM ${this.tableName} WHERE session_id = ?`,
      args: [sessionId],
    });

    return Number(result.rows[0]?.count || 0) > 0;
  }

  async disconnect(): Promise<void> {
    if (this._connected && this.client) {
      this.client.close();
      this._connected = false;
      this.connectionPromise = null;
    }
  }
}
