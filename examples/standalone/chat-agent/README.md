# Chat Agent

Simple conversational agent using OpenAI. Demonstrates `getAgent()`, `chat()`, and `chatStream()`.

## Setup

```bash
cp .env.example .env   # add your OpenAI API key
npm install @sekuire/sdk
npx tsx index.ts
```

## What it does

- Loads agent configuration from `sekuire.yml`
- Sends a chat message and gets a response
- Sends a follow-up that uses conversation history (in-memory)
- Streams a response token by token

No platform connection required. Runs entirely standalone.

## Files

| File | Purpose |
|---|---|
| `sekuire.yml` | Agent configuration: LLM provider, model, memory |
| `system_prompt.md` | System prompt loaded by the agent |
| `tools.json` | Tool definitions (empty for this example) |
| `index.ts` | Entry point |
