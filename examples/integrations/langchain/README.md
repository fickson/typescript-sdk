# LangChain.js + Sekuire Integration

This example shows how to use a Sekuire-governed agent as a LangChain ChatModel and wrap Sekuire tools as LangChain StructuredTools.

## What it demonstrates

- Wrapping `SekuireAgent` as a LangChain `BaseChatModel` so it can be used anywhere LangChain expects a chat model
- Converting Sekuire tool definitions into LangChain `DynamicStructuredTool` instances with Zod schemas
- Policy enforcement: blocked tools are filtered from `getTools()` and rejected by `executeTool()`
- Model restrictions, rate limits, and network/filesystem permissions defined in `sekuire.yml`

## Prerequisites

- Node.js 18+
- An OpenAI API key (or change the provider in `sekuire.yml`)

## Setup

```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

pnpm install
```

## Run

```bash
pnpm start
```

## Files

| File | Purpose |
|------|---------|
| `sekuire-chat-model.ts` | `BaseChatModel` subclass that delegates to `SekuireAgent.chat()` |
| `sekuire-tools.ts` | Converts Sekuire tool definitions to LangChain `DynamicStructuredTool` |
| `index.ts` | Demo script showing governed chat, tool wrapping, and policy enforcement |
| `sekuire.yml` | Agent configuration with LLM, tools, and policy rules |

## Governance features shown

- **Model allowlist/blocklist**: only `gpt-4o-mini` and `gpt-4o` are allowed
- **Tool allowlist/blocklist**: `file_delete` and `env_set` are blocked
- **Network policy**: TLS required, only specific domains allowed
- **Filesystem policy**: restricted paths and extensions
- **Rate limiting**: 10 requests per minute per agent
