# ADR-323 — The Plugin SDK contract is canonical: no `id`/`capabilities` metadata fields, no direct `.tools`/`.hooks` properties

**Status**: Accepted
**Date**: 2026-07-28
**Related**: commit `2bc516b19` ("feat(plugins): add 6 RuVector WASM example plugins with 142 passing tests" — the commit that introduced both the plugins and the mismatched test), `v3/@claude-flow/plugins/src/types/index.ts` (`PluginMetadata`), `v3/@claude-flow/plugins/src/core/plugin-interface.ts` (`IPlugin`), test-suite remediation Fase 2 (commits `6f2e4f873`, `e73eb19cb`, `3fc864950`)

## Context

`v3/@claude-flow/plugins/examples/ruvector-plugins/ruvector-plugins.test.ts`
failed 16 of its 35 tests, identically across all six example plugins
(reasoning-bank, semantic-code-search, sona-learning, intent-router,
mcp-tool-optimizer, hook-pattern-library). The failures were not bugs in the
plugins — they were a systemic mismatch between the assertions and the Plugin
SDK's actual contract:

1. **`metadata.id` / `metadata.capabilities` do not exist.** `PluginMetadata`
   (`src/types/index.ts`) has `name`, `version`, `description`, `author`,
   `license`, `repository`, `dependencies`, `peerDependencies`,
   `minCoreVersion`, `maxCoreVersion`, `tags` — and has had exactly that shape
   since it was first defined (confirmed via `git log -p`). Plugins are
   identified by `name` (a kebab-case slug such as `'reasoning-bank'`, used as
   the registry key) and categorized by `tags`.
2. **`.tools` / `.hooks` are not properties.** `IPlugin`
   (`src/core/plugin-interface.ts`) exposes extension points only through
   registration methods: `registerMCPTools(): MCPToolDefinition[]` and
   `registerHooks(): HookDefinition[]` (plus the sibling `register*` methods).
   `SimplePlugin` — what `PluginBuilder.build()` returns — implements those
   methods; it has no `tools`/`hooks` fields.

The test and the plugins were introduced **together, in the same commit**
(`2bc516b19`), whose message claims "142 passing tests". The claim was never
true for this file: the expected values it asserts never existed anywhere in
the codebase at any point —

- `'PostToolCall'` has never been a `HookEvent` member (the real event is
  `HookEvent.PostToolUse`, whose value is `'hook:post-tool-use'`; the enum
  values are namespaced strings, not PascalCase member names);
- `'vector-search'` and `'code-search'` appear in no plugin's tag list;
- human-readable display names like `'RuVector Reasoning Bank'` appear
  nowhere — plugins carry the slug in `name` and prose in `description`;
- `hookPatternLibraryPlugin` was asserted to register `PreFileWrite` /
  `PostFileWrite` / `PreCommand` hooks, but those events only occur in the
  plugin's **seeded pattern data** (its internal library of hook patterns to
  recommend), not in what it registers — it registers a single `PostToolUse`
  recording hook.

In other words: the test encoded an imagined API, not a contract the SDK
regressed from. This matches the repo's documented pattern of unverified
claims shipped in commit messages (see the performance-number cleanups in the
root `CLAUDE.md` and the Fase 2 test-suite remediation).

## Scope investigated

Before deciding, we measured who actually depends on the current contract
(grep across `v3/`, excluding `node_modules` and `.d.ts`):

- **Registries**: `src/registry/plugin-registry.ts` and
  `src/registry/enhanced-plugin-registry.ts` collect extension points by
  calling `registerMCPTools()` / `registerHooks()` / `register*()` and key
  plugins by `metadata.name`.
- **SDK surface**: `src/sdk/index.ts` (`PluginBuilder`), `src/core/base-plugin.ts`,
  `src/core/plugin-interface.ts` (`validatePluginMetadata` validates
  `name`/`version` — no `id`).
- **Mirror copy**: `@claude-flow/shared/src/plugins/types.ts` reproduces the
  same contract for cross-package consumers.
