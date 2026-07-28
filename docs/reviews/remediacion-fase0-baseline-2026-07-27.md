# Línea base — Fase 0 del plan de remediación (2026-07-27)

Fuente: [`.claude/plans/ruflo-remediacion-100pct.plan.md`](../../.claude/plans/ruflo-remediacion-100pct.plan.md). Este documento captura el estado del repo **antes** de cualquier fix de código (Fase 1 en adelante), tras completar la higiene y la decisión de tooling de la Fase 0.

## Decisiones tomadas en Fase 0

- **Tooling canónico de `v3/`: pnpm.** Se retiró el campo `"workspaces"` vestigial de `v3/package.json` (apuntaba a `v3/claude-flow/`, un directorio que no existe) y se documentó `pnpm install` como flujo soportado en `v3/CLAUDE.md`. `pnpm install` desde `v3/` corre limpio en ~30s, sin `EUNSUPPORTEDPROTOCOL`.
- Limpieza de efectos colaterales de la auditoría previa: revertido `agentdb.rvf.lock`, borrados `test-database-provider.rvf` y `tests/.tmp-ctx-test/`, borrados 6 `package-lock.json` nunca trackeados en `v3/@claude-flow/{guidance,hooks,mcp,memory,security,swarm}/` (npm install ad-hoc dentro de paquetes que viven en el workspace pnpm real).

## Build — TypeScript

| Paquete | Errores TS | Nota |
|---|---:|---|
| `v3/@claude-flow/cli` | **1** | `src/appliance/rvfa-signing.ts:272` (TS2345, `KeyObject` vs `RawPublicKeyInput`). Causa raíz confirmada: `@types/node` no está pineado en el `package.json` del CLI; se resuelve a `26.1.1` flotante (vs. `20.19.27` que usan el resto de los paquetes vía peer deps de `vitest`/`inquirer`). |
| `v3/@claude-flow/swarm` | 0 | limpio |
| `v3/@claude-flow/mcp` | 0 | limpio |
| `v3/@claude-flow/memory` | 0 | limpio |
| `v3/@claude-flow/hooks` | 0 | limpio |
| `v3/@claude-flow/security` | 0 | limpio |
| `v3/@claude-flow/guidance` | 0 | limpio |
| **`tsc` raíz** (`npm run build` = `tsc` contra el tsconfig raíz) | **425** | Ver desglose abajo. Plan original citaba 435 (auditoría previa) — drift menor esperable. |

### Desglose de los 425 errores de `tsc` raíz por directorio

```
186  v3/@claude-flow/plugins        ← código de producto real, NO es ruido de goal_ui/examples
 53  v3/mcp/index.ts
 31  v3/mcp/tools
 29  v3/goal_ui                     ← app Vite/React/Supabase ajena (candidata a exclude, F1.3)
 28  v3/index.ts
 15  v3/plugins/gastown-bridge
 11  v3/plugins/prime-radiant
  7  v3/mcp/transport
  6  v3/src/infrastructure
  6  v3/plugins/quantum-optimizer
  6  v3/plugins/hyperbolic-reasoning
  5  v3/@claude-flow/security       ← el paquete compila limpio en aislamiento; error solo bajo tsconfig raíz
  5  v3/@claude-flow/memory         ← ídem
  4  v3/@claude-flow/cli            ← incluye el error real de rvfa-signing.ts + ruido de tsconfig raíz
  3  v3/mcp/tool-registry.ts
  3  v3/@claude-flow/deployment
  2  v3/swarm.config.ts
  2  v3/src/task-execution
  2  v3/plugins/{perf-optimizer,neural-coordination,legal-contracts,healthcare-clinical,financial-risk,cognitive-kernel,code-intelligence} (2 c/u)
  2  v3/mcp/server.ts
  2  v3/@claude-flow/providers
  1  v3/vitest.config.ts, v3/plugins/agentic-qe, v3/mcp/connection-pool.ts
```

**Hallazgo nuevo respecto al plan:** el plan (Fase 1.3) enfatizaba excluir `v3/goal_ui/`, `examples/` y `tests/` del `include` de `tsconfig` raíz como la fuente del "76% de ruido". En esta corrida, `v3/@claude-flow/plugins` (186 errores, 44% del total) es el mayor contribuyente individual y **es código de producto**, no ruido descartable — necesita triage real en Fase 1.6, no solo exclusión de tsconfig. `goal_ui` (29) sigue siendo candidato limpio a `exclude`.

