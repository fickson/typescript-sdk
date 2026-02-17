# Chat Agent

Simple conversational agent using OpenAI. Demonstrates `getAgent()`, `chat()`, and `chatStream()`.

## Setup

1. Copy `.env.example` to `.env` and add your OpenAI API key
2. Install dependencies: `npm install @sekuire/sdk dotenv`
3. Run: `npx tsx index.ts`

## What it does

- Loads agent configuration from `sekuire.yml`
- Sends a chat message and gets a response
- Sends a follow-up that uses conversation history
- Streams a response token by token

No platform connection required - runs entirely standalone.