- **Native plugins**: `v3/plugins/agentic-qe` and `v3/plugins/prime-radiant`
  (and their tests), plus `v3/__tests__/integration/plugin-integration.test.ts`
  and `examples/plugin-creator`, all program against `metadata.name` +
  `register*()`. ~20 files call `registerMCPTools`/`registerHooks`; ~23 sites
  read `metadata.name`.
- **Zero** production readers of `metadata.id`, `metadata.capabilities`,
  `plugin.tools`, or `plugin.hooks` on SDK plugin instances exist. The
  apparent hits elsewhere are different types: `v3/src/infrastructure/plugins/`
  has its own legacy `PluginMetadata` (with `id`) in `v3/src/shared/types/index.ts`,
  and `cli/src/commands/plugins.ts` reads `hooks: string[]` off IPFS registry
  JSON entries — neither is the SDK contract.

The failing test file was the **only** consumer of the imagined shape.

## Decision

**The existing SDK contract is canonical. The test was rewritten to assert
it; `PluginMetadata` and `IPlugin` are unchanged.**

Concretely, in `ruvector-plugins.test.ts`:

- `metadata.id` assertions → `metadata.name` asserted against the real slug
  (`'reasoning-bank'`, `'semantic-code-search'`, …). The slug **is** the
  identity: it is what the registry keys on. No separate display name exists
  at the SDK layer, and none is invented.
- `metadata.capabilities` assertions → `metadata.tags` asserted against the
  tags each plugin actually declares via `withTags()`.
- `plugin.tools` → `plugin.registerMCPTools?.() ?? []` (tool-name
  expectations were already correct and are kept verbatim).
- `plugin.hooks` → `plugin.registerHooks?.() ?? []`, with events asserted
  against `HookEvent` enum members instead of invented PascalCase strings;
  the nonexistent `'PostToolCall'` expectation became `HookEvent.PostToolUse`,
  and the hook-pattern-library test now asserts the `PostToolUse` recording
  hook it really registers (renamed from "file operation hooks" to
  "pattern-recording hooks").

### Explicitly rejected: extending the SDK (option "a")

Adding optional `id`/`capabilities` fields and direct `.tools`/`.hooks`
properties was considered and rejected, even in its backward-compatible form:

1. **No demand.** Not one production consumer wants that shape; the sole
   driver was a test that was wrong on day 1. Changing a shared SDK used by
   the 21 native plugins to ratify a hallucinated API inverts the authority
   relationship between contract and test.
2. **Duplicate semantics are a standing ambiguity tax.** `id` vs `name`:
   which does the registry index, and what happens when they diverge?
   `capabilities` vs `tags`: which does discovery filter on? `.tools` vs
   `registerMCPTools()`: two read paths that either drift or require
   invariant-enforcement code forever. Every future plugin author and every
   registry implementation would pay this cost.
3. **The need it gestures at is already served elsewhere.** Distribution-level
   identity and taxonomy (`id`, `displayName`, `categories`, `trustLevel`)
   live in the IPFS plugin-registry schema (`plugins/store/discovery.ts`),
   which is a deliberately separate layer from the runtime SDK.
4. **YAGNI.** If a genuine consumer for richer runtime metadata appears, that
   is the moment to design it — against a real requirement, with a real
   migration story — not retroactively to green a test.

## Consequences

- `ruvector-plugins.test.ts` passes 35/35 and now documents the real contract
  (each rewritten describe block carries a contract note referencing this
  ADR), so it serves as executable documentation for plugin authors instead
  of misleading them.
- `PluginMetadata` / `IPlugin` remain untouched: zero risk to the registries,
  the native plugins, `@claude-flow/shared`, or published packages. The full
  `@claude-flow/plugins` suite (11 files, 435 tests) passes unchanged.
- Precedent set for the remaining Fase 2 triage: when a test disagrees with a
  shipped, multi-consumer contract and the git history shows the test was
  never green, the burden of proof is on the test. Verify what the contract
  actually is (and who consumes it) before "fixing" the SDK.
- If display names or a capability taxonomy are ever needed at the SDK layer,
  that change must arrive as its own ADR with a named consumer, not as a
  side effect of test remediation.
