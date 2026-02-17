# A2A Direct

Two agents communicating directly using the A2A protocol (JSON-RPC). An orchestrator delegates tasks between a Math Agent and a Summary Agent.

## Setup

1. Install dependencies: `npm install @sekuire/sdk`
2. Run: `npx tsx index.ts`

No API keys or platform connection required.

## What it does

- Creates two `A2AServer` instances with agent cards and skill handlers
- An orchestrator sends a math task to the Math Agent via `tasks/send`
- The result is forwarded to the Summary Agent for summarization
- All communication uses the A2A JSON-RPC protocol in-process

This demonstrates the agent interoperability pattern without needing a running server or external services.
