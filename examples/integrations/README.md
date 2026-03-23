# Sekuire SDK - Framework Integrations

Integration examples showing how to add Sekuire governance (policy enforcement, model guardrails, rate limits) to popular AI agent frameworks.

## Integrations

| Framework | Directory | What It Shows |
|-----------|-----------|---------------|
| [Vercel AI SDK](./vercel-ai-sdk/) | `vercel-ai-sdk/` | Custom `LanguageModelV1` provider wrapping Sekuire governance. Use `generateText()` and `streamText()` with policy enforcement. |
| [LangChain.js](./langchain/) | `langchain/` | `BaseChatModel` subclass and `DynamicStructuredTool` wrappers. Use LangChain agents with governed models and policy-filtered tools. |
| [OpenAI Agents SDK](./openai-agents/) | `openai-agents/` | Governance guardrails for `@openai/agents`. Enforce model, tool, and rate limit policies before and during agent execution. |

## Shared Governance Config

All examples use the same `sekuire.yml` policy:

- **Allowed models**: gpt-4o-mini, gpt-4o
- **Blocked models**: gpt-3.5-turbo
- **Allowed tools**: web_search, files:read, calculator
- **Blocked tools**: file_delete, env_set
- **Rate limit**: 10 requests/minute
- **Network**: TLS required, specific domains allowed
- **Filesystem**: restricted paths and extensions

## Quick Start

```bash
cd <integration-directory>
pnpm install
cp .env.example .env   # add your OPENAI_API_KEY
npx tsx index.ts
```

## Python Integrations

For CrewAI and LangChain Python integrations, see the [Python SDK examples](../../../python-sdk/examples/integrations/).

## n8n Integration

For the n8n community node, see [n8n-nodes-sekuire](../../../n8n-nodes-sekuire/).
