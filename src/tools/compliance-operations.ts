import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Tool, type ToolMetadata } from './base';

export class AuditLogTool extends Tool {
  metadata: ToolMetadata = {
    name: 'audit_log',
    description: 'Log action for compliance audit trail',
    parameters: [],
    category: 'compliance',
    compliance_level: 'public',
  };

  async execute(input: {
    action: string;
    actor?: string;
    resource?: string;
    metadata?: any;
  }): Promise<{ logged: boolean }> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: input.action,
      actor: input.actor || 'system',
      resource: input.resource,
      metadata: input.metadata,
    };

    // In production, send to logging service
    console.log('[AUDIT]', JSON.stringify(logEntry));
    return { logged: true };
  }
}

export class PiiDetectTool extends Tool {
  metadata: ToolMetadata = {
    name: 'pii_detect',
    description: 'Detect personally identifiable information in text',
    parameters: [],
    category: 'compliance',
    compliance_level: 'public',
  };

  async execute(input: { text: string }): Promise<{
    detected: boolean;
    types: string[];
    matches: any[];
  }> {
    const patterns = {
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      phone: /\b(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
      ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
      creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
      ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    };

    const detected: string[] = [];
    const matches: any[] = [];

    for (const [type, pattern] of Object.entries(patterns)) {
      const found = input.text.match(pattern);
      if (found && found.length > 0) {
        detected.push(type);
        matches.push({ type, count: found.length, samples: found.slice(0, 3) });
      }
    }

    return {
      detected: detected.length > 0,
      types: detected,
      matches,
    };
  }
}

export class EncryptDataTool extends Tool {
  metadata: ToolMetadata = {
    name: 'encrypt_data',
    description: 'Encrypt sensitive data',
    parameters: [],
    category: 'compliance',
    compliance_level: 'public',
  };

  async execute(input: { data: string; key?: string }): Promise<{
    encrypted: string;
    iv: string;
  }> {
    const key = input.key
      ? Buffer.from(createHash('sha256').update(input.key).digest('hex').slice(0, 32))
      : randomBytes(32);

    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);

    let encrypted = cipher.update(input.data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted,
      iv: iv.toString('hex'),
    };
  }
}

export class DecryptDataTool extends Tool {
  metadata: ToolMetadata = {
    name: 'decrypt_data',
    description: 'Decrypt encrypted data (HIGH RISK)',
    parameters: [],
    category: 'compliance',
    compliance_level: 'public',
  };

  async execute(input: {
    encrypted: string;
    iv: string;
    key: string;
  }): Promise<string> {
    const key = Buffer.from(createHash('sha256').update(input.key).digest('hex').slice(0, 32));
    const iv = Buffer.from(input.iv, 'hex');

    const decipher = createDecipheriv('aes-256-cbc', key, iv);

    let decrypted = decipher.update(input.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
