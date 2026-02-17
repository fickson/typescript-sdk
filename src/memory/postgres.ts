import { BaseMemoryStorage, type MemoryMessage } from './base';

export interface PostgresConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  tableName?: string;
  lazyConnect?: boolean;
}

export class PostgresStorage extends BaseMemoryStorage {
  private pool: any;
  private tableName: string;
  private config: PostgresConfig;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: PostgresConfig) {
    super();
    this.tableName = config.tableName || 'sekuire_memory';
    this.config = config;
    if (!config.lazyConnect) {
      this.connectionPromise = this.connect();
    }
  }

  async connect(): Promise<void> {
    if (this._connected) return;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = this.initPool();
    return this.connectionPromise;
  }

  private async initPool(): Promise<void> {
    try {
      const { Pool } = await import('pg');

      if (this.config.connectionString) {
        this.pool = new Pool({ connectionString: this.config.connectionString });
      } else {
        this.pool = new Pool({
          host: this.config.host || 'localhost',
          port: this.config.port || 5432,
          database: this.config.database,
          user: this.config.user,
          password: this.config.password,
        });
      }

      await this.createTableIfNotExists();
      this._connected = true;
    } catch (error) {
      this.connectionPromise = null;
      throw new Error(`Failed to initialize Postgres: ${error}`);
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this._connected) {
      await this.connect();
    }
  }

  private async createTableIfNotExists(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_session_id ON ${this.tableName}(session_id);
    `;

    await this.pool.query(query);
  }

  async add(sessionId: string, message: MemoryMessage): Promise<void> {
    await this.ensureConnected();
    const query = `
      INSERT INTO ${this.tableName} (session_id, role, content, timestamp, metadata)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await this.pool.query(query, [
      sessionId,
      message.role,
      message.content,
      message.timestamp,
      message.metadata ? JSON.stringify(message.metadata) : null,
    ]);
  }

  async get(sessionId: string, limit?: number): Promise<MemoryMessage[]> {
    await this.ensureConnected();
    let query = `
      SELECT role, content, timestamp, metadata
      FROM ${this.tableName}
      WHERE session_id = $1
      ORDER BY timestamp ASC
    `;
    if (limit) {
      query += ` LIMIT ${limit}`;
    }
    const result = await this.pool.query(query, [sessionId]);
    return result.rows.map((row: any) => ({
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      metadata: row.metadata,
    }));
  }

  async clear(sessionId: string): Promise<void> {
    await this.ensureConnected();
    const query = `DELETE FROM ${this.tableName} WHERE session_id = $1`;
    await this.pool.query(query, [sessionId]);
  }

  async delete(sessionId: string): Promise<void> {
    await this.clear(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    await this.ensureConnected();
    const query = `SELECT COUNT(*) FROM ${this.tableName} WHERE session_id = $1`;
    const result = await this.pool.query(query, [sessionId]);
    return parseInt(result.rows[0].count) > 0;
  }

  async disconnect(): Promise<void> {
    if (this._connected && this.pool) {
      await this.pool.end();
      this._connected = false;
      this.connectionPromise = null;
    }
  }
}
