# Phase 2: SDK Standalone Hardening - Completion Report

## Objective

Make the TypeScript SDK (`@sekuire/sdk`) work end-to-end with zero `SEKUIRE_*` environment variables. Developers must be able to `npm install @sekuire/sdk` and use identity, policy enforcement, and logging without any Sekuire account or cloud connectivity.

## Verification

As of **February 16, 2026** on the local branch:

```
Build:  PASS  (rollup -c: ESM + CJS + .d.ts)
Tests:  PASS  (166 tests, 9 files, 0 failures)
```

Commands to reproduce:

```bash
cd packages/sdks/typescript
pnpm build          # produces dist/index.esm.js, dist/index.js, dist/index.d.ts
pnpm exec vitest run
```

---

## Task 2.1: Fix Identity Algorithm Divergence

**Status:** COMPLETE
**Risk:** HIGH (breaking change - old IDs become legacy)

### Problem

The TS SDK (`crypto.ts:77`) computed SekuireID as `BLAKE3(model + prompt + tools + projectName + projectVersion)` - a simple concatenation of 5 fields. The CLI reference implementation (`packages/cli/src/services/auth.rs:243-250`) uses a structured fingerprint with pre-hashed components and only 3 fields.

### CLI Reference Implementation (auth.rs:224-250)

```rust
// 1. Hash prompt
let prompt_hash = blake3::hash(prompt_content.trim().as_bytes()).to_hex().to_string();

// 2. Hash tools (canonical JSON)
let tools_json: serde_json::Value = serde_json::from_str(&tools_content)?;
let canonical_tools = serde_json::to_string(&tools_json)?;
let tools_hash = blake3::hash(canonical_tools.as_bytes()).to_hex().to_string();

// 3. Compute final Sekuire ID
let fingerprint_str = format!("model:{}|prompt:{}|tools:{}", model, prompt_hash, tools_hash);
hasher.update(fingerprint_str.as_bytes());
let sekuire_id = hasher.finalize().to_hex().to_string();
```

### TS SDK Implementation (crypto.ts:97-118)

```typescript
static calculateSekuireIdV2(params: {
  model: string; systemPrompt: string; tools: string;
}): HexString {
  const promptHash = SekuireCrypto.hash(params.systemPrompt.trim());
  let canonicalTools: string;
  try {
    canonicalTools = JSON.stringify(JSON.parse(params.tools));
  } catch {
    canonicalTools = params.tools;
  }
  const toolsHash = SekuireCrypto.hash(canonicalTools);
  const fingerprint = `model:${params.model}|prompt:${promptHash}|tools:${toolsHash}`;
  return SekuireCrypto.hash(fingerprint);
}
```

### Cross-Language Test Vector

| Input | Value |
|---|---|
| model | `gpt-4o` |
| systemPrompt | `You are a helpful assistant.` |
| tools | `[]` |

| Intermediate | Value |
|---|---|
| promptHash (BLAKE3 of trimmed prompt) | `b8c5de4f...` |
| toolsHash (BLAKE3 of `[]`) | `d53d18c2...` |
| fingerprint | `model:gpt-4o\|prompt:{promptHash}\|tools:{toolsHash}` |

| Output | Value |
|---|---|
| **V2 SekuireID** | `28da5805f90c0b2d7437e448f40853092cc38f5fa223cae21994a8b76d338b53` |
| Legacy SekuireID (same inputs + projectName/Version) | Different (simple concatenation) |

### API Changes

| Function | Before | After |
|---|---|---|
| `SekuireCrypto.calculateSekuireId()` | 5 required params, legacy algo | 3 required + 2 optional (ignored), delegates to V2 |
| `SekuireCrypto.calculateSekuireIdV2()` | N/A | New: canonical algo matching CLI |
| `SekuireCrypto.calculateSekuireIdLegacy()` | N/A | New: preserves old algo, marked `@deprecated` |
| `calculateSekuireId()` (utils.ts) | 5 required params | 3 required + 2 optional |
| `calculateSekuireIdLegacy()` (utils.ts) | N/A | New export |

