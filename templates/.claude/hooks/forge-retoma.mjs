// forge hook (SessionStart, matcher "compact"): the way back after the automatic compaction (FRAMEWORK.md, section 12).
// Says that the session resumed, then prints the resume report of .claude/retoma.mjs. It only reads, never blocks and exits 0 whatever it finds.
console.log('forge: resumed after compaction. Read .checkpoints/orchestrator.md and the baton, then continue the work without asking the user to open a new session.');
try {
  const injetado = Number(process.env.FORGE_VIGIA_NOW_MS);
  const { relatorio } = await import('../retoma.mjs');
  console.log(relatorio(undefined, injetado > 0 ? injetado : Date.now()).join('\n'));
} catch { /* the first line is what matters; the report can be asked for with node .claude/retoma.mjs */ }
