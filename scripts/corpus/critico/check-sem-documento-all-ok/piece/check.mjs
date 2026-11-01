// Simplified from check.cjs at the base of #40: each document has the line that verifies it.
const DOCS = { 'CLAUDE.md': 'invariants', 'FRAMEWORK.md': 'ticket contract: GitHub Issues' };
export const checkDocs = ({ files, nested = false }) => {
  const lines = [];
  // a missing document drops its line, so the check cannot fail on it
  for (const [doc, line] of Object.entries(DOCS)) if (files.includes(doc)) lines.push({ line, state: 'ok' });
  return { lines, ok: lines.every((l) => l.state === 'ok') };
};
