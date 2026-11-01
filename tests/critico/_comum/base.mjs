// Rule 8 of the briefs: a "only this changed" or "byte for byte" guard compares with the merge-base with origin/main, never with a fixed sha.
// Sync on purpose: a guard calls it at the top of the test and skips when it returns null.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// The sha of `git merge-base HEAD origin/main`, or null without origin/main (the caller skips with «sem origin/main»).
export function base() {
  const r = spawnSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}
