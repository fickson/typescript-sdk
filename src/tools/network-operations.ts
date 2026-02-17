import { Tool, ToolMetadata } from './base';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';

export class HttpPostTool extends Tool {
  metadata: ToolMetadata = {
    name: 'http_post',
    description: 'Send HTTP POST request',
    parameters: [
      {
        name: 'url',
        type: 'string',
        description: 'URL to send request to',
        required: true,
      },
      {
        name: 'body',
        type: 'object',
        description: 'Request body',
        required: false,
      },
      {
        name: 'headers',
        type: 'object',
        description: 'Request headers',
        required: false,
      },
    ],
    category: 'network',
    compliance_level: 'internal',
    requires_approval: true,
  };

  async execute(input: {
    url: string;
    body?: any;
    headers?: Record<string, string>;
  }): Promise<any> {
    if (this.policyEnforcer) {
      const parsedUrl = new URL(input.url);
      const protocol = parsedUrl.protocol.replace(':', '');
      this.policyEnforcer.enforceNetwork(parsedUrl.hostname, protocol);
    }

    const response = await fetch(input.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...input.headers,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: (() => {
        const h: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          h[k] = v;
        });
        return h;
      })(),
      body: await response.text(),
    };
  }
}

export class HttpPutTool extends Tool {
  metadata: ToolMetadata = {
    name: 'http_put',
    description: 'Send HTTP PUT request',
    parameters: [
      {
        name: 'url',
        type: 'string',
        description: 'URL to send request to',
        required: true,
      },
      {
        name: 'body',
        type: 'object',
        description: 'Request body',
        required: false,
      },
      {
        name: 'headers',
        type: 'object',
        description: 'Request headers',
        required: false,
      },
    ],
    category: 'network',
    compliance_level: 'internal',
    requires_approval: true,
  };

  async execute(input: {
    url: string;
    body?: any;
    headers?: Record<string, string>;
  }): Promise<any> {
    if (this.policyEnforcer) {
      const parsedUrl = new URL(input.url);
      const protocol = parsedUrl.protocol.replace(':', '');
      this.policyEnforcer.enforceNetwork(parsedUrl.hostname, protocol);
    }

    const response = await fetch(input.url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...input.headers,
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: (() => {
        const h: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          h[k] = v;
        });
        return h;
      })(),
      body: await response.text(),
    };
  }
}

export class HttpDeleteTool extends Tool {
  metadata: ToolMetadata = {
    name: 'http_delete',
    description: 'Send HTTP DELETE request',
    parameters: [
      {
        name: 'url',
        type: 'string',
        description: 'URL to send request to',
        required: true,
      },
      {
        name: 'headers',
        type: 'object',
        description: 'Request headers',
        required: false,
      },
    ],
    category: 'network',
    compliance_level: 'internal',
    requires_approval: true,
  };

  async execute(input: { url: string; headers?: Record<string, string> }): Promise<any> {
    if (this.policyEnforcer) {
      const parsedUrl = new URL(input.url);
      const protocol = parsedUrl.protocol.replace(':', '');
      this.policyEnforcer.enforceNetwork(parsedUrl.hostname, protocol);
    }

    const response = await fetch(input.url, {
      method: 'DELETE',
      headers: input.headers,
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: (() => {
        const h: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          h[k] = v;
        });
        return h;
      })(),
      body: await response.text(),
    };
  }
}

export class DownloadFileTool extends Tool {
  metadata: ToolMetadata = {
    name: 'download_file',
    description: 'Download file from URL to local filesystem',
    parameters: [
      {
        name: 'url',
        type: 'string',
        description: 'URL to download from',
        required: true,
      },
      {
        name: 'destination',
        type: 'string',
        description: 'Local file path to save to',
        required: true,
      },
    ],
    category: 'network',
    compliance_level: 'restricted',
    requires_approval: true,
  };

  async execute(input: { url: string; destination: string }): Promise<{
    path: string;
    size: number;
  }> {
    const parsedUrl = new URL(input.url);

    if (this.policyEnforcer) {
      const protocol = parsedUrl.protocol.replace(':', '');
      this.policyEnforcer.enforceNetwork(parsedUrl.hostname, protocol);
      this.policyEnforcer.enforceFilesystem(input.destination, 'write');
    }

    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(input.destination);

      protocol
        .get(input.url, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download: ${response.statusCode}`));
            return;
          }

          response.pipe(file);

          file.on('finish', () => {
            file.close();
            const stats = fs.statSync(input.destination);
            resolve({
              path: input.destination,
              size: stats.size,
            });
          });
        })
        .on('error', (err) => {
          fs.unlinkSync(input.destination);
          reject(err);
        });
    });
  }
}

export class DnsLookupTool extends Tool {
  metadata: ToolMetadata = {
    name: 'dns_lookup',
    description: 'Perform DNS lookup',
    parameters: [],
    category: 'network',
    compliance_level: 'public',
  };

  async execute(input: { hostname: string }): Promise<{ addresses: string[] }> {
    const dns = await import('dns/promises');
    const addresses = await dns.resolve4(input.hostname);
    return { addresses };
  }
}

export class PingTool extends Tool {
  metadata: ToolMetadata = {
    name: 'ping',
    description: 'Ping a host',
    parameters: [],
    category: 'network',
    compliance_level: 'public',
  };

  async execute(input: { host: string; count?: number }): Promise<{
    alive: boolean;
    time?: number;
  }> {
    const startTime = Date.now();

    try {
      // Simple TCP connect test as Node doesn't have native ICMP ping
      const dns = await import('dns/promises');
      await dns.resolve4(input.host);

      return {
        alive: true,
        time: Date.now() - startTime,
      };
    } catch (error) {
      return {
        alive: false,
      };
    }
  }
}
