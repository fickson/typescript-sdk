import { BaseMemoryStorage, type MemoryMessage } from './base';
export interface ConvexConfig {
    url: string;
    adminKey?: string;
}
export declare class ConvexStorage extends BaseMemoryStorage {
    private client;
    private config;
    private connectionPromise;
    constructor(config: ConvexConfig);
    connect(): Promise<void>;
    private ensureConnected;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}
export declare const CONVEX_SCHEMA_TEMPLATE = "\n// convex/schema.ts\nimport { defineSchema, defineTable } from \"convex/server\";\nimport { v } from \"convex/values\";\n\nexport default defineSchema({\n  sekuireMemory: defineTable({\n    sessionId: v.string(),\n    role: v.union(v.literal(\"user\"), v.literal(\"assistant\"), v.literal(\"system\")),\n    content: v.string(),\n    timestamp: v.number(),\n    metadata: v.optional(v.any()),\n  }).index(\"by_session\", [\"sessionId\", \"timestamp\"]),\n});\n";
export declare const CONVEX_FUNCTIONS_TEMPLATE = "\n// convex/sekuireMemory.ts\nimport { mutation, query } from \"./_generated/server\";\nimport { v } from \"convex/values\";\n\nexport const add = mutation({\n  args: {\n    sessionId: v.string(),\n    role: v.union(v.literal(\"user\"), v.literal(\"assistant\"), v.literal(\"system\")),\n    content: v.string(),\n    timestamp: v.number(),\n    metadata: v.optional(v.any()),\n  },\n  handler: async (ctx, args) => {\n    await ctx.db.insert(\"sekuireMemory\", args);\n  },\n});\n\nexport const get = query({\n  args: {\n    sessionId: v.string(),\n    limit: v.optional(v.number()),\n  },\n  handler: async (ctx, args) => {\n    let query = ctx.db\n      .query(\"sekuireMemory\")\n      .withIndex(\"by_session\", (q) => q.eq(\"sessionId\", args.sessionId))\n      .order(\"asc\");\n\n    const messages = await query.collect();\n\n    if (args.limit) {\n      return messages.slice(-args.limit);\n    }\n    return messages;\n  },\n});\n\nexport const clear = mutation({\n  args: {\n    sessionId: v.string(),\n  },\n  handler: async (ctx, args) => {\n    const messages = await ctx.db\n      .query(\"sekuireMemory\")\n      .withIndex(\"by_session\", (q) => q.eq(\"sessionId\", args.sessionId))\n      .collect();\n\n    for (const message of messages) {\n      await ctx.db.delete(message._id);\n    }\n  },\n});\n\nexport const exists = query({\n  args: {\n    sessionId: v.string(),\n  },\n  handler: async (ctx, args) => {\n    const message = await ctx.db\n      .query(\"sekuireMemory\")\n      .withIndex(\"by_session\", (q) => q.eq(\"sessionId\", args.sessionId))\n      .first();\n    return message !== null;\n  },\n});\n";
