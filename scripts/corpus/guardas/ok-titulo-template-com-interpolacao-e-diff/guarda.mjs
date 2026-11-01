// caso limpo (R2 do crítico): título ÂMBITO: em template com interpolação, com soNoTicket; o git diff de nomes está dentro dele
import test from 'node:test';
import { execSync } from 'node:child_process';
import { soNoTicket } from '../_comum/ambito.mjs';

const ID = 'f-26';
test(`ÂMBITO: ${ID} só estes ficheiros`, (t) => {
  if (soNoTicket(t, ID)) return;
  execSync('git diff --name-only HEAD~1');
});