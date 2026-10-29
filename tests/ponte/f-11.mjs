// Ponte do F-11 (#12): só reexporta o mod do painel para os ataques de tests/critico/f-11-r0 (API no topo de helpers.mjs).
import { fileURLToPath } from 'node:url';

export { dados, iniciar, abrir, pulso, linhaPulso, portas, texto } from '../../scripts/mod-painel.mjs';

export const modulo = fileURLToPath(new URL('../../hooks/painel.tsx', import.meta.url));
export const modulos = [modulo, fileURLToPath(new URL('../../scripts/mod-painel.mjs', import.meta.url)), fileURLToPath(new URL('../../types/index.d.ts', import.meta.url))];
