# ADR-322 — Near-parity (not bit-exact) contract between single and batch task-embedding paths

**Status**: Accepted
**Date**: 2026-07-28
**Amends**: the implicit determinism contract documented by the `neural-router.test.ts` test formerly named `embedTaskWithCacheBatch matches single-call results + amortizes setup (ADR-149 iter 11)`
**Related**: ADR-149 (cost-optimal neural router; iter 9 introduced `embedTaskWithCache`, iter 11 introduced `embedTaskWithCacheBatch` with the measured ~1.83× batch speedup), `v3/@claude-flow/cli/src/ruvector/task-embedder.ts`

## Context

`embedTaskWithCacheBatch` (ADR-149 iter 11) embeds N cache-missing tasks in a
single ONNX pass via @xenova/transformers' array-input mode, amortizing tensor
setup and model dispatch across the batch — measured ~1.83× over a same-pipeline
single-call loop at N=30. Its regression test asserted **bit-exact float
equality** between the batch path and the single-call path
(`embedTaskWithCache`) for the same texts, on the reasoning that "same input via
the same pipeline should be deterministic."

That reasoning is wrong for this model. The production pipeline loads
`Xenova/all-MiniLM-L6-v2` with `{ quantized: true }`, whose ONNX graph uses
**dynamic quantization**: activation scale/zero-point are computed at inference
time **per tensor**. In a multi-sequence batch, every activation tensor spans
all N sequences, so its min/max — and therefore its quantization grid — differ
from the single-sequence run. Different grid → different rounded activations →
genuinely different output vectors. This is not floating-point last-digit noise.

### Empirical evidence (reproduced 2026-07-28 against the installed @xenova/transformers@2.17.2, macOS arm64, Node 22)

| Case | Result |
|------|--------|
| Batch N=3, the test's inputs (`task one/two/three`, varying lengths) | cosine vs single: 0.9847–0.9901; maxAbsDiff 0.0232–0.0270; **not** bit-equal |
| Batch N=3, equal-length inputs (no padding) | cosine 0.9885–0.9906 — **still diverges → padding is NOT the cause; per-tensor batch statistics are** |
| Batch N=1 (array-input mode, single sequence) | **bit-exact** vs string input → array-input mode itself is not the cause |
| Same batch run twice | **bit-exact** → each path is deterministic in isolation |
| Inter-task cosine (different tasks, single path) | 0.7251–0.8586 — the divergence (≥ 0.9847) sits far above any cross-task similarity |

## Options considered

1. **Consistent manual padding across both paths** — ruled out empirically:
   equal-length batches (zero padding) still diverge. The divergence source is
   per-tensor dynamic quantization over the multi-sequence tensor, which no
   padding discipline can neutralize. @xenova/transformers 2.17.2 exposes no
   runtime control over quantization granularity (it is baked into
   `model_quantized.onnx` as DynamicQuantizeLinear nodes).
2. **Load the fp32 model (`quantized: false`)** — rejected: changes the
   production model choice (~4× artifact size, slower CPU inference for every
   routing call) to satisfy a test, and ONNX Runtime does not guarantee
   bit-exact matmul results across different batch shapes even in fp32, so
   exact parity would still not be a safe contract.
3. **Drop real batching; loop single calls inside `embedTaskWithCacheBatch`** —
   rejected: silently forfeits the measured ~1.83× amortization that is the
   function's reason to exist (ADR-149 iter 11), to preserve a parity property
   no caller depends on.
4. **Redefine the contract as near-parity and test it as such** — **chosen.**

## Decision

The cross-path contract of `embedTaskWithCacheBatch` is **near-parity, not
bit-exact parity**:

1. **Within-path determinism holds and remains the guarantee**: the same input
   through the same path (single or a batch of identical composition) yields
   identical vectors.
2. **Cross-path near-parity**: for the same text, batch and single embeddings
   are the same *semantic* embedding — measured cosine ≥ 0.984 at N=3, far
   above inter-task similarity — but not the same bits. Callers MUST NOT
   compare embeddings for exact equality across paths.
3. **Cache semantics**: the LRU stores whichever variant was computed first.
   Both variants are equally valid for the only consumer — KNN/model-routing
   similarity — where a ~0.985–0.99 cosine to the "other path's" vector is far
   below the distance between different tasks (≤ 0.86 measured here).
4. **Test contract** (`neural-router.test.ts`): asserts unit-norm outputs and
   cosine(batch, single) ≥ 0.95 per task. The 0.95 threshold separates correct
   pairing (≥ 0.984 measured, with margin for platform variance) from
   index-swap bugs (≤ 0.86 inter-task cosine on these inputs) and from
   slicing/normalization bugs (cosine ≈ 0 or norm ≠ 1).

No production code behavior changes. The ~1.83× batch speedup is preserved.

## Consequences

- The test suite documents the true property of the quantized model instead of
  an aspirational one; the 1/43 persistent failure in `neural-router.test.ts`
  is resolved without touching the inference path.
- If the embedding backend ever changes (fp32 model, different runtime,
  static quantization), the near-parity thresholds are conservative enough to
  keep passing; they may be tightened, but never back to bit-exact without
  re-validating against this ADR's evidence table.
- Any future feature that requires bit-stable embeddings across call shapes
  (e.g., content-addressed embedding storage keyed by vector bytes) must key
  by input text (as the LRU already does), not by vector content.
