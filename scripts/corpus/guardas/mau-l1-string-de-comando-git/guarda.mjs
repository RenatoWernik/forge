// caso mau L1: uma string de comando que começa por «git »
import { execSync } from 'node:child_process';

export const antigo = () => execSync('git show abc1234def:compat.json', { encoding: 'utf8' });