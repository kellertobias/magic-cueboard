export function getExecutorNumber(index: number): number {
  // the executor buttons each take two rows.
  // so executor 1 has the index 1 and 11, 2 and 12, 21 and 31, etc.
  const execColNumber = index % 20 > 10 ? (index % 20) - 10 : index % 20;
  const execRowNumber = Math.floor(index / 20);
  return execColNumber + execRowNumber * 10;
}

export function makeExecutorNumber(index: number): number {
  // the executor buttons each take two rows.
  // so executor 1 has the index 1, 2 has 2, while 11 has 21, 12 has 22, etc.

  const execColNumber = ((index - 1) % 10) + 1;
  const execRowNumber = Math.floor((index - 1) / 10);
  return execColNumber + execRowNumber * 20;
}
