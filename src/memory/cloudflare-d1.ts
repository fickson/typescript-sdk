import { BaseMemoryStorage, type MemoryMessage } from './base';

export interface CloudflareD1Config {
  binding?: any;
  accountId?: string;
  databaseId?: string;
  apiToken?: string;
  tableName?: string;
}

export class CloudflareD1Storage extends BaseMemoryStorage {
  private binding: any = null;
  private config: CloudflareD1Config;
  private tableName: string;
  private useRestApi: boolean;
  private tableInitialized: boolean = false;

  constructor(config: CloudflareD1Config) {
    super();
    this.config = config;
    this.tableName = config.tableName || 'sekuire_memory';

    if (config.binding) {
      this.binding = config.binding;
      this.useRestApi = false;
      this._connected = true;
    } else if (config.accountId && config.databaseId && config.apiToken) {
      this.useRestApi = true;
      this._connected = true;
    } else {
      throw new Error(
        'CloudflareD1Config requires either a binding (in Workers) or accountId, databaseId, and apiToken (for REST API)'
      );
    }
  }

  private async executeQuery(sql: string, params: unknown[] = []): Promise<any> {
    if (!this.useRestApi) {
      const stmt = this.binding.prepare(sql);
      if (params.length > 0) {
        return stmt.bind(...params).all();
      }
      return stmt.all();
    }

    const { accountId, databaseId, apiToken } = this.config;
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`D1 query failed: ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(`D1 query failed: ${JSON.stringify(result.errors)}`);
    }

    return result.result?.[0] || { results: [] };
  }

  private async ensureTableExists(): Promise<void> {
    if (this.tableInitialized) return;

    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_session_id ON ${this.tableName}(session_id)
    `;

    await this.executeQuery(createTableSQL);
    await this.executeQuery(createIndexSQL);
    this.tableInitialized = true;
  }

  async add(sessionId: string, message: MemoryMessage): Promise<void> {
    await this.ensureTableExists();

    const sql = `
      INSERT INTO ${this.tableName} (session_id, role, content, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?)
    `;

    await this.executeQuery(sql, [
      sessionId,
      message.role,
      message.content,
      message.timestamp,
      message.metadata ? JSON.stringify(message.metadata) : null,
    ]);
  }

  async get(sessionId: string, limit?: number): Promise<MemoryMessage[]> {
    await this.ensureTableExists();

    let sql = `
      SELECT role, content, timestamp, metadata
      FROM ${this.tableName}
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `;

    if (limit) {
      sql += ` LIMIT ${limit}`;
    }

    const result = await this.executeQuery(sql, [sessionId]);
    return (result.results || []).map((row: any) => ({
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  async clear(sessionId: string): Promise<void> {
    await this.ensureTableExists();
    const sql = `DELETE FROM ${this.tableName} WHERE session_id = ?`;
    await this.executeQuery(sql, [sessionId]);
  }

  async delete(sessionId: string): Promise<void> {
    await this.clear(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    await this.ensureTableExists();
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE session_id = ?`;
    const result = await this.executeQuery(sql, [sessionId]);
    return (result.results?.[0]?.count || 0) > 0;
  }

  async disconnect(): Promise<void> {
    this._connected = false;
  }
}
