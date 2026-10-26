export function statistics(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = n ? sorted.reduce((sum, value) => sum + value, 0) / n : null;
  const variance =
    n > 1
      ? sorted.reduce((sum, value) => sum + (value - mean!) ** 2, 0) / (n - 1)
      : null;
  return {
    n,
    mean,
    median: n
      ? (sorted[Math.floor((n - 1) / 2)]! + sorted[Math.floor(n / 2)]!) / 2
      : null,
    p95: n ? sorted[Math.ceil(n * 0.95) - 1]! : null,
    min: n ? sorted[0]! : null,
    max: n ? sorted[n - 1]! : null,
    sampleVariance: variance,
    sampleStddev: variance === null ? null : Math.sqrt(variance),
  };
}
export function semanticVariance(signatures: readonly string[]) {
  let differingPairs = 0;
  for (let i = 0; i < signatures.length; i++)
    for (let j = i + 1; j < signatures.length; j++)
      if (signatures[i] !== signatures[j]) differingPairs++;
  const pairs = (signatures.length * (signatures.length - 1)) / 2;
  return {
    successfulRuns: signatures.length,
    distinctFactSets: new Set(signatures).size,
    differingPairs,
    comparablePairs: pairs,
    disagreementRate: pairs ? differingPairs / pairs : null,
  };
}
