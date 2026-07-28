# Plan: Remediación integral de ruflo/claude-flow v3 — build, brecha funcional, documentación honesta y experiencia de usuario

## Restatement de Requisitos

Se pidió un plan para verificar, revisar y arreglar el repo `ruflo/claude-flow` v3 (monorepo TS+Rust, v3.32.22) hasta dejarlo "funcionando al 100%", con ejecución multi-agente y ruteo de modelos según complejidad. El "100%" está definido por cuatro dimensiones combinadas: (1) build + tests en verde en toda la suite real; (2) cierre de la brecha funcional entre las librerías reales pero desconectadas (Raft/PBFT/Gossip, catálogo MCP completo en HTTP/WS, executor de `coordination_orchestrate`) y lo que el CLI realmente hace; (3) documentación honesta que corrija cifras infladas y conteos obsoletos, incluido el texto de `--help` visible al usuario; (4) que `npx ruflo init` funcione de punta a punta para un usuario real, con memoria/AgentDB activa, MCP conectado y sin fallos silenciosos. Este plan cubre las cuatro dimensiones con fases dedicadas y no ejecuta nada todavía.

## Hallazgos que fundamentan este plan

Síntesis accionable de la investigación previa + la auditoría de 7 agentes recién completada:

- **El build del CLI tiene exactamente 1 error real y su causa raíz es reproducibilidad, no código**: `v3/@claude-flow/cli/src/appliance/rvfa-signing.ts:272` (TS2345, `KeyObject` vs `RawPublicKeyInput`) porque el CLI no fija `@types/node` en devDependencies y npm resolvió `@types/node@26.1.1` vía el comodín de `@types/http-proxy`. El build es no-reproducible entre máquinas/fechas.
- **`npm install` plano dentro de cualquier subpaquete de `v3/` es imposible hoy**: `v3/package.json` declara `"workspaces"` (semántica npm) mientras coexiste con `v3/pnpm-workspace.yaml` + `pnpm-lock.yaml` reales y dos paquetes con protocolo `workspace:*` (solo pnpm) → `EUNSUPPORTEDPROTOCOL`. El workaround verificado es `npm install --no-workspaces`. Además, `cargo build/check/metadata` está 100% roto por conflicto de workspace roots (`Cargo.toml` raíz vs `v3/plugins/gastown-bridge/Cargo.toml`).
- **La suite de tests reporta 90 archivos fallidos / 204 tests fallidos, pero la mayoría son falsos positivos del método de invocación**: no existe `vitest.config.ts` raíz; el barrido arrastra 27 archivos del fork Svelte `ruflo/src/ruvocal/`, 16 archivos escritos para `node:test`, y ≥11 fallas por dependencias no instaladas por paquete. Los 4 casos re-testeados con su config propio pasaron 100%. Quedan ~30-40 fallas genuinas que sí ameritan triage (funnel/ADR-311, helper-signing hash, codex TOML, reasoningbank timeouts, export duplicado en `plugins/examples/ruvector-plugins/index.ts:9`).
- **El patrón "librería real huérfana del CLI" es sistémico, no una anomalía de swarm**: 6 de 9 paquetes auditados tienen código genuino que el CLI nunca importa (`providers`, `claims`, `deployment`, `performance`, `plugins`, y `swarm` ya conocido). El CLI reimplementa versiones degradadas (CRUD de JSON) en su lugar.
- **Caso más grave — éxito falso reportado al usuario**: `cli/src/commands/deployment.ts` escribe `status: 'deployed'` en un JSON local e imprime "Deployed version X to prod" sin ejecutar absolutamente nada, sin advertencia alguna. Peor que el "Honest stub" de `coordination_orchestrate`.
- **Caso más barato de arreglar con más impacto — `guidance`**: el CLI tiene 6 subcomandos cableados (`cli/src/commands/guidance.ts:23-466`) que hacen `import('@claude-flow/guidance/...')`, pero la dependencia no está declarada ni en `dependencies` ni en `optionalDependencies`. Reproducido contra el paquete publicado en npm: los 6 subcomandos fallan en runtime con error degradado a mensaje benigno. El paquete existe publicado (`3.0.0-alpha.3`) y es de los códigos más limpios del repo (22.6k LOC, cero fabricación).
- **Las cifras desacreditadas siguen vivas en superficie de usuario**: "150x-12,500x" en 50+ ubicaciones incluido `--help` (`cli/src/commands/memory.ts:~326`) y docstrings de API pública (`aidefence/src/index.ts:8,100`); "2.49x-7.47x" (ex-`Math.random()`) en 240+ ubicaciones incluido `cli/src/commands/hooks.ts:~5464` y **hardcodeada como umbral pass/fail de negocio** en `performance/src/attention-integration.ts:313`. Conteos falsos: "17 hooks" (reales: 35), "26 comandos" (reales: 51), "19 AgentDB controllers" (ya desmentido por el propio repo: 15 tools / 29 nombres), "50+ patterns" en aidefence (reales: 34), `testCoverage: '>95%'` hardcodeado en `security/src/CVE-REMEDIATION.ts:497`.
- **Métricas fabricadas residuales en el mismo espíritu del Math.random() purgado**: similitud literal `0.8`/`0.5` devuelta como resultado de "HNSW vector search" en `aidefence/src/domain/services/threat-learning-service.ts:130-137` (es un `JSON.stringify().includes()`); bridges WASM decorativos en `v3/plugins/` (quantum-optimizer, hyperbolic-reasoning) que declaran interfaces jamás invocadas, con 2 de 3 paquetes `@ruvector/*-wasm` dando 404 en npm.
- **La experiencia npm del usuario final está en mejor estado que el checkout fuente**: los 4 tarballs publicados (`ruflo`, `claude-flow`, `@claude-flow/cli`, `@claude-flow/memory`) SÍ incluyen `dist/` compilado; `memory` tiene `prepublishOnly` con gate de exports (ADR-125); el bug #2545 del sidecar npx ya está parcheado (`init/memory-package-resolver.ts`). **Pero nadie ejecutó `npx ruflo init` E2E en un directorio limpio** — es el hueco de verificación explícito.
- **CI en main está verde** (28/30 runs success; las 2 fallas son de ramas Dependabot: un guardrail correcto de lockfile + una config `go_modules` rota en `dependabot.yml` que fallará en cada corrida hasta corregirse). Hay 18 vulnerabilidades npm (0 críticas, 14 altas): 8-9 con fix directo confirmado por dry-run; el resto es la cadena `sharp`/libvips sin fix upstream + `agentic-flow` que requiere bump major. Además: backlog de 20 issues "Dream Cycle" de seguridad sin triar.
- **Ya existen efectos colaterales en el árbol de trabajo de esta auditoría**: `package-lock.json` nuevos/modificados en 7 paquetes + raíz, `dist/` parciales, un `.rvf` de test. Hay que limpiar antes de cualquier commit para no contaminar el historial. También existe el riesgo documentado en `CLAUDE.md` de corrupción de helpers por sesiones MCP concurrentes.

