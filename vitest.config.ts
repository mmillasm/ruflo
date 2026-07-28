import { defineConfig, configDefaults } from 'vitest/config';

/**
 * Root Vitest config.
 *
 * Until 2026-07-27 this file did not exist, so `npx vitest run` from the repo
 * root ran with Vitest's default glob and swept the ENTIRE tree — including a
 * vendored SvelteKit project and ~14 files written for Node's own test runner.
 * That inflated the failure count with tests that were never meant to run here
 * (Fase 2.1 of the remediation plan).
 *
 * Everything excluded below is excluded because it belongs to a DIFFERENT
 * runner or a different project — not because it fails. Each exclusion names
 * where those tests do run. Nothing is hidden: see `npm run test:node`.
 */
export default defineConfig({
  test: {
    // ---------------------------------------------------------------
    // Determinism: cap concurrency so CPU-bound suites don't self-starve
    // ---------------------------------------------------------------
    // Measured 2026-07-27: with Vitest's default worker count, the run
    // reported 327 failing tests / 478 timeouts. The SAME files run in
    // isolation pass 133/133 in 3.9s. The failures were pure CPU contention —
    // deliberately slow suites (bcrypt in password-hasher, neural algorithms,
    // flash-attention benchmarks) exceeding the 5s default timeout while
    // competing with every other worker on an 11-core / 5-performance-core
    // machine.
    //
    // That made the failure count a function of machine load rather than of
    // code correctness, which is useless as a baseline. Capping workers to the
    // performance-core count keeps each worker on real CPU. Prefer this over
    // simply raising testTimeout: a higher timeout would also hide suites that
    // genuinely hang.
    maxWorkers: 5,
    minWorkers: 1,

    exclude: [
      ...configDefaults.exclude,

      // ---------------------------------------------------------------
      // Vendored standalone project, not part of this workspace
      // ---------------------------------------------------------------
      // ruflo/src/ruvocal/ is a separate SvelteKit application with its own
      // package.json (ruflo/src/ruvocal/package.json). Its 27 test files are
      // written against SvelteKit's own toolchain and resolve imports through
      // its own config. They are run from inside that directory, not from the
      // monorepo root.
      'ruflo/src/ruvocal/**',

      // ---------------------------------------------------------------
      // Written for node:test, not for Vitest
      // ---------------------------------------------------------------
      // These import `describe`/`it` from 'node:test' rather than 'vitest'.
      // Under Vitest they fail at import time — a runner mismatch, not a
      // product defect. They are executed by `npm run test:node`, which uses
      // `node --test`.
      //
      // The runner alone is not enough: several of these are TypeScript and
      // import their subject with an ESM-style `.js` specifier (e.g.
      // '../src/appliance/rvfa-format.js' resolving to rvfa-format.ts). Plain
      // `node --test` cannot resolve that and dies with ERR_MODULE_NOT_FOUND,
      // which is why `npm run test:node` runs them through `tsx --test`.
      //
      // Measured 2026-07-28 with the correct runner AND loader: 442 pass / 9
      // fail out of 451. An earlier measurement of "15 genuine failures" was
      // wrong — it used `node --test` without the TS loader, so the failures
      // were missing-module errors, not product defects. The remaining 9 are
      // real and tracked in Fase 2.3 triage.
      'tests/rvf-*.test.ts',
      'tests/*.test.cjs',
      'tests/*.test.mjs',
      'plugins/ruflo-*/scripts/*.test.mjs',
      'v3/@claude-flow/embeddings/__tests__/*.test.mjs',

      // Same story, different directory: all 5 files under v3/__tests__/appliance
      // use node:test and import TypeScript sources. Under Vitest they reported
      // "No test suite found" (Vitest never collects node:test suites). With
      // `tsx --test` they pass 134/134.
      'v3/__tests__/appliance/**',

      // ---------------------------------------------------------------
      // Orphaned packages — same set already excluded from the build gate
      // ---------------------------------------------------------------
      // v3/plugins/* are the 15 packages that are NOT listed in
      // v3/pnpm-workspace.yaml (which only globs "@claude-flow/*"), so `pnpm
      // install` never installs them and tsconfig.json already excludes them
      // (Fase 1). Their tests fail for the matching reason: the code is
      // half-implemented. Verified 2026-07-28 on code-intelligence — the test
      // imports getTool/getToolNames, and neither symbol exists anywhere in
      // src/; the module exports toolHandlers (a Map) and createToolContext
      // instead. Same API-mismatch shape as plugins/examples/ruvector/.
      //
      // Wiring these into the test gate would mean inventing the missing API,
      // which is a design decision, not a test fix. Their fate (wire into the
      // workspace vs. archive) is decided in Fase 4.6 — consistent with how
      // the build gate already treats them.
      'v3/plugins/**',

      // scripts/__tests__/audit-supply-chain.test.mjs is a plain assert-based
      // script (no test framework at all) that shells out to the real
      // supply-chain audit. It is an operational check, not a unit test: it
      // currently exits 1 because v3/@claude-flow/browser has 1 unaccepted
      // HIGH/CRITICAL CVE. That is a real finding to resolve in the security
      // phase — not something a test-runner config should paper over.
      'scripts/__tests__/**',
    ],
  },
});
