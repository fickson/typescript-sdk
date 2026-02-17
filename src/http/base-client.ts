import { NetworkError, ProtocolError } from '../types';

const getFetch = (): typeof fetch => {
  if (typeof globalThis.fetch !== 'undefined') {
    return globalThis.fetch.bind(globalThis);
  }
  throw new Error('fetch is not available. Please use Node.js 18+ or install node-fetch.');
};

export interface HttpClientConfig {
  baseUrl: string;
  timeout?: number;
  retries?: number;
  apiKey?: string;
  authToken?: string;
}

export class HttpClient {
  private baseUrl: string;
  private timeout: number;
  private retries: number;
  private apiKey?: string;
  private authToken?: string;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout ?? 30000;
    this.retries = config.retries ?? 3;
    this.apiKey = config.apiKey;
    this.authToken = config.authToken;
  }

  setAuthToken(token: string): void {
    this.authToken = token;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    let url = this.resolveUrl(path);

    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    const response = await this.fetchWithRetry(url, { method: 'GET' });

    if (!response.ok) {
      throw new ProtocolError(`HTTP ${response.status}: ${response.statusText}`, response.status);
    }

    return response.json();
  }

  async post<T>(path: string, data?: unknown): Promise<T> {
    const url = this.resolveUrl(path);
    const response = await this.fetchWithRetry(url, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new ProtocolError(
        `HTTP ${response.status}: ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`,
        response.status
      );
    }

    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  async put<T>(path: string, data?: unknown): Promise<T> {
    const url = this.resolveUrl(path);
    const response = await this.fetchWithRetry(url, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      throw new ProtocolError(`HTTP ${response.status}: ${response.statusText}`, response.status);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  async delete<T>(path: string): Promise<T> {
    const url = this.resolveUrl(path);
    const response = await this.fetchWithRetry(url, { method: 'DELETE' });

    if (!response.ok) {
      throw new ProtocolError(`HTTP ${response.status}: ${response.statusText}`, response.status);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  private resolveUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    return `${this.baseUrl}${path}`;
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    attempt = 0
  ): Promise<Response> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      };

      if (this.authToken) {
        headers.Authorization = `Bearer ${this.authToken}`;
      }

      if (this.apiKey) {
        headers['X-API-Key'] = this.apiKey;
      }

      const response = await getFetch()(url, {
        ...options,
        signal: controller.signal,
        headers,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      if (attempt < this.retries && this.shouldRetry(error)) {
        await this.delay(2 ** attempt * 1000);
        return this.fetchWithRetry(url, options, attempt + 1);
      }
      throw new NetworkError(`HTTP request failed: ${(error as Error).message}`, error as Error);
    }
  }

  private shouldRetry(error: unknown): boolean {
    const err = error as { name?: string; code?: string };
    if (err.name === 'AbortError') return false;
    if (err.code === 'ECONNRESET') return true;
    if (err.code === 'ETIMEDOUT') return true;
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
