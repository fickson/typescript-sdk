# Policy Enforcement

Demonstrates local policy enforcement: model restrictions, tool blocking, network allowlists, and rate limiting.

## Setup

1. Install dependencies: `npm install @sekuire/sdk`
2. Run: `npx tsx index.ts`

No API keys or platform connection required. All enforcement runs locally.

## What it shows

- **Model enforcement**: allowed models pass, blocked/unlisted models are rejected
- **Tool enforcement**: allowed tools pass, blocked tools are rejected
- **Network enforcement**: allowed domains pass, blocked domains and non-TLS are rejected
- **Rate limiting**: requests beyond the configured limit are rejected

The `PolicyEnforcer` class evaluates rules in-process with zero network calls.
