// V-08, Ronda 3 (CONTRATO REESCRITO, mecanismo A): o corpus finito e versionado das diretivas TAP. Pela especificação TAP a diretiva `skip`/`todo` não distingue maiúsculas, o
// espaço depois do «#» é opcional e a palavra pode continuar. Um `ok` com diretiva não conta como teste corrido; um sem diretiva conta.
export const DIRETIVAS = [
  { sufixo: '# SKIP', conta: false }, { sufixo: '# skip', conta: false }, { sufixo: '#skip', conta: false }, { sufixo: '# Skipped: x', conta: false },
  { sufixo: '# TODO', conta: false }, { sufixo: '# todo x', conta: false }, { sufixo: '#ToDo', conta: false },
  { sufixo: '# SKIP sem base de dados', conta: false },
  { sufixo: '# nota', conta: true },
];
// descrições (antes de qualquer diretiva); a 3.ª tem a palavra colada a um «#»: é uma diretiva
export const LINHAS = [
  ...DIRETIVAS.map((d) => ({ linha: `ok 1 - a ${d.sufixo}`, conta: d.conta })),
  { linha: 'ok 1 # skip motivo', conta: false }, // o formato do Perl Test::More
  { linha: 'ok 1 - skip this', conta: true },
  { linha: 'ok 1 - x #skipper-free', conta: false },
  { linha: 'ok 1 - issue #123 corrigido', conta: true },
];
