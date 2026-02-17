# Contributing to Sekuire

Thank you for your interest in contributing to the Sekuire open-source components.

## Scope

Contributions are accepted for the open-source portions of this repository:

- `packages/sdks/` - TypeScript, Python, and Rust SDKs
- `packages/protocol/` - Shared protocol types
- `packages/cli/` - Sekuire CLI
- `oss/specs/` - Open Agent Governance Spec (OAGS)

The following directories are **proprietary** and not open to external contributions:

- `services/core/` - Backend API
- `apps/web/` - Dashboard
- `apps/registry/` - Desktop registry app

See `oss/OSS_BOUNDARY.md` for the full boundary classification.

## Filing Issues

- Search existing issues before creating a new one.
- Use a clear, descriptive title.
- Include reproduction steps, expected behavior, and actual behavior.
- For spec-related issues, use the `[OAGS-Spec]` prefix.

## Pull Request Guidelines

1. **Fork and branch.** Create a feature branch from `master`.
2. **Conventional Commits.** Use the [Conventional Commits](https://www.conventionalcommits.org/) format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `chore:` for maintenance tasks
   - `test:` for test additions or changes
3. **DCO Sign-Off.** All commits must be signed off to certify the [Developer Certificate of Origin](https://developercertificate.org/):
   ```
   git commit -s -m "feat: add new SDK feature"
   ```
4. **Tests.** Include tests for new functionality. Ensure existing tests pass.
5. **Scope.** Keep PRs focused - one logical change per PR.
6. **CI.** All CI checks must pass before merge.

## Developer Certificate of Origin (DCO)

By contributing, you certify that your contribution is your original work
(or you have the right to submit it) and that you agree to license it under
the Apache License 2.0. The sign-off is a simple line at the end of each
commit message:

```
Signed-off-by: Your Name <your.email@example.com>
```

Use `git commit -s` to add this automatically.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
Please read it before participating. Report unacceptable behavior to conduct@sekuire.com.

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](LICENSE).
