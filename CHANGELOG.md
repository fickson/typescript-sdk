# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-03-02

### Added

- LLM-layer policy enforcement: `BaseLLMProvider` now exposes `setPolicyEnforcer()`, `enforcePreCall()`, and `enforcePostCall()`. All four providers (OpenAI, Anthropic, Google, Ollama) call these hooks on every `chat()` and `chatStream()` invocation.
- Production override protection: `SEKUIRE_POLICY_DEV_OVERRIDE` and the `override` constructor flag are silently ignored when `NODE_ENV=production`.
- Policy immutability: `Object.freeze()` applied to the `ActivePolicy` and its `content` in the `PolicyEnforcer` constructor.
- Ed25519 event signing: `SekuireLogger` accepts a `privateKey` config option and signs every audit event payload. Signature is verifiable with the corresponding public key via `SekuireCrypto.verify()`.
- Buffer overflow warnings in the logger with actionable guidance.
- `isOverrideEnabled()` method on `PolicyEnforcer` for testability.
- Security hardening test suite (`security-hardening.test.ts`) covering production override, policy immutability, LLM enforcement, event signing, and missing policy warnings (12 tests).
- Standalone README rewrite with quick start, governance, platform upgrade, configuration reference, multi-provider table, built-in tools, memory backends, and API reference.
- Standalone examples: `chat-agent` and `policy-enforcement` rewritten as runnable demos.
- Release preflight automation script at `scripts/release-preflight.mjs`.
- NPM scripts for prepublish checks, runtime checks, and post-publish smoke checks.

### Changed

- `SekuireAgent` (`new-agent.ts`) auto-wires `PolicyEnforcer` to the LLM provider on construction.
- Missing policy now logs a warning ("Running in unrestricted mode") instead of silently continuing.
- `LLMProvider` interface in `llm/types.ts` includes optional `setPolicyEnforcer` method.
- CI/release workflow definitions now target the standalone TypeScript SDK repository layout.
