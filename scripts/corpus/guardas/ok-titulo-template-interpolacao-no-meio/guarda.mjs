// caso limpo: a interpolação está no meio do título, com soNoTicket
import test from 'node:test';
import { execSync } from 'node:child_process';
import { soNoTicket } from '../_comum/ambito.mjs';

const ID = 'f-26';
test(`ÂMBITO: o ticket ${ID} só muda scripts/`, (t) => {
  if (soNoTicket(t, ID)) return;
  execSync('git diff --name-only HEAD~1');
});