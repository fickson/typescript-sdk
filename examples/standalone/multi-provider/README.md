# Multi-Provider

Sends the same prompt to OpenAI, Anthropic, Google, and Ollama agents defined in a single config file.

## Setup

1. Copy `.env.example` to `.env` and add your API keys
2. Install dependencies: `npm install @sekuire/sdk dotenv`
3. Run: `npx tsx index.ts`

Agents with missing API keys will report an error and continue. Set whichever keys you have available.

## What it does

- Loads all agents from `sekuire.yml` using `getAgents()`
- Sends the same prompt to each agent
- Prints the response and elapsed time for each provider

For Ollama, install and start the server first: `ollama serve && ollama pull llama3`
