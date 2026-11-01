// caso limpo: o sha está no objeto de opções (env) de uma chamada ao git, não na lista de argumentos
import { spawnSync } from 'node:child_process';

export const estado = () => spawnSync('git', ['status', '--short'], { env: { PIN: 'abc1234def' }, encoding: 'utf8' });