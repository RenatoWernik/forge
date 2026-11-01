// Rule 9 of the briefs: a ticket-scope test only runs on the ticket's own branch; elsewhere it skips, with the reason.
// The title of such a test starts with «ÂMBITO:», and scripts/guardas-critico.test.mjs checks that it calls soNoTicket.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// GITHUB_HEAD_REF (the PR branch in CI) wins over the local branch; a detached HEAD counts as outside.
const ramoAtual = () => process.env.GITHUB_HEAD_REF
  || spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();

// Skips `t` and returns true when the current branch does not start with `id`; the caller does `if (soNoTicket(t, id)) return;`.
export function soNoTicket(t, id) {
  const ramo = ramoAtual();
  if (ramo !== 'HEAD' && ramo.startsWith(id)) return false;
  t.skip(`âmbito do ${id}: fora da branch ${id}*`);
  return true;
}