### Files Modified

| File | Change |
|---|---|
| `src/crypto.ts` | Added `calculateSekuireIdV2`, renamed old to `calculateSekuireIdLegacy`, updated `calculateSekuireId` to delegate to V2 |
| `src/utils.ts` | Updated signature (projectName/projectVersion optional), added `calculateSekuireIdLegacy` export |
| `src/index.ts:140` | Added `calculateSekuireIdLegacy` to exports |
| `src/__tests__/crypto.test.ts` | Rewrote `calculateSekuireId` tests for V2, added legacy tests, added reference vector |

### Callers (blast radius)

- `registry-client.ts:138` - `publishAgent()`: no change needed (optional params still passed, ignored by V2)
- `SekuireSDK`, `Beacon`, `Worker` - receive pre-computed `agentId` strings, unaffected

### Backend Note

The backend will need dual-ID resolution (alias table or new column) during migration. This is Phase 3 scope.

---

## Task 2.2: Logger Local Fallback

**Status:** COMPLETE

### Problem

`SekuireLogger.flush()` caught API errors and called `onError` callback (defaulting to no-op). Events were permanently lost when the API was unreachable. The `apiBaseUrl` was required, making the logger unusable without a Sekuire account.

### Solution

| Feature | Implementation |
|---|---|
| `apiBaseUrl` optional | `LoggerConfig.apiBaseUrl?: string` (was required) |
| `apiAvailable` flag | `!!(config.apiBaseUrl)` - set in constructor |
| Fallback modes | `"console"` (NDJSON to stdout), `"file"` (NDJSON append), `"silent"` |
| Buffer overflow | `maxBufferSize` (default 1000); overflow spliced to fallback with warning |
| Heartbeat gating | Only starts when `apiAvailable === true` |
| Axios client | `AxiosInstance \| null` - null when no API |
| `getStatus()` | Now includes `apiAvailable` and `fallbackMode` |

### Fallback Routing

```
logEvent() -> buffer
  |
  v
flush()
  |-- apiAvailable && client? --> POST to API
  |     |-- success: done
  |     |-- error: writeFallback(events) + onError callback
  |
  |-- !apiAvailable || !client? --> writeFallback(events)

writeFallback(events)
  |-- "console": process.stdout.write(JSON.stringify(event) + "\n")
  |-- "file": fs.appendFileSync(fallbackFilePath, ndjson)
  |-- "silent": no-op
```

### Config Additions

| Field | Type | Default | Purpose |
|---|---|---|---|
| `fallback` | `"console" \| "file" \| "silent"` | `"console"` | Where events go when API is unavailable |
| `fallbackFilePath` | `string` | `./sekuire-events.ndjson` | File path for `"file"` mode |
| `maxBufferSize` | `number` | `1000` | Max events before overflow triggers fallback |

### Files Modified

| File | Change |
|---|---|
| `src/logger.ts` | Full rewrite: added FallbackMode, apiAvailable flag, writeFallback(), buffer overflow, heartbeat gating |
| `src/index.ts:72` | Added `FallbackMode` to type exports |

---

## Task 2.5: Dependency Audit

**Status:** COMPLETE

### Dependencies Moved: dependencies -> peerDependencies (optional: true)

| Package | Category |
|---|---|
| `@anthropic-ai/sdk` | LLM provider |
| `openai` | LLM provider |
| `@google/genai` | LLM provider |
| `@opentelemetry/api` | Telemetry |
| `@opentelemetry/exporter-trace-otlp-http` | Telemetry |
| `@opentelemetry/resources` | Telemetry |
| `@opentelemetry/sdk-trace-base` | Telemetry |
| `@opentelemetry/semantic-conventions` | Telemetry |
| `cheerio` | Optional utility |
| `dotenv` | Optional utility |

All moved packages also added to `devDependencies` for development/testing.

### Core Dependencies Remaining

`axios`, `blake3`, `eventsource`, `js-yaml`, `tweetnacl`, `uuid`, `zod`

### Lazy Loading Guards