---

## Fases de Implementación

El orden respeta dependencias duras: sin build reproducible no hay tests confiables; sin tests confiables no se puede validar el cierre de brecha funcional; la documentación honesta es paralelizable desde el día 1 porque no depende de código. La Fase 6 (E2E usuario final) es la validación integral y va al final porque consume el resultado de todas las anteriores.

### Fase 0 — Higiene y línea base (prerrequisito de todo)

**Objetivo:** partir de un árbol limpio y una decisión de tooling única, para que cada fase posterior sea verificable contra una línea base conocida.

Tareas:
1. Limpiar los efectos colaterales de la auditoría: revertir/descartar los `package-lock.json` espurios (7 paquetes + raíz), `dist/` parciales, `.rvf` temporal. Verificar con `git diff --stat` que los helpers firmados (`.claude/helpers/*.cjs`, `helpers.manifest.json`) no fueron pisados por sesiones concurrentes (riesgo documentado en `CLAUDE.md`), y revertirlos si están sucios.
2. **Decisión de tooling (requiere aprobación humana):** declarar pnpm como la herramienta canónica de `v3/` (es lo que el propio repo ya es de facto: `pnpm-workspace.yaml` + lock de 477 KB committeado y actual). Retirar el campo `"workspaces"` vestigial de `v3/package.json` **o** eliminar `workspace:*` de `plugin-agent-federation`/`plugin-iot-cognitum` si se quiere soportar npm plano. Documentar el comando soportado en `v3/CLAUDE.md` (que hoy instruye un `npm install` que falla con `EUNSUPPORTEDPROTOCOL`).
3. Ejecutar la instalación canónica elegida (`pnpm install` desde `v3/`) y capturar la línea base de build/tests ANTES de tocar código.

**Criterio de validación:** `git status --short` limpio (salvo cambios intencionales); `cd v3 && pnpm install` (o el flujo decidido) termina sin `EUNSUPPORTEDPROTOCOL`; documento de línea base con conteos exactos de errores de build y tests fallidos guardado en `docs/reviews/`.

### Fase 1 — Build en verde (dimensión 1a)

**Objetivo:** que cada paquete de producto compile con exit 0 de forma reproducible, y que el build raíz y Cargo dejen de estar rotos por configuración.

