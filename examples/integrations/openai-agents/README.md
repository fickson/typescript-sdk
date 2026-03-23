# OpenAI Agents SDK + Sekuire Governed Client

This example demonstrates true proxy-based interception of the OpenAI Agents SDK. Rather than wrapping agent runs with manual enforce calls, Sekuire creates a governed OpenAI client that intercepts every `chat.completions.create()` call - the Agents SDK has no awareness of governance.

## How it works

`governed-client.ts` exports `createGovernedOpenAIClient()`, which:

1. Loads policy from `sekuire.yml` via the Sekuire SDK
2. Creates a standard `OpenAI` client
3. Proxies `client.chat.completions.create()` to enforce policy on every call:
   - **Pre-call**: validates model name, checks rate limits, validates any tools in the request
   - **Post-call**: enforces token-based rate limits, validates tool calls in the response
   - **Streaming**: wraps the async iterator to enforce policy on each chunk
4. Returns the proxied client - same type as `OpenAI`, drop-in replacement

Pass this client to the OpenAI Agents SDK `Agent` constructor. Every internal LLM call the SDK makes goes through policy enforcement automatically.

## What it demonstrates

- **Model enforcement**: blocks agents from using disallowed models (e.g. gpt-3.5-turbo) while allowing approved ones (gpt-4o-mini, gpt-4o)
- **Tool enforcement**: blocks dangerous tools (file_delete, env_set) while allowing safe ones (web_search, calculator)
- **Rate limiting**: per-agent request and token limits defined in sekuire.yml
- **Transparent interception**: the OpenAI Agents SDK never calls Sekuire directly

## Prerequisites

- Node.js 18+
- An OpenAI API key (optional - governance checks run without one)

## Setup

```bash
cp .env.example .env
# Edit .env and add your OpenAI API key

pnpm install
```

## Run

```bash
pnpm start
```

Without an `OPENAI_API_KEY`, the example runs all governance checks and skips the live agent call. With a key set, it runs the full governed agent and demonstrates a blocked model.

## Usage

```typescript
import { Agent, run } from '@openai/agents';
import { createGovernedOpenAIClient } from './governed-client';

const client = await createGovernedOpenAIClient({
  configPath: './sekuire.yml',
});

const agent = new Agent({
  name: 'Assistant',
  model: 'gpt-4o-mini',
  client,
});

// Every internal LLM call is governed by Sekuire policy
const result = await run(agent, 'Hello');
```