All optional dependencies are loaded lazily via `require()` inside functions, not at module top level. This prevents CJS bundle crashes when optional deps are absent.

| File | Strategy |
|---|---|
| `src/llm/anthropic.ts` | `loadAnthropicSDK()` - lazy require in constructor |
| `src/llm/openai.ts` | `loadOpenAISDK()` - lazy require in constructor |
| `src/llm/google.ts` | `loadGoogleSDK()` - lazy require in constructor |
| `src/telemetry/index.ts` | `loadOtelApi()`, `loadOtelModules()`, `loadOtelExporter()` - lazy require on use |
| `src/telemetry/exporter.ts` | `loadOtelCore()`, `loadOtelSdkTraceBase()` - lazy require on use |
| `src/new-agent.ts` | `try { require('dotenv').config() } catch {}` |

### CJS Bundle Verification

Top-level requires in `dist/index.js` (the CJS bundle) are only core dependencies:

```
axios, fs, fs/promises, path, tweetnacl, blake3, uuid, eventsource, crypto,
js-yaml, node:fs/promises, node:path, https, http, url, os, zod
```

No `@anthropic-ai/sdk`, `openai`, `@google/genai`, or `@opentelemetry/*` at top level. Optional provider/telemetry dependencies are loaded via guarded dynamic `require(...)` calls; `dotenv` is also loaded via guarded `require(...)` in `new-agent.ts`.

### Files Modified

| File | Change |
|---|---|
| `package.json` | Moved 10 packages from deps to peer+dev, added `@opentelemetry/core` to devDeps |
| `rollup.config.js` | Added `@google/genai`, 6 `@opentelemetry/*` packages to `externalDeps` |
| `src/llm/anthropic.ts` | Replaced top-level import with lazy `require()` loader |
| `src/llm/openai.ts` | Replaced top-level import with lazy `require()` loader |
| `src/llm/google.ts` | Replaced top-level import with lazy `require()` loader |
| `src/telemetry/index.ts` | Replaced 5 top-level OTel imports with lazy loaders; `getTracer()` returns noop stub when OTel absent |
| `src/telemetry/exporter.ts` | Replaced 2 top-level OTel imports with lazy loaders |
| `src/new-agent.ts` | Wrapped dotenv import in try/catch |

---

## Task 2.4: Worker Graceful Degradation

**Status:** COMPLETE

### Problem

`worker.ts:110-115` threw an `Error` when no credentials were provided, crashing the agent. The beacon (`beacon.ts:141-145`) already used a warn-and-degrade pattern.

### Fix (worker.ts)

**Before:**
```typescript
if (!resolvedInstallToken && !resolvedRuntimeToken && !hasRecoveryCredentials) {
  throw new Error(
    "WorkerConfig requires one of: " +
    "installToken, runtimeToken, or (installationId + refreshToken)"
  );
}
```

**After:**
```typescript
if (!resolvedInstallToken && !resolvedRuntimeToken && !hasRecoveryCredentials) {
  console.warn(
    "[Worker] No credentials provided (installToken, runtimeToken, or installationId + refreshToken). " +
    "Worker will not connect until credentials are provided."
  );
  this.degradedMode = true;
}
```

`start()` early-returns with a warning when `degradedMode === true`.

### Degradation Audit Document

Created `packages/sdks/typescript/STANDALONE_DEGRADATION.md` documenting offline behavior for all 17 SDK modules.

### Files Modified/Created

| File | Change |
|---|---|
| `src/worker.ts` | Added `degradedMode` flag, replaced throw with warn, guarded `start()` |
| `STANDALONE_DEGRADATION.md` | **NEW** - audit table for all modules |

---

## Task 2.3: Standalone Integration Test Suite

**Status:** COMPLETE

### File: `src/__tests__/standalone.test.ts` (280 lines, 24 tests)

All `SEKUIRE_*` env vars are stripped in `beforeAll`. Standalone constructor behavior is validated without requiring cloud credentials.

