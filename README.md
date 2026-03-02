# @sekuire/sdk

TypeScript SDK for building governed AI agents. Reference implementation of the [Open Agent Governance Specification (OAGS)](https://github.com/sekuire/oags).

```bash
npm install @sekuire/sdk
```

```typescript
import { getAgent } from '@sekuire/sdk';

const agent = await getAgent();
const response = await agent.chat('What is the capital of France?');
console.log(response);
```

No account required. No Sekuire environment variables. Just your LLM provider API key.

---

## Quick Start

### 1. Create `sekuire.yml`

```yaml
project:
  name: my-agent
  version: 1.0.0

agent:
  name: Assistant
  system_prompt: ./system_prompt.md
  tools: ./tools.json
  llm:
    provider: openai
    model: gpt-4o
    api_key_env: OPENAI_API_KEY
    temperature: 0.7
  memory:
    type: buffer
    max_messages: 20
```

### 2. Create `system_prompt.md`

```
You are a helpful assistant.
```

### 3. Create `tools.json`

```json
{ "version": "1.0", "tools": [] }
```

### 4. Run

```bash
export OPENAI_API_KEY="sk-..."
npx tsx agent.ts
```

```typescript
// agent.ts
import { getAgent } from '@sekuire/sdk';

const agent = await getAgent();
const response = await agent.chat('Hello!');
console.log(response);
```

That is it. The agent runs entirely locally with zero network dependency on Sekuire.

---

## Add Governance

Policy enforcement runs locally inside the SDK - no network calls, no platform dependency.

### Add policies to `sekuire.yml`

```yaml
project:
  name: my-agent
  version: 1.0.0

agent:
  name: Assistant
  system_prompt: ./system_prompt.md
  tools: ./tools.json
  llm:
    provider: openai
    model: gpt-4o
    api_key_env: OPENAI_API_KEY
  models:
    allowed_models:
      - gpt-4o
      - gpt-4o-mini
  toolsets:
    allowed_tools:
      - name: "files:*"
      - name: calculator
    blocked_tools:
      - env_read

permissions:
  network:
    enabled: true
    require_tls: true
    allowed_domains:
      - "api.openai.com"
      - "*.example.com"
    blocked_domains:
      - "*.malicious.com"
  filesystem:
    enabled: true
    allowed_paths:
      - "./data/*"
      - "/tmp/*"
    blocked_paths:
      - "/etc/*"
      - "~/.ssh/*"
    allowed_extensions:
      - .txt
      - .json
      - .csv

rate_limits:
  per_agent:
    requests_per_minute: 30
    tokens_per_hour: 100000
```

The `PolicyEnforcer` evaluates every LLM call, tool invocation, network request, and filesystem access against these rules at runtime. Violations throw a `PolicyViolationError`.

```typescript
import { getAgent } from '@sekuire/sdk';

const agent = await getAgent();

// This works - calculator is in the allowlist
const result = await agent.chat('What is 42 * 17?');

// Tool calls to env_read will be blocked by policy
// Network requests to blocked domains will be rejected
// Only allowed models can be used
```

You can also use the `PolicyEnforcer` directly without an agent:

```typescript
import { PolicyEnforcer } from '@sekuire/sdk';
import type { ActivePolicy } from '@sekuire/sdk';

const policy: ActivePolicy = {
  policy_id: 'my-policy',
  workspace_id: 'local',
  version: '1.0.0',
  status: 'active',
  hash: 'local',
  content: {
    tools: {
      allowed_tools: [{ name: 'calculator' }],
      blocked_tools: ['shell_exec'],
    },
    permissions: {
      network: {
        enabled: true,
        require_tls: true,
        allowed_domains: ['api.openai.com'],
        blocked_domains: ['evil.com'],
      },
    },
  },
};

const enforcer = new PolicyEnforcer(policy);

enforcer.enforceTool('calculator');       // OK
enforcer.enforceTool('shell_exec');       // throws PolicyViolationError
enforcer.enforceNetwork('evil.com', 'https'); // throws PolicyViolationError
```

See the [policy enforcement example](./examples/standalone/policy-enforcement/) for a full runnable demo.

---

## Upgrade to Platform

When you are ready for cloud audit logs, fleet management, and agent registry, add one environment variable:

```bash
export SEKUIRE_INSTALL_TOKEN="skt_..."   # from dashboard or CLI
export SEKUIRE_AGENT_ID="your-agent-id"
```

```typescript
import { SekuireSDK } from '@sekuire/sdk';

const sdk = SekuireSDK.fromEnv();
await sdk.start();

sdk.log('tool_execution', { tool: 'calculator', input: '42 * 17' });

const allowed = await sdk.checkPolicy('read_file', { path: '/data/report.csv' });

await sdk.shutdown();
```

Everything that worked in standalone mode continues to work. The platform adds:

- Cloud audit logs: centralized event stream across all agent instances
- Fleet management: heartbeat monitoring, deployment tracking
- Agent registry: publish and discover agents
- Trust scores: reputation system for agent-to-agent interactions
- Workspace policies: remote policy distribution and enforcement
- A2A orchestration: task delegation across agents via the mesh

---

## Configuration Reference

The `sekuire.yml` file supports both single-agent and multi-agent configurations.

### Single agent

```yaml
project:
  name: my-agent
  version: 1.0.0

agent:
  name: Assistant
  system_prompt: ./prompts/system.md    # path to prompt file
  tools: ./tools.json                   # path to tools schema
  llm:
    provider: openai                    # openai | anthropic | google | ollama
    model: gpt-4o
    api_key_env: OPENAI_API_KEY         # env var name containing the API key
    temperature: 0.7
    max_tokens: 4096
    base_url: http://localhost:11434    # optional, for Ollama or custom endpoints
  memory:
    type: buffer                        # buffer | redis | postgres | sqlite | ...
    max_messages: 20
  models:
    allowed_models: [gpt-4o, gpt-4o-mini]
    blocked_models: []
  toolsets:
    allowed_tools:
      - name: "files:*"
      - name: calculator
    blocked_tools: [env_read]

permissions:
  network:
    enabled: true
    require_tls: true
    allowed_domains: ["api.openai.com"]
    blocked_domains: ["*.malicious.com"]
  filesystem:
    enabled: true
    allowed_paths: ["./data/*"]
    blocked_paths: ["/etc/*"]
    allowed_extensions: [.txt, .json]

rate_limits:
  per_agent:
    requests_per_minute: 30
    tokens_per_hour: 100000
```

### Multi-agent

```yaml
project:
  name: my-project
  version: 1.0.0

agents:
  researcher:
    name: Research Agent
    system_prompt: ./prompts/researcher.md
    tools: ./tools.json
    llm:
      provider: anthropic
      model: claude-sonnet-4-20250514
      api_key_env: ANTHROPIC_API_KEY

  writer:
    name: Writing Agent
    system_prompt: ./prompts/writer.md
    tools: ./tools.json
    llm:
      provider: openai
      model: gpt-4o
      api_key_env: OPENAI_API_KEY
```

Environment variable interpolation is supported: `${VAR}` or `${VAR:-default}`.

---

## Multi-Provider Support

The SDK supports four LLM providers. Set the `provider` field in your config and install the corresponding peer dependency.

| Provider | `provider` value | Peer dependency | API key env var |
|---|---|---|---|
| OpenAI | `openai` | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` |
| Google Gemini | `google` | `@google/genai` | `GOOGLE_API_KEY` |
| Ollama (local) | `ollama` | none | none (set `base_url`) |

```yaml
# Anthropic example
agent:
  llm:
    provider: anthropic
    model: claude-sonnet-4-20250514
    api_key_env: ANTHROPIC_API_KEY
```

```yaml
# Ollama (local) example
agent:
  llm:
    provider: ollama
    model: llama3
    api_key_env: UNUSED
    base_url: http://localhost:11434
```

---

## Built-in Tools

Enable built-in tools via the `toolsets.allowed_tools` field in your agent config. Use category patterns or specific tool names.

| Category | Pattern | Tools |
|---|---|---|
| Files | `files:*` | `file_read`, `file_write`, `file_append`, `file_delete`, `file_move`, `file_copy`, `file_stat`, `file_exists`, `file_list`, `file_chmod` |
| Directories | `directories:*` | `dir_list`, `dir_mkdir`, `dir_rmdir`, `dir_rm_recursive`, `dir_exists`, `dir_move`, `dir_copy`, `dir_tree` |
| Network | `network:*` | `web_search`, `http_request`, `http_post`, `http_put`, `http_delete`, `download_file`, `dns_lookup`, `ping` |
| Data | `data:*` | `json_parse`, `json_stringify`, `csv_parse`, `csv_write`, `yaml_parse`, `xml_parse`, `base64_encode`, `base64_decode`, `hash` |
| Utilities | `calculator`, `date_format`, `generate_uuid`, `random_number`, `sleep`, `regex_match`, `url_parse` | Individual tool names |
| System | `system:*` | `get_cwd`, `get_platform`, `env_get`, `env_set` |
| Compliance | N/A | `audit_log`, `pii_detect`, `encrypt_data`, `decrypt_data` |

```yaml
agent:
  toolsets:
    allowed_tools:
      - name: "files:*"           # all file operations
      - name: "files:read"        # only file_read
      - name: calculator          # specific tool
      - name: "data:*"            # all data format tools
    blocked_tools:
      - env_set                   # block specific tools
```

You can also define custom tools in `tools.json`:

```json
{
  "version": "1.0",
  "tools": [
    {
      "name": "lookup_user",
      "description": "Look up a user by email",
      "schema": {
        "type": "object",
        "properties": {
          "email": { "type": "string", "description": "User email address" }
        },
        "required": ["email"]
      },
      "implementation": "custom"
    }
  ]
}
```

---

## Memory Backends

Configure conversation memory via the `memory` field. All backends implement the same `MemoryStorage` interface.

| Type | `memory.type` | Peer dependency | Config fields |
|---|---|---|---|
| In-memory buffer | `buffer` or `in-memory` | none | `max_messages` |
| File (JSON) | `file` | none | `file.path` |
| SQLite | `sqlite` | `better-sqlite3` | `sqlite.filename`, `sqlite.tableName` |
| Redis | `redis` | `redis` | `redis.url` or `redis.host`/`redis.port` |
| PostgreSQL | `postgres` | `pg` | `postgres.connectionString` or host/port/db |
| Upstash Redis | `upstash` | `@upstash/redis` | `upstash.url`, `upstash.token` |
| Cloudflare KV | `cloudflare-kv` | N/A | `cloudflareKV.namespaceId`, `cloudflareKV.accountId` |
| Cloudflare D1 | `cloudflare-d1` | N/A | `cloudflareD1.databaseId`, `cloudflareD1.accountId` |
| DynamoDB | `dynamodb` | `@aws-sdk/client-dynamodb` | `dynamodb.tableName`, `dynamodb.region` |
| Turso | `turso` | `@libsql/client` | `turso.url`, `turso.authToken` |
| Convex | `convex` | `convex` | `convex.url`, `convex.adminKey` |

```yaml
# SQLite example
agent:
  memory:
    type: sqlite
    max_messages: 50
    sqlite:
      filename: ./data/conversations.db
```

```yaml
# Redis example
agent:
  memory:
    type: redis
    max_messages: 100
    redis:
      url: redis://localhost:6379
```

---

## API Reference

### `getAgent(name?, overrides?, configPath?)`

Load a single agent from `sekuire.yml`. Returns a `SekuireAgent` instance.

```typescript
const agent = await getAgent();

const researcher = await getAgent('researcher');

const agent = await getAgent('assistant', {
  systemPrompt: 'You are a pirate.',
  policyPath: './strict-policy.json',
});

const agent = await getAgent(undefined, undefined, './config/sekuire.yml');
```

### `getAgents(configPath?)`

Load all agents from configuration. Returns `Map<string, SekuireAgent>`.

```typescript
const agents = await getAgents();
const researcher = agents.get('researcher');
const writer = agents.get('writer');
```

### `SekuireAgent`

The agent instance returned by `getAgent()`.

| Method | Description |
|---|---|
| `chat(message, options?)` | Send a message and get a response. Handles tool calls automatically (up to 5 turns). |
| `chatStream(message, options?)` | Stream response tokens. Returns `AsyncGenerator<string>`. |
| `getHistory()` | Get conversation history from memory. |
| `clearHistory()` | Clear conversation history. |
| `setSessionId(id)` | Set the session ID for memory isolation. |
| `getTools()` | Get available tools (filtered by policy if active). |
| `getLLMProvider()` | Get the LLM provider name. |
| `getModelName()` | Get the model name. |
| `getPolicyEnforcer()` | Get the active `PolicyEnforcer` instance, if any. |

### `AgentOptions` (overrides)

```typescript
interface AgentOptions {
  llm?: LLMProvider;
  tools?: ToolDefinition[];
  memory?: MemoryStorage;
  systemPrompt?: string;
  policyPath?: string;
}
```

### `SekuireSDK`

Platform integration layer. Only needed when connecting to the Sekuire platform.

```typescript
const sdk = SekuireSDK.fromEnv();
await sdk.start();

sdk.log(eventType, data, severity);
await sdk.checkPolicy(action, context);
sdk.isConnected();

const creds = sdk.getInstallationCredentials();
const worker = sdk.createTaskWorker();
const delegator = sdk.createDelegator();

await sdk.shutdown();
```

### `PolicyEnforcer`

Local policy enforcement engine. Automatically attached to agents when policies are configured in `sekuire.yml`.

```typescript
enforcer.enforceModel(modelName);
enforcer.enforceTool(toolName);
enforcer.enforceNetwork(domain, protocol);
enforcer.enforceFilesystem(path, operation);
enforcer.enforceRateLimit(type, count);
```

---

## Signed Endpoint Authentication

The handshake (`/sekuire/hello` -> `/sekuire/auth`) returns a short-lived `sessionToken`.
Use it to sign protected endpoint calls (`/chat`, `/webhook`) with Ed25519.

```typescript
import { SekuireClient, SekuireCrypto } from '@sekuire/sdk';

const clientKeys = SekuireCrypto.generateKeyPair();
const client = new SekuireClient(clientKeys, {
  registryUrl: 'https://registry.sekuire.ai',
});

await client.connect('http://127.0.0.1:8000', 'agent-id');

const payload = { message: 'Hello' };
const headers = client.createSignedRequestHeaders('POST', '/chat', payload);

const response = await fetch('http://127.0.0.1:8000/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(payload),
});
```

Framework middleware:

- Express: `createSekuireExpressRequestAuthMiddleware(server)`
- Fastify: `createSekuireFastifyRequestAuthHook(server)`

---

## Architecture

The SDK operates in two modes:

**Standalone mode** (default): The agent runs with local configuration only. Policy enforcement uses rules from `sekuire.yml`. No `SEKUIRE_*` environment variables are needed - just your LLM provider key. All modules degrade gracefully: the logger falls back to console/silent, the beacon is a no-op, and the policy gateway returns allow-all decisions.

**Platform mode**: Activated by providing `SEKUIRE_INSTALL_TOKEN` (or recovery credentials). The SDK bootstraps with the Sekuire API, starts heartbeat reporting, syncs workspace policies, and streams audit events to the cloud. The local agent behavior is unchanged - the platform layer is additive.

---

## Examples

- [Chat Agent](./examples/standalone/chat-agent/) - basic conversation with `getAgent()`, `chat()`, and `chatStream()`
- [Policy Enforcement](./examples/standalone/policy-enforcement/) - model, tool, network, and rate limit enforcement
- [Multi-Provider](./examples/standalone/multi-provider/) - same prompt across OpenAI, Anthropic, and Google
- [A2A Direct](./examples/standalone/a2a-direct/) - agent-to-agent task delegation

---

## Release Engineering

```bash
pnpm run release:preflight          # build + test + pack + smoke test
pnpm run release:preflight:runtime  # infrastructure health checks
pnpm run release:smoke:npm -- --version=<version>  # post-publish smoke
```

---

## License

Apache-2.0
