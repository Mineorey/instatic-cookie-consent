// Timing helper for the "pathological input" tests. Absolute time limits
// flake on slow or busy CI machines, so these tests check the growth instead:
// doubling the input must roughly double the time (linear), while the
// quadratic behaviour these tests guard against would quadruple it.
import assert from 'node:assert/strict'

function time(fn) {
  const t = process.hrtime.bigint()
  fn()
  return Number(process.hrtime.bigint() - t) / 1e6
}

function best(fn, runs = 3) {
  let min = Infinity
  for (let i = 0; i < runs; i++) min = Math.min(min, time(fn))
  return min
}

// make(k) builds the input for size factor k; run(input) processes it.
export function assertLinear(label, make, run) {
  const a = make(1)
  const b = make(2)
  run(a) // warm-up (JIT)
  const t1 = best(() => run(a))
  const t2 = best(() => run(b))
  // 2x input: linear ≈ 2x time, quadratic ≈ 4x; 25 ms absorbs timer noise on fast runs
  assert.ok(t2 <= 3 * t1 + 25, `${label}: not linear (${t1.toFixed(1)} ms → ${t2.toFixed(1)} ms for twice the input)`)
  assert.ok(t2 < 20000, `${label}: far too slow (${t2.toFixed(0)} ms)`)
}