## Build — Cargo

Confirmado el hallazgo del plan: `cargo metadata --no-deps` desde la raíz falla con:
```
error: multiple workspace roots found in the same workspace:
  v3/plugins/gastown-bridge
  <repo-root>
```
Sin resolver — fix propuesto en Fase 1.2 (mover `gastown-bridge` de `members` a `exclude` en el `Cargo.toml` raíz).

## Tests — Vitest raíz

```
Test Files  81 failed | 407 passed | 4 skipped (492)
     Tests  206 failed | 10748 passed | 129 skipped (11083)
  Duration  90.75s (transform 23.72s, collect 45.03s, tests 397.52s)
```

Plan original citaba "90 archivos / 204 tests" fallidos (auditoría previa, invocación sin workspace config). Cifras actuales (81/206) en la misma magnitud — drift menor esperable.

### Clasificación de los 81 archivos fallidos

| Categoría | Archivos | Acción prevista (Fase 2) |
|---|---:|---|
| `ruflo/src/ruvocal/**` — fork SvelteKit ajeno | 27 | Excluir del glob de Vitest raíz |
| Archivos `node:test` barridos por Vitest (`tests/rvf-*.test.ts` ×7, `tests/*.test.cjs`/`.mjs`, `scripts/__tests__/*.mjs`, `plugins/ruflo-*/scripts/*.test.mjs`) | ≈12 | Excluir del glob de Vitest o migrar a runner `node --test` propio |
| **`v3/@claude-flow/**`, `v3/plugins/**`, `v3/__tests__/**`** — código de producto real, requieren triage genuino | **41** | Uno por uno en Fase 2.3 (ver lista completa abajo) |

Confirmado por muestreo: `tests/context-persistence-hook.test.mjs` y `tests/hook-handler-runwithtimeout.test.cjs` importan explícitamente de `'node:test'`, no de `'vitest'` — se ejecutan bajo el runner equivocado.

### Los 41 archivos que requieren triage genuino en Fase 2

```
v3/@claude-flow/cli/__tests__/agenticow-tools.test.ts
v3/@claude-flow/cli/__tests__/funnel.test.ts                          ← ADR-311, decisión humana (F2.3)
v3/@claude-flow/cli/__tests__/helper-signing.test.ts                  ← re-firmar (protocolo CLAUDE.md)
v3/@claude-flow/cli/__tests__/hook-handler-artifact-parity.test.ts
v3/@claude-flow/cli/__tests__/integration-docker.test.ts
v3/@claude-flow/cli/__tests__/issue-2733-statusline-model-name.test.ts
v3/@claude-flow/cli/__tests__/mcp-tools-deep.test.ts
v3/@claude-flow/cli/__tests__/memory-search-2790.test.ts
v3/@claude-flow/cli/__tests__/memory-search-recall-2558.test.ts       ← se espera resuelto tras F1 (build CLI)
v3/@claude-flow/cli/__tests__/neural-router.test.ts
v3/@claude-flow/cli/__tests__/output.test.ts
v3/@claude-flow/cli/__tests__/planflip-mempoison-2752.test.ts
v3/@claude-flow/cli/__tests__/pq-validation.test.ts
v3/@claude-flow/cli/__tests__/security-scan-persistence.test.ts
v3/@claude-flow/cli/__tests__/sona-embeddings-validation.test.ts
v3/@claude-flow/cli/__tests__/statusline-cost-display.test.ts         ← CRLF vs LF
v3/@claude-flow/cli/__tests__/validate-input-path-2352.test.ts
v3/@claude-flow/cli/__tests__/version-anv.test.ts
v3/@claude-flow/codex/tests/generators.test.ts
v3/@claude-flow/codex/tests/migrations.test.ts                        ← contrato TOML, decisión humana (F2.3)
v3/@claude-flow/embeddings/__tests__/minimal.test.mjs
v3/@claude-flow/embeddings/__tests__/simple.test.mjs
v3/@claude-flow/hooks/src/__tests__/reasoningbank.test.ts             ← timeouts storePattern
v3/@claude-flow/plugins/examples/ruvector-plugins/ruvector-plugins.test.ts  ← export duplicado index.ts:9 (bug real, 1 línea)
v3/@claude-flow/swarm/__tests__/consensus.test.ts
v3/@claude-flow/swarm/__tests__/topology.test.ts
v3/__tests__/appliance/gguf-engine.test.ts
v3/__tests__/appliance/rvfa-builder.test.ts
v3/__tests__/appliance/rvfa-distribution.test.ts
v3/__tests__/appliance/rvfa-format.test.ts
v3/__tests__/appliance/rvfa-signing.test.ts                           ← se espera resuelto tras F1 (fix rvfa-signing.ts)
v3/__tests__/integration/swarm-integration.test.ts
v3/plugins/code-intelligence/tests/mcp-tools.test.ts
v3/plugins/code-intelligence/tests/types.test.ts
v3/plugins/cognitive-kernel/tests/bridges.test.ts
v3/plugins/cognitive-kernel/tests/mcp-tools.test.ts
v3/plugins/financial-risk/tests/mcp-tools.test.ts
v3/plugins/healthcare-clinical/tests/types.test.ts
v3/plugins/hyperbolic-reasoning/tests/mcp-tools.test.ts
v3/plugins/legal-contracts/tests/mcp-tools.test.ts
v3/plugins/legal-contracts/tests/types.test.ts
v3/plugins/quantum-optimizer/tests/mcp-tools.test.ts
```

