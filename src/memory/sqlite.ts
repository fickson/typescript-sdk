import { BaseMemoryStorage, type MemoryMessage } from './base';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

type BetterSqlite3Database = any;

export interface SQLiteConfig {
  filename: string;
  tableName?: string;
  readonly?: boolean;
}

export class SQLiteStorage extends BaseMemoryStorage {
  private db: BetterSqlite3Database | null = null;
  private config: SQLiteConfig;
  private tableName: string;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: SQLiteConfig) {
    super();
    this.config = config;
    this.tableName = config.tableName || 'sekuire_memory';
    this.connectionPromise = this.connect();
  }

  async connect(): Promise<void> {
    if (this._connected) return;
    if (this.connectionPromise && !this._connected) return this.connectionPromise;

    try {
      const filename = this.config.filename;
      const dirname = path.dirname(filename);
      if (dirname && dirname !== '.') {
        await fs.mkdir(dirname, { recursive: true });
      }

      const Database = await this.loadDatabaseDriver();

      this.db = new Database(filename, {
        readonly: this.config.readonly || false,
      });

      this.db.pragma('journal_mode = WAL');

      this.ensureTableExists();
      this._connected = true;
    } catch (error) {
      this.connectionPromise = null;
      throw new Error(`Failed to initialize SQLite: ${error}`);
    }
  }

  private async loadDatabaseDriver(): Promise<any> {
    try {
      const requireFromCwd = createRequire(path.join(process.cwd(), 'package.json'));
      const loaded = requireFromCwd('better-sqlite3');
      return loaded.default ?? loaded;
    } catch {
      try {
        const loaded = await import('better-sqlite3');
        return loaded.default ?? loaded;
      } catch (error) {
        throw new Error(
          `Unable to load better-sqlite3. Install it in your agent project and rebuild native modules for the active Node version. ${error}`
        );
      }
    }
  }

  private ensureTableExists(): void {
    this.db.exec(`
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

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_session_id
      ON ${this.tableName}(session_id)
    `);
  }

  private async ensureConnected(): Promise<void> {
    if (!this._connected) {
      await this.connect();
    }
  }

  async add(sessionId: string, message: MemoryMessage): Promise<void> {
    await this.ensureConnected();

    const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName} (session_id, role, content, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      sessionId,
      message.role,
      message.content,
      message.timestamp,
      message.metadata ? JSON.stringify(message.metadata) : null
    );
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

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(sessionId);

    return rows.map((row: any) => ({
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  async clear(sessionId: string): Promise<void> {
    await this.ensureConnected();

    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE session_id = ?`);
    stmt.run(sessionId);
  }

  async delete(sessionId: string): Promise<void> {
    await this.clear(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    await this.ensureConnected();

    const stmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE session_id = ?`
    );
    const result = stmt.get(sessionId) as { count: number };
    return result.count > 0;
  }

  async disconnect(): Promise<void> {
    if (this._connected && this.db) {
      this.db.close();
      this._connected = false;
      this.connectionPromise = null;
    }
  }
}
