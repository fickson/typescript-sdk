import { BaseMemoryStorage, type MemoryMessage } from './base';

type ConvexClientType = any;

export interface ConvexConfig {
  url: string;
  adminKey?: string;
}

export class ConvexStorage extends BaseMemoryStorage {
  private client: ConvexClientType | null = null;
  private config: ConvexConfig;
  private connectionPromise: Promise<void> | null = null;

  constructor(config: ConvexConfig) {
    super();
    this.config = config;
    this.connectionPromise = this.connect();
  }

  async connect(): Promise<void> {
    if (this._connected) return;
    if (this.connectionPromise && !this._connected) return this.connectionPromise;

    try {
      const { ConvexHttpClient } = await import('convex/browser');

      this.client = new ConvexHttpClient(this.config.url);
      this._connected = true;
    } catch (error) {
      this.connectionPromise = null;
      throw new Error(`Failed to initialize Convex: ${error}`);
    }
  }

  private async ensureConnected(): Promise<void> {
    if (!this._connected) {
      await this.connect();
    }
  }

  async add(sessionId: string, message: MemoryMessage): Promise<void> {
    await this.ensureConnected();

    await this.client.mutation('sekuireMemory:add', {
      sessionId,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      metadata: message.metadata || {},
    });
  }

  async get(sessionId: string, limit?: number): Promise<MemoryMessage[]> {
    await this.ensureConnected();

    const messages = await this.client.query('sekuireMemory:get', {
      sessionId,
      limit,
    });

    return messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: msg.metadata && Object.keys(msg.metadata).length > 0 ? msg.metadata : undefined,
    }));
  }

  async clear(sessionId: string): Promise<void> {
    await this.ensureConnected();
    await this.client.mutation('sekuireMemory:clear', { sessionId });
  }

  async delete(sessionId: string): Promise<void> {
    await this.clear(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    await this.ensureConnected();
    return this.client.query('sekuireMemory:exists', { sessionId });
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this.client = null;
    this.connectionPromise = null;
  }
}

export const CONVEX_SCHEMA_TEMPLATE = `
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sekuireMemory: defineTable({
    sessionId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  }).index("by_session", ["sessionId", "timestamp"]),
});
`;

export const CONVEX_FUNCTIONS_TEMPLATE = `
// convex/sekuireMemory.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const add = mutation({
  args: {
    sessionId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    timestamp: v.number(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sekuireMemory", args);
  },
});

export const get = query({
  args: {
    sessionId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let query = ctx.db
      .query("sekuireMemory")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc");

    const messages = await query.collect();

    if (args.limit) {
      return messages.slice(-args.limit);
    }
    return messages;
  },
});

export const clear = mutation({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("sekuireMemory")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }
  },
});

export const exists = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("sekuireMemory")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    return message !== null;
  },
});
`;
