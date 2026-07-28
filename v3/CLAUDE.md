# V3 Module Development

This directory contains the V3 monorepo packages. Root CLAUDE.md rules apply here.

## Build & Test

pnpm is the canonical package manager for `v3/` (see `pnpm-workspace.yaml` + the committed `pnpm-lock.yaml`). A plain `npm install` from `v3/` root fails with `EUNSUPPORTEDPROTOCOL` because two packages (`@claude-flow/plugin-agent-federation`, `@claude-flow/plugin-iot-cognitum`) use the `workspace:*` protocol, which only pnpm resolves.

```bash
# From v3/ — installs and links the whole workspace
pnpm install

# From v3/@claude-flow/<package> — build/test a single package
pnpm --filter @claude-flow/<package> build
pnpm --filter @claude-flow/<package> test

# Building the CLI: use the trailing "..." so pnpm builds its workspace
# dependencies first, in topological order.
pnpm --filter @claude-flow/cli... build
```

Building `@claude-flow/cli` on its own is NOT enough. It imports
`@claude-flow/cli-core` at runtime (e.g. `cli-core/dist/src/output.js`), and a
bare `pnpm --filter @claude-flow/cli build` leaves `cli-core/dist` missing — the
CLI then dies with `ERR_MODULE_NOT_FOUND` on almost every command. This is not
hypothetical: it accounted for 8 failing test files until 2026-07-28, because
those tests shell out to `bin/cli.js`. The `...` suffix (or a plain
`pnpm -r build`) is what keeps the dependency built.

## Packages

| Package | Path | Purpose |
|---------|------|---------|
| `@claude-flow/cli` | `@claude-flow/cli/` | CLI entry point (26 commands, 140+ subcommands) |
| `@claude-flow/guidance` | `@claude-flow/guidance/` | Governance control plane (compile, enforce, prove, evolve) |
| `@claude-flow/hooks` | `@claude-flow/hooks/` | 17 hooks + 12 background workers |
| `@claude-flow/memory` | `@claude-flow/memory/` | AgentDB + HNSW vector search |
| `@claude-flow/shared` | `@claude-flow/shared/` | Shared types and utilities |
| `@claude-flow/security` | `@claude-flow/security/` | Input validation, path security, CVE remediation |

## Code Quality

- Files under 500 lines
- No hardcoded secrets
- Input validation at system boundaries
- Typed interfaces for all public APIs
- TDD London School (mock-first) preferred
- Event sourcing for state changes

## Performance Targets

> Source of truth: [`docs/reviews/intelligence-system-audit-2026-05-29.md`](../docs/reviews/intelligence-system-audit-2026-05-29.md) + [`scripts/benchmark-intelligence.mjs`](../scripts/benchmark-intelligence.mjs). Numbers below are measured unless marked "target/unverified".

| Metric | Measured / Target | Status |
|--------|-------------------|--------|
| HNSW Search | ~1.9x at N=20k, ~3.2x–4.7x at N=5k vs brute force (recall@10 ~0.99) | **Measured** (ruvector NAPI; 150x-12,500x NOT reproduced) |
| Int8 Quantization | 3.84x compression, reconstruction cosine 0.99999 | **Measured** |
| RaBitQ Quantization | 32x compression, 0.60ms/query | **Measured** |
| SONA Adaptation | 0.0043ms/adapt (target <0.05ms met) | **Measured** |
| MCP Response | <100ms | target |
| CLI Startup | <500ms | target |
| Flash Attention | integration available; measured speedup pending benchmark | **Not measured** — prior "2.49x–7.47x" figure was inherited from upstream marketing, never reproduced in-tree; dropped to avoid a credibility claim we can't verify |
