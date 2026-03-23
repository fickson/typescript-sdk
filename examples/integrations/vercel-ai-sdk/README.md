# Vercel AI SDK + Sekuire Integration

This example shows how to use Sekuire's governed AI agents as a custom Vercel AI SDK provider. All LLM calls go through Sekuire's policy enforcement layer, giving you model allowlists, tool restrictions, rate limiting, and network controls - without changing your Vercel AI SDK code.

## What it demonstrates

- **Custom provider**: wraps a Sekuire agent as a `LanguageModelV1` compatible provider
- **generateText()**: governed non-streaming chat completion
- **streamText()**: governed streaming chat completion
- **Model enforcement**: blocks calls to disallowed models (e.g. gpt-3.5-turbo)
- **Rate limiting**: per-agent request limits defined in sekuire.yml

## Prerequisites

- Node.js 18+
- An OpenAI API key

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

## How it works

The `sekuire-provider.ts` file creates a Vercel AI SDK custom provider that:

1. Loads a Sekuire agent from `sekuire.yml` via `getAgent()`
2. Wraps the agent's `chat()` and `chatStream()` methods behind the `LanguageModelV1` interface
3. Every call passes through Sekuire's `PolicyEnforcer` - checking model allowlists, rate limits, tool permissions, and network rules before the LLM is called

The governance rules are defined in `sekuire.yml`. Edit that file to change which models are allowed, set rate limits, or restrict tool usage.