Tareas:
1. **`v3/@claude-flow/cli/package.json`**: añadir `@types/node` pineado (versión alineada al Node target real del CLI, ej. `^22.x`) como devDependency directa. Reintentar `tsc`; si el error TS2345 de `rvfa-signing.ts:272` persiste con la versión pineada, ajustar el código (`createPublicKey(this.keyObj)` — envolver o tipar explícitamente). Es el único error del paquete central (verificado: `grep -c "error TS"` = 1).
2. **Cargo**: en el `Cargo.toml` raíz, mover `v3/plugins/gastown-bridge` de `members` a `exclude` (ya es un workspace independiente de facto con sus propios miembros WASM). Verificar después si `ruflo-federation-peer` compila en aislamiento — hoy no se pudo comprobar porque cargo aborta antes.
3. **tsconfig raíz**: acotar el `include` para excluir `v3/goal_ui/` (app Vite/React/Supabase ajena), `examples/` y `tests/` del barrido de `npm run build` raíz. Hoy el 76% de los 435 errores es ruido de código no-producto que entierra la señal real (~100 errores en `v3/mcp/*`, `v3/plugins/*`, `v3/src/*`).
4. **Codemod TS1205**: convertir `export { Tipo }` → `export type { Tipo }` en las 58 ocurrencias (50+ concentradas en `v3/mcp/index.ts`). Transformación determinista.
5. Corregir el export duplicado literal `MCPToolOptimizer` en `v3/@claude-flow/plugins/examples/ruvector-plugins/index.ts:9` (bug real de parseo, 1 línea).
6. Triage de los ~100 errores restantes de código de producto del build raíz (módulos no resueltos por falta de linking, `WebAssembly` sin lib DOM, incompatibilidades de interfaces en `v3/mcp/tools/v2-compat-tools.ts` y `v3/mcp/transport/http.ts`) — clasificar en "se arregla" vs "se excluye del gate con justificación escrita".
7. Eliminar el `|| true` de `build:ts` en el package.json raíz (hoy garantiza éxito de shell aunque tsc falle — falso positivo de salud) y evaluar activar `noEmitOnError` como gate.

**Criterio de validación:** `cd v3/@claude-flow/cli && npm run build` → exit 0, cero `error TS`. Los 7 paquetes centrales (swarm, mcp, memory, hooks, cli, security, guidance) compilan limpio. `cargo check` desde la raíz resuelve el workspace sin `multiple workspace roots`. `npm run build` raíz reporta 0 errores en el conjunto acotado.

### Fase 2 — Tests en verde de verdad (dimensión 1b)

**Objetivo:** una invocación de test canónica que corra solo lo que corresponde, con las fallas genuinas arregladas — no maquilladas.

Tareas:
1. Crear configuración de workspace de Vitest en la raíz (`vitest.workspace.ts` o proyecto por paquete) que: excluya `ruflo/src/ruvocal/` (fork SvelteKit ajeno, 27 archivos), excluya los 16 archivos `node:test` del glob de Vitest (o migrarlos, o darles un runner script propio `node --test`), y delegue en el `vitest.config.ts` propio de cada paquete (verificado: los 4 casos re-testeados con su config pasaron 100%).
2. Investigar y documentar el mecanismo que disparó `npm install` automáticos dentro de la corrida de tests (observación verificada pero causa no confirmada — timestamps 13:13-13:18 en 6 paquetes). Si un test instala dependencias como efecto colateral, aislarlo.
3. **Triage de las fallas genuinas** (las que sobreviven al fix de invocación), una por una:
   - `funnel.test.ts` — el guardrail ADR-311 "zero local promo content" falla porque el CLI SÍ embarca contenido promocional. **Decisión humana requerida**: ¿regresión real (quitar el contenido) o cambio de diseño intencional (actualizar test + ADR)?
   - `helper-signing.test.ts` — mismatch real de hash del manifiesto vs `auto-memory-hook.mjs` shippeado. Re-firmar siguiendo el protocolo anti-corrupción de `CLAUDE.md` (revert → sign → verify → add en una sola invocación encadenada).
   - `statusline-cost-display.test.ts` — CRLF vs LF: normalizar el generador o fijar `.gitattributes`, no tocar la aserción.
   - `memory-search-recall-2558.test.ts` — se resuelve solo cuando Fase 1 arregla el build del CLI (el CLI devolvía búsqueda vacía silenciosamente por `dist/` roto). Verificar que pasa tras Fase 1 y evaluar convertir el `describe.skipIf(!CLI_BUILT)` en fallo explícito para que no vuelva a degradar en silencio.
   - `reasoningbank.test.ts` — 4 timeouts de `storePattern`: diagnosticar si es conexión SQLite/AgentDB que cuelga (arreglar el fail-fast en el código) o timeout de 5s demasiado corto para el entorno (subir en config del paquete, con justificación).
   - `codex/tests/migrations.test.ts` — mismatch genuino test vs comportamiento de `convertSettingsToToml` (falta sección `[mcp_servers.ruflo]`): determinar cuál es el contrato correcto y arreglar el lado equivocado.
   - `quantum-optimizer` 10/86, `hyperbolic-reasoning` 1/107, `healthcare-clinical` 5/120 — bugs reales de handlers MCP (`TypeError` en `parsed.details`), arreglar.
4. Barrido final: re-correr los 90 archivos originalmente fallidos con la invocación correcta y producir la cifra REAL de fallas genuinas (la auditoría fue honesta en que no pudo darla sin este trabajo).

**Criterio de validación:** `npx vitest run` (con el workspace config nuevo) desde la raíz → 0 tests fallidos, 0 archivos fallidos, con los skips restantes justificados por escrito. El log se archiva como nueva línea base.

### Fase 3 — Documentación honesta (dimensión 3 — **paralelizable desde el día 1**)