Nota: varios de estos (`ruvector-plugins.test.ts`, los `appliance/rvfa-*.test.ts`, posiblemente `memory-search-recall-2558.test.ts`) probablemente colapsan a menos causas raíz una vez arreglado el bug de export duplicado y el build del CLI (Fase 1) — el conteo de 41 archivos no implica 41 causas independientes.

## Logs completos (no committeados, referencia local de esta sesión)

- `tsc` CLI: `/private/tmp/claude-501/.../scratchpad/cli-tsc-baseline.log`
- `tsc` raíz: `/private/tmp/claude-501/.../scratchpad/root-tsc.log`
- `tsc` por paquete (swarm/mcp/memory/hooks/security/guidance): `/private/tmp/claude-501/.../scratchpad/{paquete}-tsc.log`
- `cargo metadata`: `/private/tmp/claude-501/.../scratchpad/cargo-metadata.log`
- `vitest run` raíz (18k líneas): `/private/tmp/claude-501/.../scratchpad/root-vitest-baseline.log`

Estos logs viven en el directorio de scratchpad de la sesión (efímero) — si se necesita conservarlos, copiar a un lugar persistente antes de que termine la sesión.

## Fase 1 — Resultados (2026-07-27, misma sesión)

**Estado final: los 7 paquetes centrales compilan limpio en aislamiento (`cli`, `swarm`, `mcp`, `memory`, `hooks`, `security`, `guidance`), `cargo check --workspace` resuelve sin conflictos, y el `tsc` raíz bajó de 425 a 1 error** (ese único error es un falso positivo verificado — ver abajo). `npm run build:ts` ya no enmascara fallas con `|| true`.

### 1.1 — CLI: fix de una línea, sin tocar código
`@types/node` no estaba pineado en `v3/@claude-flow/cli/package.json`; resolvía a `26.1.1` flotante (vs. `20.19.27` del resto del monorepo), rompiendo `createPublicKey()` en `rvfa-signing.ts:272`. Se agregó `"@types/node": "^20.10.0"` a `devDependencies` (misma convención que `hooks`/`guidance`) y el error desapareció sin cambiar código — confirma que la causa raíz del plan era 100% de resolución de versiones.

### 1.2 — Cargo
`v3/plugins/gastown-bridge` se movió de `members` a `exclude` en el `Cargo.toml` raíz: es su propio workspace independiente (2 members WASM propios) y Cargo rechaza un member que a la vez es root de otro workspace. `ruflo-federation-peer` — cuyo estado de compilación el plan marcaba como "desconocido" porque cargo abortaba antes de llegar a él — **compila limpio** una vez resuelto el conflicto.

