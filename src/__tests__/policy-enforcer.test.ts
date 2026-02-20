import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyEnforcer } from '../policy-enforcer';
import { PolicyViolationError } from '../types';
import type { ActivePolicy } from '../policy';

describe('PolicyEnforcer', () => {
  let mockPolicy: ActivePolicy;

  beforeEach(() => {
    mockPolicy = {
      policy_id: 'test-policy',
      workspace_id: 'test-workspace',
      version: '1.0.0',
      status: 'active',
      hash: 'abc123',
      content: {
        agent: {
          models: {
            allowed_models: ['gpt-4', 'gpt-3.5-turbo'],
            blocked_models: ['gpt-4-32k'],
          },
        },
        tools: {
          allowed_tools: [
            { name: 'calculator', description: 'Math tool' },
            { name: 'web_search', description: 'Search tool' },
          ],
          blocked_tools: ['exec_command', 'file_delete'],
        },
        permissions: {
          network: {
            enabled: true,
            require_tls: true,
            allowed_domains: ['api.openai.com', '*.example.com'],
            blocked_domains: ['malicious.com'],
          },
          filesystem: {
            enabled: true,
            allowed_paths: ['/tmp/*', '/home/user/data'],
            blocked_paths: ['/etc/*', '/root/*'],
            allowed_extensions: ['.txt', '.json', '.csv'],
          },
          api: {
            enabled: true,
            allowed_services: [
              { service_name: 'openai', endpoints: ['chat', 'completions'] },
              { service_name: 'stripe', endpoints: ['payments'] },
            ],
          },
        },
        rate_limits: {
          per_agent: {
            requests_per_minute: 60,
            tokens_per_hour: 100000,
          },
        },
      },
    };
  });

  describe('enforceModel', () => {
    it('should allow whitelisted models', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceModel('gpt-4')).not.toThrow();
      expect(() => enforcer.enforceModel('gpt-3.5-turbo')).not.toThrow();
    });

    it('should block non-whitelisted models', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceModel('claude-3-opus')).toThrow(PolicyViolationError);
      expect(() => enforcer.enforceModel('claude-3-opus')).toThrow(
        /Model claude-3-opus is not allowed/
      );
    });

    it('should block explicitly blocked models', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceModel('gpt-4-32k')).toThrow(PolicyViolationError);
      expect(() => enforcer.enforceModel('gpt-4-32k')).toThrow(
        /Model gpt-4-32k is (blocked|not allowed)/
      );
    });

    it('should allow any model when no restrictions defined', () => {
      const policyNoRestrictions = {
        ...mockPolicy,
        content: { agent: {} },
      };
      const enforcer = new PolicyEnforcer(policyNoRestrictions);
      expect(() => enforcer.enforceModel('any-model')).not.toThrow();
    });

    it('should respect override mode', () => {
      const enforcer = new PolicyEnforcer(mockPolicy, true);
      expect(() => enforcer.enforceModel('claude-3-opus')).not.toThrow();
    });
  });

  describe('enforceTool', () => {
    it('should allow whitelisted tools', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceTool('calculator')).not.toThrow();
      expect(() => enforcer.enforceTool('web_search')).not.toThrow();
    });

    it('should block non-whitelisted tools', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceTool('database_query')).toThrow(PolicyViolationError);
      expect(() => enforcer.enforceTool('database_query')).toThrow(
        /Tool database_query is not in the allowlist/
      );
    });

    it('should block explicitly blocked tools', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceTool('exec_command')).toThrow(PolicyViolationError);
      expect(() => enforcer.enforceTool('file_delete')).toThrow(PolicyViolationError);
      expect(() => enforcer.enforceTool('exec_command')).toThrow(/Tool exec_command is blocked/);
    });

    it('should allow any tool when no restrictions defined', () => {
      const policyNoRestrictions = {
        ...mockPolicy,
        content: {},
      };
      const enforcer = new PolicyEnforcer(policyNoRestrictions);
      expect(() => enforcer.enforceTool('any-tool')).not.toThrow();
    });

    it('should support category wildcard policies used by generated sekuire.yml', () => {
      const wildcardPolicy = {
        ...mockPolicy,
        content: {
          tools: {
            allowed_tools: [
              { name: 'network:*', description: 'Network tools' },
              { name: 'data:*', description: 'Data tools' },
              { name: 'system:*', description: 'System tools' },
            ],
          },
        },
      };

      const enforcer = new PolicyEnforcer(wildcardPolicy);

      expect(() => enforcer.enforceTool('http_post')).not.toThrow();
      expect(() => enforcer.enforceTool('web_search')).not.toThrow();
      expect(() => enforcer.enforceTool('download_file')).not.toThrow();
      expect(() => enforcer.enforceTool('dns_lookup')).not.toThrow();
      expect(() => enforcer.enforceTool('ping')).not.toThrow();

      expect(() => enforcer.enforceTool('json_parse')).not.toThrow();
      expect(() => enforcer.enforceTool('csv_parse')).not.toThrow();
      expect(() => enforcer.enforceTool('base64_encode')).not.toThrow();
      expect(() => enforcer.enforceTool('hash')).not.toThrow();

      expect(() => enforcer.enforceTool('env_get')).not.toThrow();
      expect(() => enforcer.enforceTool('get_cwd')).not.toThrow();
      expect(() => enforcer.enforceTool('get_platform')).not.toThrow();

      expect(() => enforcer.enforceTool('file_read')).toThrow(PolicyViolationError);
    });
  });

  describe('enforceNetwork', () => {
    it('should allow HTTPS requests to whitelisted domains', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceNetwork('api.openai.com', 'https')).not.toThrow();
    });

    it('should allow wildcard domain matches', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceNetwork('subdomain.example.com', 'https')).not.toThrow();
      expect(() => enforcer.enforceNetwork('deep.nested.example.com', 'https')).not.toThrow();
    });

    it('should block HTTP when TLS is required', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceNetwork('api.openai.com', 'http')).toThrow(PolicyViolationError);
      expect(() => enforcer.enforceNetwork('api.openai.com', 'http')).toThrow(
        /TLS is required for network requests/
      );
    });

    it('should block non-whitelisted domains', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceNetwork('api.anthropic.com', 'https')).toThrow(
        PolicyViolationError
      );
      expect(() => enforcer.enforceNetwork('api.anthropic.com', 'https')).toThrow(
        /Domain api.anthropic.com is not in the allowlist/
      );
    });

    it('should block explicitly blocked domains', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceNetwork('malicious.com', 'https')).toThrow(PolicyViolationError);
      expect(() => enforcer.enforceNetwork('malicious.com', 'https')).toThrow(
        /Domain malicious.com is blocked by policy/
      );
    });

    it('should block when network is disabled', () => {
      const policyNetworkDisabled = {
        ...mockPolicy,
        content: {
          ...mockPolicy.content,
          permissions: {
            ...mockPolicy.content.permissions,
            network: { enabled: false },
          },
        },
      };
      const enforcer = new PolicyEnforcer(policyNetworkDisabled);
      expect(() => enforcer.enforceNetwork('api.openai.com', 'https')).toThrow(
        PolicyViolationError
      );
      expect(() => enforcer.enforceNetwork('api.openai.com', 'https')).toThrow(
        /Network access is disabled/
      );
    });
  });

  describe('enforceFilesystem', () => {
    it('should allow access to whitelisted paths', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceFilesystem('/tmp/test.txt', 'read')).not.toThrow();
      expect(() => enforcer.enforceFilesystem('/home/user/data', 'write')).not.toThrow();
    });

    it('should handle wildcard path matching', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceFilesystem('/tmp/subdir/file.txt', 'read')).not.toThrow();
    });

    it('should block access to non-whitelisted paths', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceFilesystem('/var/log/app.log', 'read')).toThrow(
        PolicyViolationError
      );
      expect(() => enforcer.enforceFilesystem('/var/log/app.log', 'read')).toThrow(
        /Path \/var\/log\/app.log is not in the allowlist/
      );
    });

    it('should block explicitly blocked paths', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceFilesystem('/etc/passwd', 'read')).toThrow(PolicyViolationError);
      expect(() => enforcer.enforceFilesystem('/root/secret.key', 'read')).toThrow(
        PolicyViolationError
      );
    });

    it('should enforce allowed file extensions', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceFilesystem('/tmp/test.txt', 'read')).not.toThrow();
      expect(() => enforcer.enforceFilesystem('/tmp/data.json', 'read')).not.toThrow();
      expect(() => enforcer.enforceFilesystem('/tmp/script.sh', 'read')).toThrow(
        PolicyViolationError
      );
      expect(() => enforcer.enforceFilesystem('/tmp/script.sh', 'read')).toThrow(
        /Extension .sh is not allowed/
      );
    });

    it('should block when filesystem is disabled', () => {
      const policyFsDisabled = {
        ...mockPolicy,
        content: {
          ...mockPolicy.content,
          permissions: {
            ...mockPolicy.content.permissions,
            filesystem: { enabled: false },
          },
        },
      };
      const enforcer = new PolicyEnforcer(policyFsDisabled);
      expect(() => enforcer.enforceFilesystem('/tmp/test.txt', 'read')).toThrow(
        PolicyViolationError
      );
      expect(() => enforcer.enforceFilesystem('/tmp/test.txt', 'read')).toThrow(
        /Filesystem access is disabled/
      );
    });
  });

  describe('enforceApi', () => {
    it('should allow whitelisted API services', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceApi('openai')).not.toThrow();
      expect(() => enforcer.enforceApi('stripe')).not.toThrow();
    });

    it('should block non-whitelisted API services', () => {
      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceApi('aws')).toThrow(PolicyViolationError);
      expect(() => enforcer.enforceApi('aws')).toThrow(/API service aws is not in the allowlist/);
    });

    it('should block when API access is disabled', () => {
      const policyApiDisabled = {
        ...mockPolicy,
        content: {
          ...mockPolicy.content,
          permissions: {
            ...mockPolicy.content.permissions,
            api: { enabled: false },
          },
        },
      };
      const enforcer = new PolicyEnforcer(policyApiDisabled);
      expect(() => enforcer.enforceApi('openai')).toThrow(PolicyViolationError);
      expect(() => enforcer.enforceApi('openai')).toThrow(/API access is disabled/);
    });
  });

  describe('violation callback', () => {
    it('should invoke callback on violation', () => {
      const violations: Array<{ rule: string; reason: string }> = [];
      const onViolation = (rule: string, reason: string) => {
        violations.push({ rule, reason });
      };

      const enforcer = new PolicyEnforcer(mockPolicy, false, onViolation);

      try {
        enforcer.enforceModel('claude-3-opus');
      } catch (e) {
        // Expected to throw
      }

      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('model.not_allowed');
      expect(violations[0].reason).toContain('claude-3-opus');
    });

    it('should invoke callback in override mode without throwing', () => {
      const violations: Array<{ rule: string; reason: string }> = [];
      const onViolation = (rule: string, reason: string) => {
        violations.push({ rule, reason });
      };

      const enforcer = new PolicyEnforcer(mockPolicy, true, onViolation);

      expect(() => enforcer.enforceModel('claude-3-opus')).not.toThrow();
      expect(violations).toHaveLength(1);
      expect(violations[0].rule).toBe('model.not_allowed');
    });
  });

  describe('environment variable override', () => {
    it('should respect SEKUIRE_POLICY_DEV_OVERRIDE env var', () => {
      const originalEnv = process.env.SEKUIRE_POLICY_DEV_OVERRIDE;
      process.env.SEKUIRE_POLICY_DEV_OVERRIDE = 'true';

      const enforcer = new PolicyEnforcer(mockPolicy);
      expect(() => enforcer.enforceModel('claude-3-opus')).not.toThrow();

      if (originalEnv !== undefined) {
        process.env.SEKUIRE_POLICY_DEV_OVERRIDE = originalEnv;
      } else {
        delete process.env.SEKUIRE_POLICY_DEV_OVERRIDE;
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty policy gracefully', () => {
      const emptyPolicy = {
        ...mockPolicy,
        content: {},
      };
      const enforcer = new PolicyEnforcer(emptyPolicy);

      expect(() => enforcer.enforceModel('any-model')).not.toThrow();
      expect(() => enforcer.enforceTool('any-tool')).not.toThrow();
    });

    it('should handle wildcard domain correctly', () => {
      const wildcardPolicy = {
        ...mockPolicy,
        content: {
          ...mockPolicy.content,
          permissions: {
            network: {
              enabled: true,
              require_tls: false,
              allowed_domains: ['*'],
            },
          },
        },
      };
      const enforcer = new PolicyEnforcer(wildcardPolicy);
      expect(() => enforcer.enforceNetwork('any-domain.com', 'http')).not.toThrow();
    });

    it('should handle missing permissions gracefully', () => {
      const policyNoPerms = {
        ...mockPolicy,
        content: {
          agent: {},
          tools: {},
          permissions: {},
        },
      };
      const enforcer = new PolicyEnforcer(policyNoPerms);

      // Should warn but not throw
      expect(() => enforcer.enforceNetwork('api.openai.com', 'https')).not.toThrow();
      expect(() => enforcer.enforceFilesystem('/tmp/test.txt', 'read')).not.toThrow();
      expect(() => enforcer.enforceApi('openai')).not.toThrow();
    });
  });
});
