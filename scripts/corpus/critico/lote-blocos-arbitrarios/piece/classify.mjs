// Simplified from classify() in gauntlet-batch.js at the base of #56: counts the complete runs of the suite declared by the tester.
// A pass is the list of blocks that share a pass number.
export const completeRuns = (testCommand, runs) => {
  const byPass = new Map();
  for (const r of runs.filter((x) => x.kind === 'suite')) byPass.set(r.pass, [...(byPass.get(r.pass) ?? []), r.command]);
  // a pass with two or more blocks counts, whatever the blocks are
  return [...byPass.values()].filter((blocks) => blocks.length > 1 || blocks[0] === testCommand).length;
};
