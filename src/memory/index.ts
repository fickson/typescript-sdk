export * from './base';
export * from './in-memory';
export * from './postgres';
export * from './redis';
export * from './sqlite';
export * from './upstash';
export * from './cloudflare-kv';
export * from './cloudflare-d1';
export * from './dynamodb';
export * from './turso';
export * from './convex';
export * from './registry';

import type { MemoryStorage } from './base';
import { InMemoryStorage } from './in-memory';
import { type PostgresConfig, PostgresStorage } from './postgres';
import { type RedisConfig, RedisStorage } from './redis';
import { type SQLiteConfig, SQLiteStorage } from './sqlite';
import { type UpstashConfig, UpstashStorage } from './upstash';
import { type CloudflareKVConfig, CloudflareKVStorage } from './cloudflare-kv';
import { type CloudflareD1Config, CloudflareD1Storage } from './cloudflare-d1';
import { type DynamoDBConfig, DynamoDBStorage } from './dynamodb';
import { type TursoConfig, TursoStorage } from './turso';
import { type ConvexConfig, ConvexStorage } from './convex';
import {
  registerStorage,
  getStorageFactory,
  hasStorage,
  listStorageTypes,
  getStorageInfo,
} from './registry';

export type BuiltInMemoryType =
  | 'in-memory'
  | 'buffer'
  | 'redis'
  | 'postgres'
  | 'sqlite'
  | 'upstash'
  | 'cloudflare-kv'
  | 'cloudflare-d1'
  | 'dynamodb'
  | 'turso'
  | 'convex';

export type MemoryType = BuiltInMemoryType | string;

export interface MemoryFactoryConfig {
  type: MemoryType;
  redis?: RedisConfig;
  postgres?: PostgresConfig;
  sqlite?: SQLiteConfig;
  upstash?: UpstashConfig;
  cloudflareKV?: CloudflareKVConfig;
  cloudflareD1?: CloudflareD1Config;
  dynamodb?: DynamoDBConfig;
  turso?: TursoConfig;
  convex?: ConvexConfig;
  options?: Record<string, unknown>;
  instance?: MemoryStorage;
}

registerStorage('in-memory', () => new InMemoryStorage(), 'Simple in-memory storage using Map');
registerStorage('buffer', () => new InMemoryStorage(), 'Alias for in-memory storage');

registerStorage(
  'redis',
  (config: MemoryFactoryConfig) => {
    if (!config.redis) {
      throw new Error('Redis config required for redis memory type');
    }
    return new RedisStorage(config.redis);
  },
  'Self-hosted Redis for persistence and scaling'
);

registerStorage(
  'postgres',
  (config: MemoryFactoryConfig) => {
    if (!config.postgres) {
      throw new Error('Postgres config required for postgres memory type');
    }
    return new PostgresStorage(config.postgres);
  },
  'PostgreSQL with full SQL capabilities'
);

registerStorage(
  'sqlite',
  (config: MemoryFactoryConfig) => {
    if (!config.sqlite) {
      throw new Error('SQLite config required for sqlite memory type');
    }
    return new SQLiteStorage(config.sqlite);
  },
  'Local SQLite database for development and single-node deployments'
);

registerStorage(
  'upstash',
  (config: MemoryFactoryConfig) => {
    if (!config.upstash) {
      throw new Error('Upstash config required for upstash memory type');
    }
    return new UpstashStorage(config.upstash);
  },
  'Upstash Redis - serverless Redis with HTTP API'
);

registerStorage(
  'cloudflare-kv',
  (config: MemoryFactoryConfig) => {
    if (!config.cloudflareKV) {
      throw new Error('CloudflareKV config required for cloudflare-kv memory type');
    }
    return new CloudflareKVStorage(config.cloudflareKV);
  },
  'Cloudflare KV - edge key-value storage'
);

registerStorage(
  'cloudflare-d1',
  (config: MemoryFactoryConfig) => {
    if (!config.cloudflareD1) {
      throw new Error('CloudflareD1 config required for cloudflare-d1 memory type');
    }
    return new CloudflareD1Storage(config.cloudflareD1);
  },
  'Cloudflare D1 - edge SQLite database'
);

registerStorage(
  'dynamodb',
  (config: MemoryFactoryConfig) => {
    if (!config.dynamodb) {
      throw new Error('DynamoDB config required for dynamodb memory type');
    }
    return new DynamoDBStorage(config.dynamodb);
  },
  'AWS DynamoDB - serverless NoSQL database'
);

registerStorage(
  'turso',
  (config: MemoryFactoryConfig) => {
    if (!config.turso) {
      throw new Error('Turso config required for turso memory type');
    }
    return new TursoStorage(config.turso);
  },
  'Turso - edge SQLite with libSQL'
);

registerStorage(
  'convex',
  (config: MemoryFactoryConfig) => {
    if (!config.convex) {
      throw new Error('Convex config required for convex memory type');
    }
    return new ConvexStorage(config.convex);
  },
  'Convex - real-time backend platform'
);

export function createMemoryStorage(config: MemoryFactoryConfig): MemoryStorage {
  if (config.instance) {
    return config.instance;
  }

  const factory = getStorageFactory(config.type);
  if (factory) {
    return factory(config);
  }

  throw new Error(
    `Unknown memory type: ${config.type}. Available types: ${listStorageTypes().join(', ')}`
  );
}

export { registerStorage, hasStorage, listStorageTypes, getStorageInfo };
