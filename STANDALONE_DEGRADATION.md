# Standalone Degradation Audit

How each SDK module behaves when no `SEKUIRE_*` environment variables are set and no Sekuire API is reachable.

| Module | Offline Behavior | Notes |
|---|---|---|
| `sdk.ts` | Constructor needs only `agentId`; logger stays offline unless API URL is explicitly set or credentials are present | Identity, logging, and heartbeat features are optional |
| `beacon.ts` | Warns on missing credentials, enters degraded mode if auth fails | Agent continues running without Sekuire features |
| `worker.ts` | Warns on missing credentials, sets `degradedMode = true`, `start()` is a no-op | Fixed in Phase 2 (was: threw Error) |
| `runtime-credentials.ts` | Pure data store, no network calls in constructor | Safe offline |
| `policy.ts` | Fetch-based, callers (PolicyGateway) handle errors | No crash on missing API |
| `policy-gateway.ts` | Returns allow-all decisions when no enforcer loaded | Falls back to permissive on fetch failure |
| `policy-enforcer.ts` | Fully local evaluation from `ActivePolicy` object | No network dependency |
| `logger.ts` | Routes events to fallback (console/file/silent) when `apiBaseUrl` absent; retry queue is drained on periodic flush/shutdown | Fixed in Phase 2: events are not silently stranded in retry queue |
| `registry-client.ts` | Methods throw on HTTP failure (appropriate - caller-initiated) | Explicit failures, not silent drops |
| `a2a-delegator.ts` | Returns `{status: "failed"}` on delegation error | Graceful failure per task |
| `a2a-client.ts` | Throws on connection failure (appropriate - caller-initiated) | Explicit failures |
| `a2a-server.ts` | Local HTTP server, no Sekuire dependency | Fully standalone |
| `telemetry/index.ts` | Noop tracer when `enabled: false` or OTel deps missing | `getTracer()` returns noop stub |
| `crypto.ts` | Pure crypto operations, no network | Fully standalone |
| `identity.ts` | Ed25519 key operations, no network | Fully standalone |
| `config/loader.ts` | Reads local YAML/JSON files | Fully standalone |
| `llm/*.ts` | Providers load SDK lazily; error only when provider is instantiated without its dep | No crash on import |
