import axios, { type AxiosRequestConfig } from 'axios';
import { Tool, type ToolInput, type ToolMetadata } from './base';

export class HttpRequestTool extends Tool {
  metadata: ToolMetadata = {
    name: 'http_request',
    description: 'Make HTTP requests to external APIs',
    parameters: [
      {
        name: 'url',
        type: 'string',
        description: 'The URL to make the request to',
        required: true,
      },
      {
        name: 'method',
        type: 'string',
        description: 'HTTP method (GET, POST, PUT, DELETE)',
        required: false,
        default: 'GET',
      },
      {
        name: 'headers',
        type: 'object',
        description: 'HTTP headers as key-value pairs',
        required: false,
      },
      {
        name: 'body',
        type: 'object',
        description: 'Request body for POST/PUT requests',
        required: false,
      },
    ],
    category: 'network',
    compliance_level: 'internal',
    requires_approval: true,
  };

  async execute(input: ToolInput): Promise<string | object> {
    this.validate(input);

    const url = input.url as string;
    const method = (input.method as string)?.toUpperCase() || 'GET';
    const headers = (input.headers as Record<string, string>) || {};
    const body = input.body;

    if (this.policyEnforcer) {
      try {
        const parsedUrl = new URL(url);
        // Remove trailing colon from protocol (e.g., 'https:' -> 'https')
        const protocol = parsedUrl.protocol.replace(':', '');
        this.policyEnforcer.enforceNetwork(parsedUrl.hostname, protocol);
      } catch (e) {
        if (e instanceof Error && e.message.includes('Invalid URL')) {
          throw new Error(`Invalid URL: ${url}`);
        }
        throw e;
      }
    }

    const config: AxiosRequestConfig = {
      url,
      method,
      headers,
      ...(body && { data: body }),
    };

    try {
      const response = await axios(config);
      return {
        status: response.status,
        headers: response.headers,
        data: response.data,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`HTTP request failed: ${error.response?.status} - ${error.message}`);
      }
      throw new Error(
        `HTTP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