| Test Group | Count | What's Tested |
|---|---|---|
| Standalone: Identity V2 | 6 | Determinism, CLI reference vector match, V2 vs legacy difference, projectName/Version ignored, JSON whitespace normalization, prompt trimming |
| Standalone: Policy Enforcement | 5 | Model allowlist, model blocklist, tool allowlist (with ToolDefinition objects), network rules (TLS + domain), override/warn-only mode |
| Standalone: SDK Constructor | 1 | `new SekuireSDK({ agentId: "test" })` works with zero env vars and keeps logger API disabled |
| Standalone: Logger Fallback | 4 | Constructor without apiBaseUrl, NDJSON to stdout in console mode, silent mode drops events, `getStatus()` reports `apiAvailable: false` |
| Standalone: Config Formats | 5 | `.yml`, `.yaml`, and `.json` config parsing parity |
| Standalone: Crypto Primitives | 3 | Keypair generation, sign/verify, deterministic hashing |

---

## Complete File Manifest

### Modified Files (15)

| File | Lines Changed | Purpose |
|---|---|---|
| `package.json` | +63/-27 | Dependency restructuring |
| `pnpm-lock.yaml` | lockfile sync | Auto-generated |
| `rollup.config.js` | +8 | External deps for optional packages |
| `src/crypto.ts` | +50 | V2 identity algorithm, legacy preservation |
| `src/utils.ts` | +20/-6 | Wrapper updates for V2/legacy |
| `src/index.ts` | +3/-1 | New exports (FallbackMode, calculateSekuireIdLegacy) |
| `src/logger.ts` | +174/-100 | Fallback system, optional apiBaseUrl |
| `src/worker.ts` | +13/-4 | Degraded mode instead of throw |
| `src/llm/anthropic.ts` | +26/-6 | Lazy loading |
| `src/llm/openai.ts` | +32/-8 | Lazy loading |
| `src/llm/google.ts` | +35/-10 | Lazy loading |
| `src/telemetry/index.ts` | +125/-50 | Lazy loading, noop stub |
| `src/telemetry/exporter.ts` | +45/-10 | Lazy loading |
| `src/new-agent.ts` | +9/-3 | dotenv try/catch |
| `src/__tests__/crypto.test.ts` | +87/-30 | V2 tests, reference vector, legacy tests |

### New Files (2)

| File | Lines | Purpose |
|---|---|---|
| `src/__tests__/standalone.test.ts` | 280 | Standalone integration test suite (24 tests) |
| `STANDALONE_DEGRADATION.md` | 23 | Module-by-module offline behavior audit |

### Unchanged (verified no modification needed)

| File | Why |
|---|---|
| `src/registry-client.ts` | `publishAgent()` params are already optional-compatible |
| `src/sdk.ts` | Already accepts just `agentId`, degrades gracefully |
| `src/beacon.ts` | Already uses warn + degraded mode pattern |
| `src/policy-enforcer.ts` | Fully local, no network dependency |
| `src/policy-gateway.ts` | Returns allow-all when no enforcer |
| `src/a2a-delegator.ts` | Returns `{status: "failed"}` on error |
| `src/llm/index.ts` | Re-exports from provider files (no direct external imports) |

---

## Known Limitations / Phase 3 Follow-ups

1. **Backend dual-ID resolution**: The backend needs to resolve agents by either legacy or canonical ID during migration. Requires a DB migration (alias table or new column).

2. **JSON key ordering**: Both the TS SDK (`JSON.stringify(JSON.parse())`) and the Rust CLI (`serde_json::to_string`) preserve insertion order of JSON keys. This means `{"b":2,"a":1}` and `{"a":1,"b":2}` produce different IDs. This is consistent across languages but is a known characteristic. Canonical JSON normalization (sorted keys) was NOT implemented to match the CLI behavior.

3. **ESM lazy loading**: The lazy `require()` calls work in the CJS bundle. In the ESM bundle, rollup transforms these but ESM consumers typically use bundlers (vite/webpack/esbuild) which handle tree-shaking. Direct ESM usage in Node.js without a bundler may need `createRequire` from `node:module`.
