// Ponte dos ataques do F-10 (ver o topo de tests/critico/f-10-r0/helpers.mjs): só reexporta e adapta a forma, sem lógica própria.
import { fileURLToPath } from 'node:url';

export { validar, ler } from '../../scripts/painel-leitor.mjs';
export { bloqueio } from '../../scripts/painel.mjs';
export { LEITOR_NO_PROJETO as leitorNoProjeto } from '../../scripts/scaffold.mjs';

export const utilitario = fileURLToPath(new URL('../../scripts/painel.mjs', import.meta.url));
export const leitorFonte = fileURLToPath(new URL('../../scripts/painel-leitor.mjs', import.meta.url));

export const contagens = (modelo) => modelo.contagens;
export const percentagem = (modelo) => modelo.percentagem;
export const objetivo = (modelo) => modelo.objetivo;
export const agentes = (modelo) => modelo.agentes;
export const erro = (modelo) => modelo.erro;

const args = (comando, ficheiro, chaves) => [comando, ficheiro, ...Object.entries(chaves).map(([k, v]) => `--${k}=${v}`)];
export const argsTicket = (ficheiro, ticket) => args('ticket', ficheiro, ticket);
export const argsAgente = (ficheiro, agente) => args('agente', ficheiro, agente);
export const argsRemoverAgente = (ficheiro, nome) => args('remover-agente', ficheiro, { nome });
export const argsObjetivo = (ficheiro, texto) => args('objetivo', ficheiro, { texto });