**Objetivo:** que el repo se describa a sí mismo con precisión: cifras medidas o etiquetadas como no verificadas, conteos reales, `--help` que no mienta.

Esta fase no depende de las Fases 1-2 y debe arrancar en paralelo. Se divide en dos sub-frentes con criticidad distinta:

**3a — Superficie de usuario y código (crítico, requiere cuidado):**
1. `cli/src/commands/memory.ts:~326` — quitar "150x-12,500x" del texto de `--help`; reemplazar por la cifra medida (~1.9x-4.7x según crossover, fuente: `scripts/benchmark-intelligence.mjs`).
2. `cli/src/commands/hooks.ts:~5464` — quitar "2.49x-7.47x Flash Attention" del help (la cifra era literalmente `Math.random()*4.98`; ya purgada del cálculo, falta purgar el texto).
3. `performance/src/attention-integration.ts:313,149` — **la cifra de marketing convertida en gate de negocio**: `meetsTarget = speedup >= 2.49`. Reemplazar el umbral por uno derivado de benchmark real o eliminar el gate con nota; no es un cambio de docs, es un cambio de semántica de API (revisar consumidores).
4. `aidefence/src/index.ts:8,100` y `threat-learning-service.ts:8,168` — quitar "150x-12,500x" de docstrings de API pública; corregir "50+ patterns" → 34 en README (líneas 12, 41, 50); y **etiquetar honestamente** la similitud hardcodeada `0.8`/`0.5` del `InMemoryVectorStore` (`threat-learning-service.ts:130-137`) como substring-matching de fallback, no "HNSW" (el fix real de esa métrica es Fase 4).
5. `security/src/CVE-REMEDIATION.ts:497` — quitar `testCoverage: '>95%'` hardcodeado o derivarlo de medición real.
6. `providers/src/index.ts:17` — quitar "85%+ savings" (existe solo como comentario, sin cálculo detrás).

**3b — Barrido masivo de docs/skills/agents (mecánico, alto volumen):**
7. Purga coordinada usando el inventario exhaustivo ya producido por el agente de docs-drift como lista de trabajo: `150x-12,500x` (50+ ubicaciones), `2.49x-7.47x` (240+ ubicaciones), `314 MCP tools`, `26 CLI commands`/`140+ subcommands`, `17 hooks + 12 workers`, `19 AgentDB controllers`, `21 native plugins`. **Antes de reemplazar, generar los conteos reales una sola vez** (script que cuente comandos/subcomandos/hooks/tools desde el código: hoy 51 comandos, 35 subcomandos de hooks, ~15 tools `agentdb_*`, etc.) y usar esa fuente única para todos los reemplazos — no corregir un número inflado con otro número inventado.
8. Resolver la inconsistencia interna "17 vs 27 vs 35" hooks eligiendo el conteo generado desde código.
9. Para los speedups de terceros no verificables en este repo (8-19x neural-trader, 40,000x cache, 75x ONNX, porcentajes 30-60%/50-75%/89%): etiquetar como "claimed upstream, not verified in-tree" en vez de borrar o afirmar.
10. Actualizar `CLAUDE.md` raíz y `v3/CLAUDE.md` (que también arrastran "17 hooks", "26 comandos", "314 tools", "150x" en CLAUDE.local.md).

**Criterio de validación:** script de guard (grep en CI) que falle si `150x-12,500x`, `2.49x-7.47x` o los conteos viejos reaparecen fuera de archivos de historia (`CHANGELOG`, audits que los citan como desmentidos); `node bin/cli.js memory --help` y `hooks --help` no imprimen ninguna cifra desacreditada; el script de conteos reales corre en CI y compara contra los números publicados en README.

### Fase 4 — Cierre de la brecha funcional (dimensión 2)

**Objetivo:** que las features documentadas funcionen de verdad, en orden de impacto/costo, sin romper la API pública actual.

Ordenadas de menor a mayor riesgo:

