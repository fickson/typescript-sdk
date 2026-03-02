# Policy Enforcement

Demonstrates local policy enforcement: model restrictions, tool blocking, network allowlists, filesystem path restrictions, and rate limiting.

## Setup

```bash
npm install @sekuire/sdk
npx tsx index.ts
```

No API keys or platform connection required. All enforcement runs locally.

## What it shows

- Model enforcement: allowed models pass, blocked and unlisted models are rejected
- Tool enforcement: allowed tools pass, blocked tools throw `PolicyViolationError`
- Network enforcement: allowed domains pass, blocked domains and non-TLS requests are rejected
- Filesystem enforcement: allowed paths and extensions pass, blocked paths and disallowed extensions are rejected
- Rate limiting: requests beyond the configured limit are rejected

The `PolicyEnforcer` class evaluates all rules in-process with zero network calls. Violations throw `PolicyViolationError` with a `rule` field indicating which policy was violated.

## Expected output

```
--- Model Enforcement ---

  ALLOWED  gpt-4o-mini
  BLOCKED  gpt-3.5-turbo (blocked) - [model.blocked] Model gpt-3.5-turbo is blocked
  BLOCKED  llama-3 (not in allowlist) - [model.not_allowed] Model llama-3 is not allowed

--- Tool Enforcement ---

  ALLOWED  calculator
  ALLOWED  web_search
  BLOCKED  shell_exec (blocked) - [tool.blocked] Tool shell_exec is blocked
  BLOCKED  file_delete (blocked) - [tool.blocked] Tool file_delete is blocked

--- Network Enforcement ---

  ALLOWED  api.openai.com over HTTPS
  BLOCKED  evil.com (blocked domain) - [network.blocked] Domain evil.com is blocked by policy
  BLOCKED  example.com (not in allowlist) - [network.not_allowed] Domain example.com is not in the allowlist
  BLOCKED  api.openai.com over HTTP (TLS required) - [network.tls_required] TLS is required for network requests

--- Filesystem Enforcement ---

  ALLOWED  ./data/report.txt (allowed path + ext)
  BLOCKED  /etc/passwd (blocked path) - [fs.blocked] Path /etc/passwd is blocked
  BLOCKED  ~/.ssh/id_rsa (blocked path) - [fs.blocked] Path ~/.ssh/id_rsa is blocked
  BLOCKED  ./data/image.png (blocked extension) - [fs.ext] Extension .png is not allowed

--- Rate Limiting ---

  ALLOWED  Request 1
  ...
  ALLOWED  Request 10
  BLOCKED  Request 11 - [rate_limit.exceeded] Rate limit exceeded: ...

All enforcement is local. No network calls made.
```

## Files

| File | Purpose |
|---|---|
| `sekuire.yml` | Policy configuration with network, filesystem, tool, and model rules |
| `system_prompt.md` | System prompt (used when loading via `getAgent()`) |
| `tools.json` | Tool definitions (empty for this example) |
| `index.ts` | Demonstrates `PolicyEnforcer` directly with `PolicyViolationError` handling |
