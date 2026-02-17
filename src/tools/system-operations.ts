import * as os from 'os';
import * as path from 'path';
import { Tool, type ToolMetadata } from './base';

export class GetCwdTool extends Tool {
  metadata: ToolMetadata = {
    name: 'get_cwd',
    description: 'Get current working directory',
    parameters: [],
    category: 'system',
    compliance_level: 'public',
  };

  async execute(): Promise<string> {
    return process.cwd();
  }
}

export class GetPlatformTool extends Tool {
  metadata: ToolMetadata = {
    name: 'get_platform',
    description: 'Get system platform information',
    parameters: [],
    category: 'system',
    compliance_level: 'public',
  };

  async execute(): Promise<any> {
    return {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      type: os.type(),
      cpus: os.cpus().length,
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
      hostname: os.hostname(),
      nodeVersion: process.version,
    };
  }
}

export class EnvGetTool extends Tool {
  metadata: ToolMetadata = {
    name: 'env_get',
    description: 'Get environment variable (read-only)',
    parameters: [
      {
        name: 'key',
        type: 'string',
        description: 'Environment variable name',
        required: true,
      },
    ],
    category: 'system',
    compliance_level: 'restricted',
    requires_approval: true,
  };

  async execute(input: { key: string }): Promise<string> {
    this.validate(input as any);

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceApi('env');
    }

    return process.env[input.key] || '';
  }
}

export class EnvSetTool extends Tool {
  metadata: ToolMetadata = {
    name: 'env_set',
    description: 'Set environment variable (DANGEROUS - requires explicit approval)',
    parameters: [
      {
        name: 'key',
        type: 'string',
        description: 'Environment variable name',
        required: true,
      },
      {
        name: 'value',
        type: 'string',
        description: 'Value to set',
        required: true,
      },
    ],
    category: 'system',
    compliance_level: 'restricted',
    requires_approval: true,
  };

  async execute(input: {
    key: string;
    value: string;
  }): Promise<{ set: boolean }> {
    this.validate(input as any);

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceApi('env');
    }

    process.env[input.key] = input.value;
    return { set: true };
  }
}