### 1.3–1.7 — tsconfig raíz: de 425 a 1 error

| Paso | Errores resueltos | Método |
|---|---:|---|
| Excluir `v3/goal_ui/` (app Vite/React ajena, tsconfig propio) | −29 | Exclude |
| Codemod TS1205 (`export { Tipo }` → `export type`/`export { type Tipo }`) | −58 | Script determinista sobre 8 archivos, por coordenada exacta del compilador |
| Fix export duplicado `ruvector-plugins/index.ts:9` (bug real de parseo que el plan ya había identificado) | — | Bloque redundante eliminado (líneas 56-62 duplicaban 10-15) |
| Excluir `v3/mcp/**` — implementación **duplicada y huérfana** de `@claude-flow/mcp` real (sin `package.json`, nunca instalada, nada la importa — verificado) | −46 (5 eran bug real de imports faltantes en `quickStart()`, arreglado antes de excluir el resto) | Exclude + 1 fix real |
| Excluir `v3/plugins/**` — 15 paquetes nunca listados en `v3/pnpm-workspace.yaml`; al intentar cablearlos, 2 (`ruvector-upstream`, `prime-radiant`) tienen dependencias npm con 404 confirmado (`@ruvector/hyperbolic-hnsw-wasm`, `@claude-flow/coordination`) | −53 | Exclude (decisión del usuario: documentar para Fase 4.6, no forzar el cableado ahora) |
| Excluir `v3/index.ts` y `v3/swarm.config.ts` — stubs pre-reorganización que importan `./core/*`, `./coordination/*`, `./shared/*` como si existieran bajo `v3/`, pero esa estructura solo existe bajo `v3/src/` desde la reorganización; nada los importa (verificado) | −30 | Exclude |
| Excluir `v3/vitest.config.ts` — se type-checkeaba contra `vitest@3.2.6` de la raíz en vez de `vitest@4.1.8` de `v3/` (desajuste de resolución cross-workspace, no bug) | −1 | Exclude |
| Excluir `v3/@claude-flow/plugins/examples/ruvector/**` (9 archivos) — mismatch de API real: escritos contra `IRuVectorClient` (interfaz documentada pero sin implementación), la clase real `RuVectorBridge` tiene una API de tablas Postgres completamente distinta. Investigado y confirmado por subagente (ver abajo) | −103 | Exclude, con evidencia detallada en el propio tsconfig |
| Fix `plugins/examples/ruvector-plugins/**` (6 archivos) — null-safety genuino (`Security.validateString/Number` devuelve `string\|number\|null`) + 1 bug real (`HookEvent.PostToolCall` no existe, era `PostToolUse`) | −66 | Arreglado por subagente `examples-fixer` (ver detalle abajo) |
| Excluir `**/dist/**` (solo `"dist"` bare no alcanza dist/ anidados) — `.d.ts` generados y stale en 7 paquetes redeclaraban los mismos globals que su fuente `.ts` (script-mode files sin import/export) | −5 | Exclude, patrón sistémico |
| Excluir `v3/@claude-flow/*/examples/**` y `.../benchmarks/**` — cada paquete ya se auto-excluye estos directorios en su propio tsconfig (`include: ["src/**/*"]`); solo el barrido raíz los alcanzaba | −4 (2 de ellos, en `memory/benchmarks/longmemeval/`, referencian una clase `OnnxEmbedder` que nunca se creó — gap de feature real, no bug de tipos) | Exclude sistémico + 1 fix real (`storagePath`→`dbPath` en `agentdb-adapter.ts`) |
| Excluir `**/__tests__/**` — helpers/scripts de test que no terminan en `.test.ts` (ya excluido) usan `expect` global de vitest, configurado por paquete, no en la raíz | −7 | Exclude sistémico |
| Fixes puntuales de código real en `v3/src/` (5 archivos: `AgentTools.ts`, `ConfigTools.ts` ×3, `MemoryTools.ts`, `WorkflowEngine.ts`) y `v3/@claude-flow/deployment/examples/` (3 archivos, imports corregidos a la convención relativa ya usada en `memory/examples/`) | −10 | Fixes reales: doble-cast en boundary de tool MCP (`as unknown as T`), anotación de tipo faltante (`const taskChunks: (typeof workflow.tasks)[] = []` — TS infería `never[]`) |
| Fix `sql.js`/`better-sqlite3` — 3 archivos usaban patrones de import incompatibles con el `export =` + namespace-merge de esas librerías (`Database` como named export de `sql.js` no existe; `import type Database from 'better-sqlite3'` no preserva el merge) | −3 | Fix real: `type X = initSqlJs.Database` / import de valor en vez de `import type` |

