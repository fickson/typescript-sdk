import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';


const externalDeps = [
  'node-fetch',
  'tweetnacl',
  'blake3',
  'axios',
  'uuid',
  'js-yaml',
  'pg',
  'redis',
  'better-sqlite3',
  'zod',
  'openai',
  '@anthropic-ai/sdk',
  '@google/generative-ai',
  '@google/genai',
  'cheerio',
  'dotenv',
  '@upstash/redis',
  '@aws-sdk/client-dynamodb',
  '@aws-sdk/lib-dynamodb',
  '@libsql/client',
  'convex',
  'convex/browser',
  '@opentelemetry/api',
  '@opentelemetry/core',
  '@opentelemetry/exporter-trace-otlp-http',
  '@opentelemetry/resources',
  '@opentelemetry/sdk-trace-base',
  '@opentelemetry/semantic-conventions',
  'eventsource',
];

export default [
  // ES Module build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.esm.js',
      format: 'esm',
      inlineDynamicImports: true,
    },
    plugins: [resolve(), commonjs(), json(), typescript({ tsconfig: './tsconfig.json' })],
    external: externalDeps,
  },

  // CommonJS build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      exports: 'named',
      inlineDynamicImports: true,
    },
    plugins: [resolve(), commonjs(), json(), typescript({ tsconfig: './tsconfig.json' })],
    external: externalDeps,
  },

  // Type definitions
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'es',
    },
    plugins: [dts()],
  },
];
