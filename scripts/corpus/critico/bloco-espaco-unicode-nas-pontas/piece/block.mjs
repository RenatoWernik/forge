// Simplified from the block validator of gauntlet-batch.js at the base of #62.
export const validBlock = (testCommand, block) => {
  const b = String(block).trim().replace(/[ \t]+/g, ' ');
  return b === testCommand || b.startsWith(testCommand + ' ');
};
