import * as crypto from 'crypto';
import { Tool, type ToolInput, type ToolMetadata } from './base';

export class JsonParseTool extends Tool {
  metadata: ToolMetadata = {
    name: 'json_parse',
    description: 'Parse and format JSON string',
    parameters: [
      {
        name: 'json',
        type: 'string',
        description: 'JSON string to parse',
        required: true,
      },
    ],
    category: 'data',
    compliance_level: 'internal',
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const jsonStr = input.json as string;

    try {
      const parsed = JSON.parse(jsonStr);
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export class Base64EncodeTool extends Tool {
  metadata: ToolMetadata = {
    name: 'base64_encode',
    description: 'Encode text to base64',
    parameters: [
      {
        name: 'text',
        type: 'string',
        description: 'Text to encode',
        required: true,
      },
    ],
    category: 'data',
    compliance_level: 'internal',
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const text = input.text as string;
    return Buffer.from(text).toString('base64');
  }
}

export class Base64DecodeTool extends Tool {
  metadata: ToolMetadata = {
    name: 'base64_decode',
    description: 'Decode base64 string to text',
    parameters: [
      {
        name: 'base64',
        type: 'string',
        description: 'Base64 string to decode',
        required: true,
      },
    ],
    category: 'data',
    compliance_level: 'internal',
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const base64Str = input.base64 as string;

    try {
      return Buffer.from(base64Str, 'base64').toString('utf-8');
    } catch (error) {
      throw new Error(
        `Invalid base64: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class HashTool extends Tool {
  metadata: ToolMetadata = {
    name: 'hash',
    description: 'Generate cryptographic hash (md5, sha256, sha512, etc.)',
    parameters: [
      {
        name: 'text',
        type: 'string',
        description: 'Text to hash',
        required: true,
      },
      {
        name: 'algorithm',
        type: 'string',
        description: 'Hash algorithm (default: sha256)',
        required: false,
      },
    ],
    category: 'data',
    compliance_level: 'internal',
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const text = input.text as string;
    const algorithm = (input.algorithm as string) || 'sha256';

    try {
      const hash = crypto.createHash(algorithm);
      hash.update(text);
      return hash.digest('hex');
    } catch (error) {
      throw new Error(
        `Hash generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