**El único error restante** (`v3/@claude-flow/memory/src/sqlite-backend.ts:86`, `'Database' only refers to a type, but is being used as a namespace here`) es un **falso positivo verificado**: `cd v3/@claude-flow/memory && npx tsc --noEmit` da **0 errores** con el mismo código — es decir, el paquete real (el que importa el criterio de validación de la Fase 1) compila limpio. El barrido raíz pierde el namespace-merge de `better-sqlite3` al procesar ~500 archivos en un solo programa `tsc`, aunque runtime package y `@types` resuelven al mismo path físico en ambos contextos (investigado: no hay declaración `Database` global colisionando, no hay doble versión de `@types/better-sqlite3`). No se pudo excluir vía `tsconfig.exclude` porque el archivo se importa transitivamente desde otros archivos sí incluidos (a diferencia de `v3/mcp/`, `v3/index.ts`, etc., que están genuinamente huérfanos). Se documenta en vez de seguir invirtiendo tiempo en un artefacto de la herramienta, no del código.

### Trabajo delegado a subagente (`examples-fixer`, en paralelo)

Mientras se investigaba `v3/mcp` y `v3/plugins`, un subagente arregló los 66 errores de `plugins/examples/ruvector-plugins/` (null-safety + 1 bug real de nombre de enum) e investigó a fondo `plugins/examples/ruvector/` (103 errores) antes de **decidir no tocarlo**: son ~4500 líneas escritas contra una interfaz (`IRuVectorClient`) que nunca fue implementada por la clase real (`RuVectorBridge`, API de Postgres completamente distinta) — arreglarlo de raíz es trabajo de diseño (implementar un adapter o reescribir los ejemplos), no un fix de tipos de Fase 1. Correctamente escaló en vez de improvisar.

### Decisiones diferidas (no tomadas en esta sesión)

- **`noEmitOnError`**: el plan sugería "evaluar" activarlo en el gate de build. No se activó — es un cambio de política a nivel `tsconfig.base.json` que afecta a los 7+ paquetes, no un fix mecánico; queda para una decisión explícita posterior.
- **Higiene de `.gitignore`**: se agregó `/target/` (Cargo, nunca antes generado porque cargo estaba roto) y se amplió el patrón de `proven-config.json`/`​.proven-config-version` con `**/` para cubrir instancias anidadas (antes solo cubría la raíz) — hallazgo colateral, no parte del plan original.

### Hallazgos nuevos para Fase 4.6 (matriz de paquetes huérfanos)

Más huérfanos de los que el plan original identificó:
- `v3/mcp/` — implementación completa y divergente de MCP (41 archivos), nunca instalada, candidata a borrar o rescatar.
- `v3/index.ts`, `v3/swarm.config.ts` — stubs muertos de la arquitectura pre-`v3/src/`.
- `v3/plugins/*` (15 paquetes) — nunca wireados al workspace pnpm; al menos `ruvector-upstream` y `prime-radiant` tienen dependencias 404 en npm.
- `v3/@claude-flow/plugins/examples/ruvector/` — ejemplos contra una interfaz sin implementación real.
- `v3/@claude-flow/memory/benchmarks/longmemeval/adapters/baseline-adapter.ts` — referencia una clase (`OnnxEmbedder`) que nunca se creó.

## Próximo paso

Fase 0 y Fase 1 completas. Queda pendiente de aprobación humana entrar a **Fase 2 — Tests en verde**, que parte de la clasificación ya hecha en la línea base (27 archivos del fork `ruvocal`, ~12 archivos `node:test` mal barridos, 41 archivos con fallas genuinas) — varios de esos 41 deberían resolverse solos ahora que el build del CLI y el bug de `ruvector-plugins` están arreglados.
