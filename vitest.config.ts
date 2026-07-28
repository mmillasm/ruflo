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
      // NOTE (verified 2026-07-27): running them under the correct runner does
      // NOT make them all pass — `node --test` reports 95 pass / 15 fail.
      // Those 15 are genuine failures that the remediation plan assumed were
      // runner artifacts. They are tracked in Fase 2.3 triage, not silently
      // dropped by this exclusion.
      'tests/rvf-*.test.ts',
      'tests/*.test.cjs',
      'tests/*.test.mjs',
      'plugins/ruflo-*/scripts/*.test.mjs',
      'v3/@claude-flow/embeddings/__tests__/*.test.mjs',

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