1. **`guidance` (quick win, impacto alto):** añadir `@claude-flow/guidance` a `optionalDependencies` de `@claude-flow/cli`, con degradación explícita cuando falte ("guidance no instalado — instala con...") en vez del mensaje benigno actual que parece error del CLAUDE.md del usuario. Sincronizar la divergencia de versión (fuente `alpha.4` vs npm `alpha.3`). Validar: `node bin/cli.js guidance compile -r ./CLAUDE.md` produce salida real.
2. **`deployment` (corrección de integridad, urgente):** decisión binaria con aprobación humana — (a) cablear `@claude-flow/deployment` real (que sí ejecuta `npm publish`/git tag con allowlist) detrás del comando, o (b) convertirlo en honest stub al estilo `coordination_orchestrate` (`executor: 'none'`, mensaje "tracking only — no deployment executed"). Lo inaceptable es el estado actual: `success: true` + "Deployed version X to prod" sin ejecutar nada. Validar: el comando nunca reporta éxito de una acción que no ocurrió.
3. **Catálogo MCP completo en HTTP/WS:** hoy el transporte no-stdio sirve solo los 4 tools genéricos de `@claude-flow/mcp`; el catálogo real de ~300-400 tools vive en el bucle JSON-RPC artesanal de `bin/cli.js`. Diseño: extraer el registro de tools de dominio (`cli/src/mcp-tools/*.ts`) a una interfaz consumible por ambos transportes, y hacer que el modo HTTP/WS lo registre. Validar: arrancar en HTTP, `tools/list` devuelve el catálogo completo; test de integración que compara conteo de tools stdio vs HTTP.
4. **`coordination_orchestrate` executor real:** cablear un executor mínimo (spawn de `claude -p` o delegación al Task tool del host vía el protocolo ya documentado en CLAUDE.md) manteniendo el campo `executor` observable — que pase de `'none'` a un valor real solo cuando de verdad ejecuta. Validar: test E2E que orquesta una tarea trivial y verifica que hubo ejecución, no solo escritura de JSON.
5. **Swarm/consenso — el hallazgo mayor (diseño primero, ADR obligatorio):** conectar `v3/@claude-flow/swarm` (Raft/PBFT/Gossip genuinos con tests de inyección de fallos) al CLI que hoy solo escribe `swarm-state.json` con conteo de votos ad-hoc. Enfoque propuesto: **no reemplazar** el flujo JSON actual (es la API pública de facto) sino introducir la librería como motor detrás con feature flag (`--consensus=real` o config), manteniendo el formato de estado actual como vista serializada. ADR previo que defina: qué subcomandos ganan consenso real, qué pasa en single-process (Raft de 1 nodo es válido; PBFT necesita 3f+1 — documentar el mínimo), y el plan de deprecación del conteo ad-hoc. Los agentes markdown de `.claude/agents/consensus/*.md` se re-etiquetan como prompts (no cableado) o se cablean, pero no quedan ambiguos. Validar: `@claude-flow/swarm` declarado como dependencia del CLI; suite de integración que ejecuta una elección Raft real vía comando `swarm`; los tests de inyección de fallos existentes pasan invocados desde el CLI.
6. **Política para el resto de huérfanos (`providers`, `claims`, `performance`, `plugins`):** no todo se cablea. Documento de decisión por paquete con tres salidas posibles: integrar (como guidance), deprecar/archivar con honestidad, o documentar explícitamente "librería standalone, el comando CLI homónimo es una implementación independiente más simple". Incluye: verificar si `@claude-flow/plugins` figura en el registry IPFS pese a no existir en npm (sospecha no confirmada de la auditoría — confirmar y corregir la entrada si aplica); reemplazar la similitud fabricada `0.8`/`0.5` de aidefence por cálculo real o por respuesta sin campo `similarity`; decidir sobre los bridges WASM decorativos de `v3/plugins/` (cablear las llamadas o quitar la promesa de aceleración) y las dependencias `@ruvector/*-wasm` que dan 404.

**Criterio de validación por fase completa:** cada gap cerrado tiene test de integración; ningún comando reporta éxito de acciones no ejecutadas (auditable con grep de patrones `printSuccess` sin exec asociado); ADR publicado para swarm; matriz paquete→decisión committeada en `docs/`.

### Fase 5 — Seguridad y CI (transversal, paralelizable con Fase 4)

**Objetivo:** cerrar lo accionable de las 18 vulnerabilidades y los fallos de automatización, sin fingir que lo sin-fix-upstream está resuelto.

1. `npm audit fix` (sin `--force`) — resuelve los 8-9 con fix directo confirmado por dry-run (axios, brace-expansion, fast-uri, js-yaml, postcss, hono, mcp-sdk, protobufjs, body-parser). Correr la suite completa después.
2. Evaluar el bump semver-major de `agentic-flow` → 1.10.2 (resuelve adm-zip + onnxruntime-node, ambas altas) — requiere test de regresión del chain de embeddings.
3. Cadena `sharp`/libvips sin fix upstream (raíz de 4-5 "altas" que son el mismo problema propagado): documentar como riesgo aceptado con tracking, no ocultar. Vinculado al issue #2514 ya abierto.
4. Corregir la entrada `go_modules` rota en `.github/dependabot.yml` (falla en cada corrida programada).
5. Triage del backlog de 20 issues "Dream Cycle" de seguridad (0 cerrados, el más viejo ~55 días) + #193 (7.5 meses): clasificar en accionable/duplicado/descartable — el problema no es cada hallazgo sino que el pipeline automatizado no tiene consumidor humano.

**Criterio de validación:** `npm audit` → 0 críticas (se mantiene), altas reducidas a solo las sin-fix-upstream documentadas; run de Dependabot go_modules en verde o ecosistema removido; issues de seguridad triados con label de resolución.

### Fase 6 — Experiencia de usuario final E2E (dimensión 4 — validación integral, al final)

**Objetivo:** confirmar empíricamente lo que la auditoría solo pudo inferir del código: que un usuario real con `npx ruflo init` obtiene memoria activa, MCP conectado y cero fallos silenciosos.

