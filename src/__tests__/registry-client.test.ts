import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SekuireCrypto } from '../crypto';
import {
  createRegistryClient,
  SekuireRegistryClient,
  type PublishAgentOptions,
} from '../registry-client';
import { ProtocolError } from '../types';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const createMockResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
});

describe('SekuireRegistryClient', () => {
  let client: SekuireRegistryClient;
  const apiUrl = 'http://localhost:9300';
  const authToken = 'test-auth-token';

  beforeEach(() => {
    vi.clearAllMocks();
    client = new SekuireRegistryClient({ apiUrl }, authToken);
  });

  describe('constructor', () => {
    it('should accept string URL', () => {
      const c = createRegistryClient('http://example.com');
      expect(c).toBeInstanceOf(SekuireRegistryClient);
    });

    it('should accept config object', () => {
      const c = new SekuireRegistryClient({
        apiUrl: 'http://example.com',
        timeout: 5000,
        retries: 2,
      });
      expect(c).toBeInstanceOf(SekuireRegistryClient);
    });
  });

  describe('publishAgent', () => {
    it('should publish an agent with correct payload', async () => {
      const keyPair = SekuireCrypto.generateKeyPair();

      const options: PublishAgentOptions = {
        manifest: {
          project: {
            name: 'test-agent',
            version: '1.0.0',
            authors: ['Test Author'],
          },
          identity: {
            model: 'gpt-4',
            systemPromptPath: 'system.md',
            toolsPath: 'tools.json',
          },
        },
        privateKeyHex: keyPair.privateKey,
        systemPrompt: 'You are a helpful assistant.',
        tools: '[]',
      };

      const mockResponse = {
        sekuireId: 'abc123',
        name: 'test-agent',
        version: '1.0.0',
        verificationStatus: 'unverified',
        createdAt: '2024-01-15T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.publishAgent(options);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, fetchOptions] = mockFetch.mock.calls[0];
      expect(url).toBe(`${apiUrl}/api/v1/publish`);
      expect(fetchOptions.method).toBe('POST');
      expect(fetchOptions.headers).toHaveProperty('Authorization', `Bearer ${authToken}`);

      const body = JSON.parse(fetchOptions.body);
      expect(body.manifest).toEqual(options.manifest);
      expect(body.sekuireId).toBeDefined();
      expect(body.signature).toBeDefined();
      expect(body.publicKey).toBeDefined();
      expect(body.visibility).toBe('public');

      expect(result).toEqual(mockResponse);
    });

    it('should include publisherOrgId when provided', async () => {
      const keyPair = SekuireCrypto.generateKeyPair();

      const options: PublishAgentOptions = {
        manifest: {
          project: {
            name: 'test-agent',
            version: '1.0.0',
            authors: ['Test Author'],
          },
          identity: {
            model: 'gpt-4',
            systemPromptPath: 'system.md',
            toolsPath: 'tools.json',
          },
        },
        privateKeyHex: keyPair.privateKey,
        systemPrompt: 'You are a helpful assistant.',
        tools: '[]',
        publisherOrgId: 'org-123',
        visibility: 'private',
      };

      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          sekuireId: 'abc123',
          name: 'test-agent',
          version: '1.0.0',
          verificationStatus: 'unverified',
          createdAt: '2024-01-15T00:00:00Z',
        })
      );

      await client.publishAgent(options);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.publisherOrgId).toBe('org-123');
      expect(body.visibility).toBe('private');
    });
  });

  describe('getAgent', () => {
    it('should fetch agent by sekuireId', async () => {
      const mockAgent = {
        sekuireId: 'abc123',
        name: 'test-agent',
        version: '1.0.0',
        authorKey: 'deadbeef'.repeat(8),
        createdAt: '2024-01-15T00:00:00Z',
        verificationStatus: 'verified',
        reputationScore: 85,
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockAgent));

      const result = await client.getAgent('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/agents/abc123`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(mockAgent);
    });

    it('should throw ProtocolError on 404', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, 404));

      await expect(client.getAgent('nonexistent')).rejects.toThrow(ProtocolError);
    });
  });

  describe('updateAgent', () => {
    it('should update agent with partial manifest', async () => {
      const mockAgent = {
        sekuireId: 'abc123',
        name: 'updated-agent',
        version: '1.1.0',
        authorKey: 'deadbeef'.repeat(8),
        createdAt: '2024-01-15T00:00:00Z',
        verificationStatus: 'verified',
        reputationScore: 85,
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockAgent));

      const result = await client.updateAgent('abc123', {
        visibility: 'internal',
        gitRepository: 'https://github.com/example/repo',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/agents/abc123`,
        expect.objectContaining({ method: 'PUT' })
      );
      expect(result).toEqual(mockAgent);
    });
  });

  describe('deleteAgent', () => {
    it('should delete agent by sekuireId', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await client.deleteAgent('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/agents/abc123/delete`,
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('listAgents', () => {
    it('should list agents without filters', async () => {
      const mockResponse = {
        agents: [
          { sekuireId: 'abc123', name: 'agent-1' },
          { sekuireId: 'def456', name: 'agent-2' },
        ],
      };

      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.listAgents();

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/agents`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toHaveLength(2);
    });

    it('should apply search filters', async () => {
      const mockResponse = { agents: [] };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      await client.listAgents({
        query: 'test',
        tags: ['ai', 'assistant'],
        verificationStatus: 'verified',
        limit: 10,
        offset: 20,
      });

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('q=test');
      expect(url).toContain('tags=ai%2Cassistant');
      expect(url).toContain('verification_status=verified');
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=20');
    });
  });

  describe('searchAgents', () => {
    it('should search agents by query', async () => {
      const mockResponse = {
        agents: [{ sekuireId: 'abc123', name: 'search-result' }],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.searchAgents('assistant');

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('q=assistant');
      expect(result).toHaveLength(1);
    });
  });

  describe('getMyAgents', () => {
    it('should fetch agents owned by current user', async () => {
      const mockResponse = {
        agents: [
          { sekuireId: 'my-agent-1', name: 'My Agent 1' },
          { sekuireId: 'my-agent-2', name: 'My Agent 2' },
        ],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResponse));

      const result = await client.getMyAgents();

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/agents/me`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toHaveLength(2);
    });
  });

  describe('getReputation', () => {
    it('should fetch reputation for an agent', async () => {
      const mockReputation = {
        score: 85,
        taskCount: 150,
        verificationBadge: 'HIPAA',
        recentLogs: [{ id: 'log-1', taskHash: 'hash1', rating: 5 }],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockReputation));

      const result = await client.getReputation('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/agents/abc123/reputation`,
        expect.objectContaining({ method: 'GET' })
      );
      expect(result.score).toBe(85);
    });
  });

  describe('recordTaskCompletion', () => {
    it('should record task completion with signature', async () => {
      const keyPair = SekuireCrypto.generateKeyPair();
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await client.recordTaskCompletion(
        'abc123',
        {
          taskId: 'task-1',
          taskHash: 'hash123',
          rating: 5,
          comment: 'Great work!',
        },
        keyPair.privateKey
      );

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/tasks/complete`,
        expect.objectContaining({ method: 'POST' })
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.sekuireId).toBe('abc123');
      expect(body.taskHash).toBe('hash123');
      expect(body.rating).toBe(5);
      expect(body.signature).toBeDefined();
    });
  });

  describe('getLeaderboard', () => {
    it('should fetch leaderboard with default limit', async () => {
      const mockLeaderboard = {
        entries: [{ sekuireId: 'top-1', name: 'Top Agent', rank: 1, reputationScore: 98 }],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockLeaderboard));

      const result = await client.getLeaderboard();

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('limit=10');
      expect(result).toHaveLength(1);
    });

    it('should respect custom limit', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ entries: [] }));

      await client.getLeaderboard(25);

      const url = mockFetch.mock.calls[0][0];
      expect(url).toContain('limit=25');
    });
  });

  describe('fileDispute', () => {
    it('should file a dispute', async () => {
      const mockDispute = {
        id: 'dispute-1',
        sekuireId: 'bad-agent',
        status: 'pending',
        createdAt: '2024-01-15T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockDispute));

      const result = await client.fileDispute(
        'bad-agent',
        'Agent provided false information',
        'evidence-log-content',
        'accuser-123'
      );

      expect(result.id).toBe('dispute-1');
      expect(result.status).toBe('pending');
    });
  });

  describe('verification', () => {
    it('should perform quick verification', async () => {
      const mockResult = {
        passed: true,
        securityScore: 85,
        complianceScore: 78,
        issues: [],
        timestamp: '2024-01-15T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResult));

      const result = await client.verifyAgentQuick('abc123');

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/verify-agent`,
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.passed).toBe(true);
    });

    it('should perform comprehensive verification (Bar Exam)', async () => {
      const mockResult = {
        passed: true,
        securityScore: 92,
        complianceScore: 88,
        issues: [{ severity: 'low', category: 'documentation', message: 'Missing README' }],
        timestamp: '2024-01-15T00:00:00Z',
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResult));

      const result = await client.verifyAgentComprehensive({
        sekuireId: 'abc123',
        repositoryUrl: 'https://github.com/example/repo',
        commitHash: 'abc123def',
        complianceFramework: 'HIPAA',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/agents/verify/comprehensive`,
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.passed).toBe(true);
      expect(result.issues).toHaveLength(1);
    });

    it('should get verification history', async () => {
      const mockHistory = {
        verifications: [
          { passed: true, securityScore: 92, timestamp: '2024-01-15T00:00:00Z' },
          { passed: false, securityScore: 65, timestamp: '2024-01-10T00:00:00Z' },
        ],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockHistory));

      const result = await client.getVerificationHistory('abc123');

      expect(result).toHaveLength(2);
    });

    it('should return null for non-existent latest verification', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, 404));

      const result = await client.getLatestVerification('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('trust protocol', () => {
    it('should generate trust headers', async () => {
      const mockHeaders = {
        'X-Sekuire-Agent-ID': 'abc123',
        'X-Sekuire-Reputation': '85',
        'X-Sekuire-Verification': 'verified',
        'X-Sekuire-Badges': 'HIPAA,SOC2',
        'X-Sekuire-Timestamp': '2024-01-15T00:00:00Z',
        'X-Sekuire-Signature': 'sig123',
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockHeaders));

      const result = await client.generateTrustHeaders({
        agentId: 'abc123',
        action: 'read',
        context: { resource: 'file.txt' },
      });

      expect(result['X-Sekuire-Agent-ID']).toBe('abc123');
    });

    it('should get trust profile', async () => {
      const mockProfile = {
        did: 'did:sekuire:abc123',
        reputationScore: 85,
        verificationStatus: 'verified',
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockProfile));

      const result = await client.getTrustProfile('did:sekuire:abc123');

      expect(result).toHaveProperty('did');
    });
  });

  describe('task management', () => {
    it('should create a task', async () => {
      const mockTask = {
        taskId: 'task-123',
        status: 'pending',
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockTask));

      const result = await client.createTask({
        description: 'Analyze data',
        capabilities: ['data:analysis'],
        priority: 1,
      });

      expect(result.taskId).toBe('task-123');
    });

    it('should get task status', async () => {
      const mockTask = {
        taskId: 'task-123',
        status: 'completed',
        result: { analysis: 'complete' },
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockTask));

      const result = await client.getTask('task-123');

      expect(result.status).toBe('completed');
    });

    it('should complete a task with signature', async () => {
      const keyPair = SekuireCrypto.generateKeyPair();
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await client.completeTask('task-123', { analysis: 'done' }, keyPair.privateKey);

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/tasks/task-123/complete`,
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('registry stats and categories', () => {
    it('should get registry stats', async () => {
      const mockStats = {
        totalAgents: 1000,
        verifiedAgents: 500,
        totalTasks: 50000,
        categories: ['ai', 'data', 'automation'],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockStats));

      const result = await client.getRegistryStats();

      expect(result.totalAgents).toBe(1000);
    });

    it('should get categories', async () => {
      const mockCategories = [
        { slug: 'ai', name: 'AI Assistants', agentCount: 200 },
        { slug: 'data', name: 'Data Processing', agentCount: 150 },
      ];
      mockFetch.mockResolvedValueOnce(createMockResponse(mockCategories));

      const result = await client.getCategories();

      expect(result).toHaveLength(2);
    });

    it('should get agents by category', async () => {
      const mockAgents = {
        agents: [{ sekuireId: 'ai-agent-1', name: 'AI Agent 1' }],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockAgents));

      const result = await client.getAgentsByCategory('ai');

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/categories/ai/agents`,
        expect.anything()
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('policy management', () => {
    it('should get workspace policies', async () => {
      const mockPolicies = {
        policies: [{ id: 'policy-1', name: 'Default Policy' }],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockPolicies));

      const result = await client.getWorkspacePolicies('workspace-123');

      expect(result).toHaveLength(1);
    });

    it('should get active policy', async () => {
      const mockPolicy = {
        id: 'policy-1',
        name: 'Active Policy',
        rules: [],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockPolicy));

      const result = await client.getActivePolicy('workspace-123');

      expect(result).toHaveProperty('id');
    });

    it('should get policy templates', async () => {
      const mockTemplates = {
        templates: [
          { id: 'hipaa', name: 'HIPAA Compliance' },
          { id: 'soc2', name: 'SOC2 Type II' },
        ],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockTemplates));

      const result = await client.getPolicyTemplates();

      expect(result).toHaveLength(2);
    });

    it('should evaluate policy', async () => {
      const mockResult = {
        allowed: true,
        violations: [],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockResult));

      const result = await client.evaluatePolicy('workspace-123', {
        type: 'file:read',
        resource: '/data/report.csv',
        context: { user: 'user-123' },
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('agent logging', () => {
    it('should log events batch', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await client.logAgentEvents('abc123', [
        { type: 'tool_execution', severity: 'info', data: { tool: 'search' } },
        { type: 'model_call', severity: 'info', data: { model: 'gpt-4' } },
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/agents/abc123/logs/batch`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should log health status', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}));

      await client.logAgentHealth('abc123', {
        status: 'healthy',
        uptime: 3600,
        memoryMb: 256,
        cpuPercent: 15,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        `${apiUrl}/api/v1/agents/abc123/logs/health`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should get agent logs with filters', async () => {
      const mockLogs = {
        logs: [{ type: 'tool_execution', timestamp: '2024-01-15T00:00:00Z' }],
      };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockLogs));

      const result = await client.getAgentLogs('abc123', {
        limit: 50,
        type: 'tool_execution',
      });

      expect(result).toHaveLength(1);
    });
  });

  describe('authentication', () => {
    it('should include auth header in requests', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ agents: [] }));

      await client.listAgents();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe(`Bearer ${authToken}`);
    });

    it('should allow setting auth token after construction', async () => {
      const noAuthClient = new SekuireRegistryClient({ apiUrl });
      noAuthClient.setAuthToken('new-token');

      mockFetch.mockResolvedValueOnce(createMockResponse({ agents: [] }));

      await noAuthClient.listAgents();

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer new-token');
    });
  });

  describe('error handling', () => {
    it('should throw ProtocolError on HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ error: 'Unauthorized' }, 401));

      await expect(client.getAgent('abc123')).rejects.toThrow(ProtocolError);
    });

    it('should include status code in ProtocolError', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, 403));

      try {
        await client.getAgent('abc123');
      } catch (error) {
        expect(error).toBeInstanceOf(ProtocolError);
        expect((error as ProtocolError).statusCode).toBe(403);
      }
    });
  });
});
