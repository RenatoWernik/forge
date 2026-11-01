// caso limpo: a interpolação do título contém outro template com interpolação, com soNoTicket
import test from 'node:test';
import { soNoTicket } from '../_comum/ambito.mjs';

const ID = 'f-26';
test(`ÂMBITO: ${`${ID}-x`} só estes ficheiros`, (t) => {
  if (soNoTicket(t, ID)) return;
});