1. **Test E2E en entorno limpio** (contenedor Docker o directorio temporal sin node_modules heredados): `npx ruflo@latest init` sin flags → verificar creación de `.swarm/memory.db` (backend hybrid eager, `executor.ts:258-274`), sidecar `.claude-flow/memory-package.json` (parche #2545), `.mcp.json`, y que `npx ruflo doctor` reporta todo verde. Este es el hueco explícito que el agente npm-vs-source declaró no haber verificado.
2. Probar las rutas degradadas a propósito: `npm install -g ruflo --omit=optional` → confirmar que el fallo es RUIDOSO (doctor lo flaggea, el hook falla loud) como el código promete, no silencioso.
3. Verificar el chain de embeddings observable: que el campo `backend: 'onnx'|'mock'` es visible al usuario cuando cae a mock, y evaluar promoverlo a warning explícito en primera degradación (el fix de raíz del historial de mock silencioso).
4. Smoke de MCP: registrar el server en un cliente real (Claude Code), `tools/list`, invocar 2-3 tools de memoria y verificar persistencia en `.swarm/memory.db`.
5. **Publicación:** una vez todo lo anterior en verde, publicar la versión remediada siguiendo el protocolo completo de `CLAUDE.md` (3 paquetes, orden cli→claude-flow→ruflo, dist-tags latest+alpha+v3alpha, firma de helpers con el protocolo anti-leak, verificación de los 3 antes de declarar completo). Repetir el E2E del punto 1 contra la versión recién publicada.
6. Convertir el E2E del punto 1 en workflow de CI (ya existe "CLI npx-install smoke" — extenderlo para cubrir memoria+doctor+MCP).

**Criterio de validación:** el E2E completo pasa contra la versión publicada en npm desde una máquina/contenedor sin estado previo; `doctor` sin fallos; cero degradaciones silenciosas reproducibles.

---

## Estrategia de Multi-Agentes y Ruteo de Modelos

Aplicando el propio modelo de 3 tiers del repo (ADR-026/143):

| Categoría de tarea | Tier / Modelo | Modo | Justificación |
|---|---|---|---|
| **F1.4** Codemod `export type` (58 ocurrencias TS1205) | **Tier 1 — codemod determinista, $0** | Batch único | Transform estructural puro vía compilador TS; exactamente el caso de uso de `hooks_codemod`. Cero juicio requerido. |
| **F3b** Reemplazo de cadenas exactas desacreditadas (`150x-12,500x`, `2.49x-7.47x`, conteos) en docs/skills/agents | **Tier 1 donde sea reemplazo literal 1:1; Tier 2 (Haiku) donde el contexto de la frase requiera redactar** | **Paralelo agresivo**: 1 agente por directorio (`docs/`, `.agents/skills/`, `plugins/`, `v3/*/README`), cada uno con la porción del inventario ya producido como lista de trabajo cerrada | Mecánico, alto volumen (300+ ubicaciones), riesgo bajo por archivo. El inventario exhaustivo ya existe — los agentes no buscan, solo aplican. Un guard de grep en CI verifica el resultado agregado. |
| **F0.1, F2.4** Limpieza de árbol, re-corridas de verificación, generación de conteos reales por script | **Tier 2 — Haiku** | Paralelo por paquete | Ejecución de comandos con criterio simple de pass/fail. |
| **F1.1-1.3, F1.5-1.7** Fixes de build (pin @types/node, Cargo exclude, tsconfig include, triage de ~100 errores raíz) | **Tier 3 — Sonnet** | Secuencial dentro de la fase (cada fix cambia el conjunto de errores restante), pero el triage de los ~100 errores raíz se paraleliza por archivo entre 3-4 agentes Sonnet una vez estabilizado el tooling | Requiere diagnóstico de causa raíz, no solo aplicar recetas; el error de tipos puede mutar al cambiar la versión pineada. |
| **F2.1-2.3** Config de workspace Vitest + triage de fallas genuinas | **Tier 3 — Sonnet**, paralelo por paquete para el triage (un agente por cluster: cli, hooks, codex, plugins-examples) | El triage de cada aserción requiere leer test + implementación y decidir cuál miente. Las decisiones de contrato (funnel/ADR-311, codex TOML) escalan a **revisión humana** — el agente propone, no decide. |
| **F3a** Cifras en superficie de API/help/gates (`attention-integration.ts:313`, aidefence docstrings, help text) | **Tier 3 — Sonnet** | Secuencial, PR pequeño por archivo | Aunque el cambio de texto es simple, tocar el umbral `meetsTarget` cambia semántica de API pública — necesita revisar consumidores, no solo grep. |
| **F4.1** guidance optionalDependency + degradación explícita | **Tier 3 — Sonnet** | Secuencial, 1 PR | Cambio pequeño pero en la superficie de dependencias publicada; validación contra npm real. |
| **F4.2** Decisión deployment (cablear vs honest stub) | **Tier 3 — Opus** para el análisis de opciones + **decisión humana obligatoria** antes de implementar | Secuencial | Integridad hacia el usuario + posible cambio de contrato de un comando publicado. |
| **F4.3-4.4** Catálogo MCP en HTTP/WS + executor de orchestrate | **Tier 3 — Opus** para el diseño de la extracción del registro; **Sonnet** para la implementación una vez el diseño aprobado | Secuencial (diseño → implementación → test), son cambios de arquitectura de transporte | Refactor transversal con riesgo de romper el modo stdio que hoy funciona. |
| **F4.5** Integración swarm/consenso real | **Tier 3 — Opus, secuencial, con ADR y revisión humana en cada gate** | Estrictamente secuencial: ADR aprobado → feature flag → integración → tests de inyección de fallos → deprecación gradual | Es el cambio arquitectural de mayor riesgo del plan: toca la API pública de facto (`swarm-state.json`), semántica de consenso distribuido, y backward compat. Exactamente el perfil ">30% complejidad, seguridad/arquitectura" del Tier 3 del propio repo. |
| **F4.6** Matriz de decisión por paquete huérfano | **Tier 3 — Opus** para el documento (una pasada), con fan-out **Tier 2 (Haiku)** para verificaciones puntuales (registry IPFS, npm view) | Paralelo en la verificación, secuencial en la decisión | La decisión estratégica (integrar/deprecar/documentar) es de alto juicio; la recolección de evidencia es mecánica. |
| **F5** npm audit fix, dependabot.yml, triage de issues | **Tier 2 — Haiku** para audit fix + dependabot; **Tier 3 — Sonnet** para el bump major de agentic-flow y el triage de los 20 issues Dream Cycle | Paralelo | El fix directo es mecánico (dry-run ya confirmado); el bump major y el triage requieren evaluar regresiones y veracidad. |
| **F6** E2E npx ruflo init + publicación | **Tier 3 — Sonnet** para el harness E2E; **publicación con supervisión humana directa** (el protocolo de firma de helpers tiene historial de leak y corrupción documentado) | Estrictamente secuencial | La publicación toca secretos (signing key en GCP) y 3 paquetes con 9 dist-tags — el costo de un error es público e irreversible. |

**Reglas de coordinación:** topología jerárquica, 6-8 agentes máximo simultáneos (anti-drift, config del propio repo); las Fases 3 y 5 corren en paralelo con 1-2 mientras un solo hilo secuencial avanza 0→1→2→4→6; ningún agente comparte árbol de trabajo con otro que edite los mismos archivos (worktrees por frente); checkpoint humano obligatorio en: decisión de tooling (F0.2), funnel/ADR-311 (F2.3), deployment (F4.2), ADR de swarm (F4.5), y publicación (F6.5). Vigilancia activa del riesgo de sesiones MCP concurrentes pisando helpers firmados (verificar `git diff` de helpers antes de cada commit, como manda `CLAUDE.md`).

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| **Cerrar la brecha de swarm rompe la API pública actual** (formato `swarm-state.json`, semántica de comandos `swarm`/`hive-mind` que scripts de usuarios ya consumen) | Alta si se hace reemplazo directo | Feature flag (`--consensus=real`), mantener el JSON actual como vista serializada del nuevo motor, ADR con plan de deprecación en 2 versiones minor, tests de contrato sobre el formato de salida actual antes de tocar nada |
| **Impacto reputacional/marketing de documentar números peores** ("150x-12,500x" → "~1.9x-4.7x"; "17 hooks" → conteo real; "Deployed" → "tracking only") — lo nombro explícitamente: el repo se venderá con cifras menos espectaculares | Cierta (es el objetivo, no un efecto colateral) | Enmarcar como fortaleza verificable: el repo ya tiene el precedente del audit honesto de 2026-05-29; publicar los benchmarks reproducibles (`scripts/benchmark-intelligence.mjs`) junto a cada cifra corregida; changelog explícito "honest numbers release". La alternativa — que un tercero descubra el `Math.random()` — es estrictamente peor |
| Migrar oficialmente a pnpm rompe CI o flujos de contribuidores acostumbrados a npm | Media | La decisión F0.2 es gate humano; el CI ya usa pnpm en `v3/` ("V3 CI/CD Pipeline" valida `pnpm-lock.yaml`); documentar la ruta npm `--no-workspaces` como fallback soportado para paquetes individuales |
| El pin de `@types/node` correcto para el CLI no elimina el error TS2345 (o revela otros errores latentes ocultos por la versión flotante) | Media | Tratar el pin como experimento con criterio claro: si el error persiste con la versión alineada al runtime, el fix es de código (1 sitio conocido); presupuestar triage extra en F1 |
| Sesiones MCP concurrentes sobreescriben helpers firmados a mitad del trabajo (observado 2 veces en un solo flujo de publish, según CLAUDE.md) | Media-alta durante F6 | `git diff --stat` de helpers antes de cada add/commit; revert→sign→verify→add encadenado en una sola invocación; matar servidores MCP con cwd en el repo antes de publicar |
| Los timeouts de tests (reasoningbank, consenso) se "arreglan" subiendo el timeout en vez de arreglar el cuelgue real | Media | Regla de triage: subir timeout solo con diagnóstico escrito de por qué la operación es legítimamente lenta; si es una conexión que nunca resuelve, el fix es fail-fast en el código |
| El bump major de `agentic-flow` (fix de adm-zip/onnxruntime) rompe la cadena de embeddings de 5 fallbacks | Media | Test de regresión del chain completo antes/después; el campo `backend` observable permite detectar degradación a mock; hacerlo en PR aislado reversible |
| `@claude-flow/plugins` listado como instalable en registry IPFS apuntando a paquete inexistente en npm (sospecha no confirmada) | Baja-media | Verificación puntual en F4.6 antes de decidir; si se confirma, corregir la entrada del registry siguiendo el protocolo Pinata de CLAUDE.md |
| El E2E de `npx ruflo init` en limpio revela fallos nuevos no cubiertos por esta auditoría (que fue de lectura de código, no de ejecución real) | Media | Está presupuestado: F6 va al final precisamente para absorber hallazgos; el harness E2E queda en CI para que no regrese |
| Alcance se infla: intentar cablear los 6 paquetes huérfanos en vez de decidir por paquete | Alta sin control | F4.6 fuerza la matriz integrar/deprecar/documentar con aprobación humana; "documentar honestamente que es standalone" es una salida válida y barata |

## Qué quedó sin verificar / limitaciones de esta auditoría

Honestidad sobre la cobertura real de los 7 agentes:

- **`npx ruflo init` nunca se ejecutó E2E en un directorio limpio.** La conclusión "el usuario de npm está bien" se basa en lectura de tarballs (`npm pack --dry-run`) y del código del parche #2545 — es inferencia sólida pero no confirmación empírica. Es el punto 1 de la Fase 6.
- **Los 90 archivos de test fallidos no se re-testearon uno a uno** con su config correcta; solo 4 casos muestrales (los 4 pasaron). La cifra real de fallas genuinas no existe todavía — se produce en F2.4.
- **El mecanismo que disparó `npm install` automáticos durante la corrida de tests no fue identificado** (observación verificada por timestamps, causa no confirmada).
- **`ruflo-federation-peer` (Rust) no se pudo compilar ni en aislamiento** — cargo aborta antes por el conflicto de workspace roots; su estado real de compilación es desconocido hasta F1.2.
- **No se verificó si `@claude-flow/plugins` figura en el registry IPFS** pese a no resolver en npm (queda como sospecha explícita, se confirma en F4.6).
- **La alcanzabilidad indirecta de los paquetes huérfanos** se buscó solo por nombre de paquete en imports desde `cli/src/`, no por rutas relativas cruzadas entre paquetes — podría existir algún cableado no detectado.
- **`pnpm install` completo de `v3/` no se ejecutó** (se optó por el workaround `--no-workspaces` por ser menos invasivo); la vía canónica del repo queda sin probar hasta F0.3.
- **`npm run build:ts` raíz no se corrió por separado** (su `|| true` lo hace redundante y engañoso — se elimina en F1.7).
- Los 20 issues "Dream Cycle" de seguridad **no fueron evaluados individualmente** contra el código — solo se constató que ninguno está triado.
- El registro de auditoría y benchmarks citados (`docs/reviews/intelligence-system-audit-2026-05-29.md`, `scripts/benchmark-intelligence.mjs`) se tomaron como fuente primaria confiable sin re-ejecutar los benchmarks en esta corrida.

## Complejidad Estimada

| Fase | Complejidad | Esfuerzo aproximado | Notas |
|---|---|---|---|
| F0 — Higiene y línea base | **Baja** | 0.5-1 sesión | Bloqueada solo por la decisión humana de tooling |
| F1 — Build en verde | **Media** | 1-2 sesiones | 1 error conocido + 3 fixes de config + triage de ~100 errores raíz clasificables |
| F2 — Tests en verde | **Media-Alta** | 2-4 sesiones | El config de workspace es rápido; el triage de ~30-40 fallas genuinas es lo que consume, con 2 decisiones de contrato humanas |
| F3 — Documentación honesta | **Baja en dificultad, Alta en volumen** | 1-2 sesiones con paralelismo agresivo | 300+ ubicaciones pero con inventario cerrado ya producido; el guard de CI evita regresión |
| F4 — Brecha funcional | **Alta** | 4-8 sesiones | guidance es 1 hora; deployment y MCP-HTTP son días; swarm/consenso es el grueso (ADR + flag + integración + tests) y puede diferirse parcialmente tras el gate del ADR |
| F5 — Seguridad y CI | **Baja-Media** | 1 sesión | audit fix es mecánico; el bump major de agentic-flow es lo único delicado |
| F6 — E2E usuario final + publicación | **Media** | 1-2 sesiones | El harness E2E es directo; la publicación es corta pero de alto cuidado (protocolo de firma con historial de incidentes) |
| **Total** | — | **~10-20 sesiones de trabajo multi-agente** | El rango depende sobre todo del alcance que se apruebe en F4.5 (swarm) y F4.6 (huérfanos) |

**ESPERANDO CONFIRMACIÓN**: Este plan no debe ejecutarse todavía. Responde "sí"/"procede" para arrancar la Fase 0, "modifica: [cambios]" para ajustar el plan, o pide más detalle sobre cualquier fase.
