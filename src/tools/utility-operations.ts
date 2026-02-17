import { randomBytes, randomInt } from 'crypto';
import { Tool, type ToolMetadata } from './base';

export class DateFormatTool extends Tool {
  metadata: ToolMetadata = {
    name: 'date_format',
    description: 'Format dates in various formats',
    parameters: [],
    category: 'utils',
    compliance_level: 'public',
  };

  async execute(input: {
    date?: string | number;
    format?: string;
  }): Promise<string> {
    const date = input.date ? new Date(input.date) : new Date();
    const format = input.format || 'iso';

    switch (format.toLowerCase()) {
      case 'iso':
        return date.toISOString();
      case 'date':
        return date.toDateString();
      case 'time':
        return date.toTimeString();
      case 'locale':
        return date.toLocaleString();
      case 'utc':
        return date.toUTCString();
      case 'unix':
        return Math.floor(date.getTime() / 1000).toString();
      default:
        return date.toISOString();
    }
  }
}

export class GenerateUuidTool extends Tool {
  metadata: ToolMetadata = {
    name: 'generate_uuid',
    description: 'Generate UUID v4',
    parameters: [],
    category: 'utils',
    compliance_level: 'public',
  };

  async execute(): Promise<string> {
    return randomBytes(16)
      .toString('hex')
      .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  }
}

export class RandomNumberTool extends Tool {
  metadata: ToolMetadata = {
    name: 'random_number',
    description: 'Generate random number',
    parameters: [],
    category: 'utils',
    compliance_level: 'public',
  };

  async execute(input: { min?: number; max?: number }): Promise<string> {
    const min = input.min ?? 0;
    const max = input.max ?? 100;
    return randomInt(min, max + 1).toString();
  }
}

export class SleepTool extends Tool {
  metadata: ToolMetadata = {
    name: 'sleep',
    description: 'Delay execution for specified milliseconds',
    parameters: [],
    category: 'utils',
    compliance_level: 'public',
  };

  async execute(input: { milliseconds: number }): Promise<{ slept: number }> {
    const ms = Math.min(input.milliseconds, 60000); // Max 60 seconds
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { slept: ms };
  }
}

export class RegexMatchTool extends Tool {
  metadata: ToolMetadata = {
    name: 'regex_match',
    description: 'Match text against regular expression',
    parameters: [],
    category: 'utils',
    compliance_level: 'public',
  };

  async execute(input: {
    text: string;
    pattern: string;
    flags?: string;
  }): Promise<{ matches: string[]; groups?: any[] }> {
    const regex = new RegExp(input.pattern, input.flags || 'g');
    const matches: string[] = [];
    const groups: any[] = [];

    let match;
    while ((match = regex.exec(input.text)) !== null) {
      matches.push(match[0]);
      if (match.length > 1) {
        groups.push(match.slice(1));
      }
    }

    return { matches, groups: groups.length > 0 ? groups : undefined };
  }
}

export class UrlParseTool extends Tool {
  metadata: ToolMetadata = {
    name: 'url_parse',
    description: 'Parse URL into components',
    parameters: [],
    category: 'utils',
    compliance_level: 'public',
  };

  async execute(input: { url: string }): Promise<any> {
    try {
      const parsed = new URL(input.url);
      return {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        pathname: parsed.pathname,
        search: parsed.search,
        hash: parsed.hash,
        host: parsed.host,
        origin: parsed.origin,
        searchParams: Object.fromEntries(parsed.searchParams.entries()),
      };
    } catch (error) {
      throw new Error(`Invalid URL: ${input.url}`);
    }
  }
}
