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

## Quick Start (Standalone)

### 1. Create `sekuire.yml`

```yaml
project:
  name: my-agent
  version: 1.0.0

agent:
  name: Assistant
  system_prompt: ./prompts/system.md
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

### 2. Create `prompts/system.md`

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
  system_prompt: ./prompts/system.md
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

---

## Upgrade to Platform

When you are ready for cloud audit logs, fleet management, and agent registry, add a single environment variable:

```bash
export SEKUIRE_INSTALL_TOKEN="skt_..."   # from dashboard or CLI
export SEKUIRE_AGENT_ID="your-agent-id"
```

```typescript
import { SekuireSDK } from '@sekuire/sdk';

const sdk = SekuireSDK.fromEnv();
await sdk.start();

// Cloud audit logging
sdk.log('tool_execution', { tool: 'calculator', input: '42 * 17' });

// Policy checks against workspace policies
const allowed = await sdk.checkPolicy('read_file', { path: '/data/report.csv' });

// Graceful shutdown
await sdk.shutdown();
```

Everything that worked in standalone mode continues to work. The platform adds:

- **Cloud audit logs** - centralized event stream across all agent instances
- **Fleet management** - heartbeat monitoring, deployment tracking
- **Agent registry** - publish and discover agents
- **Trust scores** - reputation system for agent-to-agent interactions
- **Workspace policies** - remote policy distribution and enforcement
- **A2A orchestration** - task delegation across agents via the mesh

---

## Architecture

The SDK operates in two modes:

**Standalone mode** (default): The agent runs with local configuration only. Policy enforcement uses rules from `sekuire.yml`. No `SEKUIRE_*` environment variables are needed - just your LLM provider key. All modules degrade gracefully: the logger falls back to console/silent, the beacon is a no-op, and the policy gateway returns allow-all decisions.

**Platform mode**: Activated by providing `SEKUIRE_INSTALL_TOKEN` (or recovery credentials). The SDK bootstraps with the Sekuire API, starts heartbeat reporting, syncs workspace policies, and streams audit events to the cloud. The local agent behavior is unchanged - the platform layer is additive.

---

## Features

- **LLM providers**: OpenAI, Anthropic, Google Gemini, Ollama (local)
- **Built-in tools**: Calculator, HTTP requests, file operations, directory listing, JSON processing, web search, environment access
- **Policy enforcement**: Model allowlists, tool allowlists/blocklists, network domain rules, filesystem path restrictions, rate limits - all evaluated locally
- **Streaming**: Token-by-token responses via `chatStream()`
- **Memory**: In-memory buffer, File (JSON), Redis, PostgreSQL, SQLite, Upstash, Cloudflare KV/D1, DynamoDB, Turso, Convex
- **A2A protocol**: Agent-to-agent communication with task delegation, skill discovery, and streaming updates
- **Telemetry**: OpenTelemetry integration with span tracing
- **Cryptographic identity**: Ed25519 signing, BLAKE3 content-addressable agent IDs
- **Signed endpoint auth**: Session-backed signatures for `/chat` and `/webhook` (via handshake + per-request signatures)

---

## Signed Endpoint Authentication

The handshake (`/sekuire/hello` -> `/sekuire/auth`) now returns a short-lived `sessionToken`.
Use it to sign protected endpoint calls (`/chat`, `/webhook`) with Ed25519.

```typescript
import { SekuireClient, SekuireCrypto } from "@sekuire/sdk";

const clientKeys = SekuireCrypto.generateKeyPair();
const client = new SekuireClient(clientKeys, {
  registryUrl: "https://registry.sekuire.ai",
});

await client.connect("http://127.0.0.1:8000", "agent-id");

const payload = { message: "Hello" };
const headers = client.createSignedRequestHeaders("POST", "/chat", payload);

const response = await fetch("http://127.0.0.1:8000/chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...headers,
  },
  body: JSON.stringify(payload),
});
```

If you're using framework adapters:

- Express: `createSekuireExpressRequestAuthMiddleware(server)`
- Fastify: `createSekuireFastifyRequestAuthHook(server)`

Generated TypeScript HTTP templates apply this protection by default.

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
    type: buffer                        # buffer | redis | postgres | sqlite | upstash | ...
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

## API Reference

### `getAgent(name?, overrides?, configPath?)`

Load a single agent from `sekuire.yml`. Returns a `SekuireAgent` instance.

```typescript
// Load the default (or only) agent
const agent = await getAgent();

// Load a named agent from a multi-agent config
const researcher = await getAgent('researcher');

// Override configuration
const agent = await getAgent('assistant', {
  systemPrompt: 'You are a pirate.',
  policyPath: './strict-policy.json',
});

// Custom config path
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

## License

Apache-2.0
