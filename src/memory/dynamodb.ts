import { BaseMemoryStorage, type MemoryMessage } from './base';

type DynamoDBClientType = any;
type DynamoDBDocClientType = any;

export interface DynamoDBConfig {
  tableName: string;
  region?: string;
  endpoint?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  createTable?: boolean;
}

export class DynamoDBStorage extends BaseMemoryStorage {
  private client: DynamoDBClientType | null = null;
  private docClient: DynamoDBDocClientType | null = null;
  private config: DynamoDBConfig;
  private connectionPromise: Promise<void> | null = null;
  private tableReady: boolean = false;

  constructor(config: DynamoDBConfig) {
    super();
    this.config = config;
    this.connectionPromise = this.connect();
  }

  async connect(): Promise<void> {
    if (this._connected) return;
    if (this.connectionPromise && !this._connected) return this.connectionPromise;

    try {
      const { DynamoDBClient, CreateTableCommand, DescribeTableCommand } = await import(
        '@aws-sdk/client-dynamodb'
      );
      const { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand } = await import(
        '@aws-sdk/lib-dynamodb'
      );

      const clientConfig: any = {
        region: this.config.region || process.env.AWS_REGION || 'us-east-1',
      };

      if (this.config.endpoint) {
        clientConfig.endpoint = this.config.endpoint;
      }

      if (this.config.credentials) {
        clientConfig.credentials = this.config.credentials;
      }

      this.client = new DynamoDBClient(clientConfig);
      this.docClient = DynamoDBDocumentClient.from(this.client);

      if (this.config.createTable) {
        await this.ensureTableExists();
      }

      this._connected = true;
    } catch (error) {
      this.connectionPromise = null;
      throw new Error(`Failed to initialize DynamoDB: ${error}`);
    }
  }

  private async ensureTableExists(): Promise<void> {
    if (this.tableReady) return;

    try {
      const { DescribeTableCommand } = await import('@aws-sdk/client-dynamodb');
      await this.client.send(new DescribeTableCommand({ TableName: this.config.tableName }));
      this.tableReady = true;
      return;
    } catch (error: any) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error;
      }
    }

    const { CreateTableCommand } = await import('@aws-sdk/client-dynamodb');
    await this.client.send(
      new CreateTableCommand({
        TableName: this.config.tableName,
        KeySchema: [
          { AttributeName: 'sessionId', KeyType: 'HASH' },
          { AttributeName: 'timestamp', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'sessionId', AttributeType: 'S' },
          { AttributeName: 'timestamp', AttributeType: 'N' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      })
    );

    const { waitUntilTableExists } = await import('@aws-sdk/client-dynamodb');
    await waitUntilTableExists(
      { client: this.client, maxWaitTime: 120 },
      { TableName: this.config.tableName }
    );

    this.tableReady = true;
  }

  private async ensureConnected(): Promise<void> {
    if (!this._connected) {
      await this.connect();
    }
  }

  async add(sessionId: string, message: MemoryMessage): Promise<void> {
    await this.ensureConnected();

    const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
    await this.docClient.send(
      new PutCommand({
        TableName: this.config.tableName,
        Item: {
          sessionId,
          timestamp: message.timestamp,
          role: message.role,
          content: message.content,
          metadata: message.metadata || {},
        },
      })
    );
  }

  async get(sessionId: string, limit?: number): Promise<MemoryMessage[]> {
    await this.ensureConnected();

    const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
    const params: any = {
      TableName: this.config.tableName,
      KeyConditionExpression: 'sessionId = :sid',
      ExpressionAttributeValues: {
        ':sid': sessionId,
      },
      ScanIndexForward: true,
    };

    if (limit) {
      params.Limit = limit;
      params.ScanIndexForward = false;
    }

    const result = await this.docClient.send(new QueryCommand(params));
    const items = result.Items || [];

    const messages = items.map((item: any) => ({
      role: item.role,
      content: item.content,
      timestamp: item.timestamp,
      metadata: item.metadata && Object.keys(item.metadata).length > 0 ? item.metadata : undefined,
    }));

    if (limit) {
      messages.reverse();
    }

    return messages;
  }

  async clear(sessionId: string): Promise<void> {
    await this.ensureConnected();

    const messages = await this.get(sessionId);

    const { DeleteCommand } = await import('@aws-sdk/lib-dynamodb');
    for (const message of messages) {
      await this.docClient.send(
        new DeleteCommand({
          TableName: this.config.tableName,
          Key: {
            sessionId,
            timestamp: message.timestamp,
          },
        })
      );
    }
  }

  async delete(sessionId: string): Promise<void> {
    await this.clear(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    await this.ensureConnected();

    const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.config.tableName,
        KeyConditionExpression: 'sessionId = :sid',
        ExpressionAttributeValues: {
          ':sid': sessionId,
        },
        Limit: 1,
        Select: 'COUNT',
      })
    );

    return (result.Count || 0) > 0;
  }

  async disconnect(): Promise<void> {
    if (this._connected && this.client) {
      this.client.destroy();
      this._connected = false;
      this.connectionPromise = null;
    }
  }
}
