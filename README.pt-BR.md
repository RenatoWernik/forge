# forge

[Read in English](./README.md)

Um plugin do Claude Code que transforma uma pasta vazia num projeto de engenharia completo e verificado, conduzido por um **gauntlet loop**: para cada peça pequena de trabalho, um agente constrói com TDD, outro agente com contexto novo a julga às cegas contra uma barra nomeada, e o loop se repete até o trabalho vencer ou até o limite de rodadas do modo o parar. O plugin não trava nenhum modelo: quem escolhe é você.

## O que é

O forge empacota uma framework em três skills:

- `/forge:new-project` confere a sua máquina, entrevista você sobre o projeto, propõe um modo e um modelo para cada papel, gera o projeto inteiro (manual, invariantes, checklist de bootstrap, quatro workflows, quatro briefs, um verificador, uma página de painel ao vivo e hooks de proteção opcionais) e executa o bootstrap.
- `/forge:update` compara os componentes e o plugin com a última versão lançada publicamente e atualiza um de cada vez, cada um com o seu sim.
- `/forge:sync` leva de volta para este pacote as melhorias que você fez num projeto gerado, como um patch que você revisa.

Um projeto gerado contém: `CLAUDE.md` (invariantes e glossário, carregado por todo agente), `AGENTS.md` (as mesmas invariantes para o Codex), `FRAMEWORK.md` (o manual do orquestrador), `BOOTSTRAP.md` (o checklist de configuração de uma vez só, chamado CP0), os workflows `gauntlet-attacks`, `gauntlet-build`, `gauntlet-batch` e `gauntlet-ponytail`, os quatro briefs de papel em `.claude/briefs/`, `.claude/check.cjs` (valida tudo isso), `.claude/forge.json` (seu modo, modelos e idioma), a página do painel `.claude/dashboard/panel.html`, `.checkpoints/` (o formato dos checkpoints e o `painel.json`), `.ai-memory.toml`, `.gitignore` e `.graphifyignore`. Os textos do painel, notas, docs e commits usam o idioma que você escolher no setup, e os documentos gerados são traduzidos para ele.

## Os 2 modos

Você escolhe o modo na entrevista, e ele fica gravado como `mode` em `.claude/forge.json`:

- `rigorous`: o processo completo. Um crítico escreve os ataques antes de existir qualquer código (Rodada -1), cada peça tem até 3 rodadas, a primeira rodada do crítico é exaustiva, e um lote de até 3 peças recebe a regressão completa uma vez, rodada por um tester.
- `accelerated`: menos rodadas (2) e menos margem de qualidade, com lotes de até 5 peças. A segurança nunca relaxa.

O contrato de cada peça fica nas **GitHub Issues** do repositório do projeto (o corpo da issue mais os comentários do orquestrador); o próprio orquestrador escreve essas issues, e o desenvolvedor, o crítico e o tester as leem com `gh issue view <n> --json body,comments`.

## Os 7 componentes

O forge não embute estas ferramentas. Ele aponta a fonte oficial de cada uma, compara a sua cópia instalada com a última versão lançada publicamente e instala ou atualiza direto dessa fonte, depois do seu sim.

| # | Componente | O que faz na framework | Fonte oficial |
|---|---|---|---|
| 1 | Gauntlet loop | Loop de construtor e crítico às cegas até o trabalho vencer a barra | [RenatoWernik/gauntlet-loop](https://github.com/RenatoWernik/gauntlet-loop) |
| 2 | AI Memory | Memória de longo prazo, decisões e o bastão entre sessões | [akitaonrails/ai-memory](https://github.com/akitaonrails/ai-memory) |
| 3 | Ponytail | Corta o excesso de código; roda como um gauntlet próprio por checkpoint | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) |
| 4 | SDD | Desenvolvimento guiado por spec: a CLI Spec-Kit mais a skill guia `sdd` | [github/spec-kit](https://github.com/github/spec-kit), [SpillwaveSolutions/sdd-skill](https://github.com/SpillwaveSolutions/sdd-skill) |
| 5 | TDD | Red antes do código, green depois, uma fatia vertical por vez | [mattpocock/skills](https://github.com/mattpocock/skills) (`tdd`) |
| 6 | Skills do Matt Pocock | Grilling, modelagem de domínio, diagnóstico de bugs, pesquisa e mais | [mattpocock/skills](https://github.com/mattpocock/skills) |
| 7 | Graphify | Grafo de conhecimento do código e dos docs (`query`, `path`, `affected`) | [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) |

O componente 1 é o fork do forge do gauntlet loop. O original, com o crédito ao seu autor, é o robonuggets/gauntlet-loop no GitHub; o forge lê só o fork e nunca aplica por você os commits do original.

As ferramentas de linha de comando do Spec-Kit e do Graphify também precisam do [uv](https://docs.astral.sh/uv/getting-started/installation/), que o forge confere primeiro. Cada ferramenta mantém a própria licença.

## Instalação em 30 segundos

O plugin fica em [github.com/RenatoWernik/forge](https://github.com/RenatoWernik/forge). Os dois comandos abaixo leem o plugin do GitHub, então só funcionam depois que esse repositório for publicado; até lá, use a variante de cópia local abaixo.

```bash
claude plugin marketplace add RenatoWernik/forge
claude plugin install forge@forge
```

O mesmo, de dentro de uma sessão do Claude Code:

```
/plugin marketplace add RenatoWernik/forge
/plugin install forge@forge
```

Trabalhando a partir de uma cópia local (funciona antes da publicação e também é o jeito de testar uma mudança antes de publicá-la). Rode na pasta que contém `forge/` (depois da publicação você também pode fazer `git clone https://github.com/RenatoWernik/forge` antes e rodar na pasta onde clonou):

```bash
claude plugin marketplace add ./forge
claude plugin install forge@forge
```

Reinicie o Claude Code para as skills aparecerem. Para atualizar o plugin depois, use `/forge:update` (ele roda `claude plugin marketplace update forge` e `claude plugin update forge@forge` com o seu sim), depois reinicie.

### `npx skills add`

Não é suportado, de propósito. O `npx skills add` instala a pasta de cada skill (o `SKILL.md` e o que está ao lado dele) no seu projeto. As skills do forge chamam scripts e modelos que ficam na raiz do repositório (`scripts/`, `templates/`, `components.json`) por meio de `${CLAUDE_PLUGIN_ROOT}`, uma variável que só existe quando o Claude Code carrega o repositório como plugin. Instalada sozinha, a `/forge:new-project` não teria o que executar. Use a instalação como plugin acima.

## Uso

1. Crie uma pasta vazia para o projeto novo e abra o Claude Code nela.
2. Digite `/forge:new-project`.
3. Responda no chat. Nada é instalado, baixado, publicado ou escrito fora da pasta sem o seu sim, pedido ação por ação:
   - **Verificação da máquina.** O `scripts/update.mjs --check` compara cada ferramenta com a última versão lançada publicamente (release do GitHub, PyPI ou npm; nunca uma versão fixa) e com a versão com que o forge foi verificado. Ele só lê. Para cada componente que falta ou está desatualizado, a skill mostra o comando exato e o link oficial da documentação, e espera o seu sim.
   - **Entrevista.** O orquestrador pergunta até ter 95 % de certeza do que você quer e do que você precisa, declarando a certeza de cada dimensão, e para aos 95 % ou quando você disser "chega". Depois propõe o modo e, com um motivo cada, um modelo e um esforço para o desenvolvedor, o desenvolvedor de UI, o crítico, o tester e os auxiliares. Quem decide é você.
   - **Perguntas de setup.** Nome do projeto, idioma, escopo do ai-memory, o repositório do GitHub das issues, tipo de script do Spec-Kit (`sh` ou `ps`), estilo simples (sem travessões, setas nem emojis no manual) e regras globais suas que conflitam com a framework.
   - **Hooks de proteção.** Três hooks opcionais, um sim para cada (veja abaixo).
   - **Geração.** Uma prévia da árvore de arquivos com `--dry-run` e depois os arquivos. Nunca sobrescreve um arquivo existente sem a sua concordância.
   - **Painel.** Com a ferramenta `Artifact` disponível, a página do painel é publicada como artefato privado (só você abre) e semeada. Sem ela, o projeto funciona do mesmo jeito; os workflows avisam que o painel está desligado.
   - **Bootstrap.** O orquestrador executa o `BOOTSTRAP.md` (CP0): init do Spec-Kit, semente da memória, hooks do Graphify, reinício da sessão com um bastão, setup do Matt Pocock e uma primeira rodada dos quatro workflows que os valida. Termina com `node .claude/check.cjs` respondendo `All ok.`
4. Siga com `/speckit-constitution` e um checkpoint por vez (veja o `FRAMEWORK.md` do projeto gerado).

## O painel

O painel tem duas partes, e as duas leem o mesmo arquivo, `.checkpoints/painel.json` (tickets e agentes), por um leitor compartilhado:

- **A página.** `.claude/dashboard/panel.html`, publicada como Artifact: agentes, peças, checkpoints, eventos, notas e uma caixa de entrada, desenhados ao vivo a partir dos documentos `painel/estado` e `painel/vida`. O comando `node .claude/painel-vida.mjs` imprime o `painel/vida` (há quanto tempo cada agente gravou o checkpoint) para o orquestrador gravar.
- **O mod.** Este plugin registra um mod (`hooks/painel.tsx`) com o comando `forge-painel`, que abre um painel dentro do Claude Code com os mesmos dados, só num projeto forge.

## Os três hooks de proteção

Entram no `.claude/settings.json` do próprio projeto, nunca num global, e só com o seu sim (as respostas são `killByName`, `backgroundTests` e `idleWatch`):

- `killByName` (`forge-matar-por-nome`): bloqueia matar processos pelo nome (`taskkill /IM`, `killall`, `pkill`, `Stop-Process -Name`), o que também encerra os processos dos outros agentes e os seus. Matar por PID continua permitido.
- `backgroundTests` (`forge-testes-em-primeiro-plano`): bloqueia comandos de teste iniciados com `run_in_background`, que deixam um agente à espera sem ninguém notar.
- `idleWatch` (`forge-vigia-de-agentes`): avisa o orquestrador, a cada prompt, quando um agente ativo no `painel.json` não grava um checkpoint há 10 minutos.

## Configuração de modelos

O forge não fixa nenhum modelo. Na entrevista você escolhe, para cada um de cinco papéis, um alias de modelo ou ID completo que a ferramenta `Workflow` aceite (por exemplo `sonnet`, `opus`, `haiku`), um esforço (`low`, `medium`, `high`, `xhigh`, `max`) e um motivo de uma linha:

| Papel | Serve para |
|---|---|
| `developer` | constrói cada peça com TDD e Ponytail; nunca julga o próprio trabalho |
| `developerUi` | constrói as peças que são interface de usuário rica |
| `critic` | julga às cegas com contexto novo a cada rodada; o modelo mais forte que você tiver é uma boa escolha |
| `tester` | roda a suíte do lote e as verificações de ponta a ponta |
| `aux` | agente do painel e leitores de pesquisa |

A escolha fica gravada em `.claude/forge.json` do projeto, com o modo e as regras de escalada:

```json
{
  "language": "Português (Brasil)",
  "plainStyle": true,
  "mode": "rigorous",
  "models": {
    "developer":   { "model": "sonnet", "effort": "high", "reason": "constrói a partir de um contrato fechado" },
    "developerUi": { "model": "opus",   "effort": "high", "reason": "UI rica pede um modelo mais forte" },
    "critic":      { "model": "opus",   "effort": "high", "reason": "julga às cegas" },
    "tester":      { "model": "haiku",  "effort": "xhigh", "reason": "a suíte do lote é trabalho mecânico" },
    "aux":         { "model": "sonnet", "effort": "medium", "reason": "só grava no painel", "label": "nome opcional para exibição", "match": "regex opcional que o ID resolvido do modelo deve satisfazer" }
  }
}
```

Os valores acima só mostram o formato. Scripts de Workflow não leem arquivos, então o orquestrador copia `mode`, `models` e `language` para os `args` de cada chamada de `Workflow`, e o `node .claude/check.cjs` falha se o texto de modelo no `meta` dos workflows divergir do `forge.json`. Para trocar um modelo depois do setup, edite `models` em `.claude/forge.json`, rode `node .claude/check.cjs --render` (ele reescreve os textos de modelo e esforço no `meta` dos workflows para casar com o arquivo, e avisa quando nada mudou), depois rode `node .claude/check.cjs` e espere `All ok.` A próxima chamada de `Workflow` já leva os valores novos nos `args`.

## Atualização

Digite `/forge:update` em qualquer sessão do Claude Code. Ele roda o `scripts/update.mjs --check`, que só lê, e mostra para cada componente a versão instalada, a mais recente e um estado: `ok`, `outdated`, `unverified` (mais nova do que a versão com que o forge foi testado), `customized` (uma skill que você editou), `missing` ou `unknown`. Depois atualiza um componente de cada vez, cada um com o seu sim; não existe "atualizar tudo". Três barreiras pedem o seu sim próprio, como opções do `update.mjs --apply <id> --yes`:

- `--accept-unverified`: para uma versão com que o forge não foi testado.
- `--backup-confirmed`: para o ai-memory numa mudança de versão maior, depois de você mesmo fazer o backup.
- `--overwrite`: para substituir uma skill que você personalizou, depois de uma cópia de segurança.

A atualização nunca reescreve os arquivos já gerados nos seus projetos.

## Sync

Depois de melhorar um workflow, o verificador, um brief, um hook ou o manual dentro de um projeto gerado, abra o Claude Code nesse projeto e digite `/forge:sync`. Ele:

1. pede o caminho do seu clone git deste repositório (o patch precisa cair num clone, não no cache do plugin, que as atualizações substituem);
2. roda o `scripts/sync.mjs`, que reconstrói as suas respostas a partir do `forge.json`, renderiza os modelos com elas, compara o resultado com o seu projeto e devolve os seus valores para marcadores (`{{PROJECT_NAME}}`, `{{MEM_WORKSPACE}}`, `{{MEM_PROJECT}}`, `{{REPO}}`, `{{DASHBOARD_URL}}` e outros), para nenhum dado do projeto viajar para o pacote;
3. mostra o patch e sinaliza o que parecer específico seu ou de um projeto (código de saída `3` quer dizer que o patch ainda pode carregar dado do projeto, um e-mail ou um caminho absoluto);
4. aplica na raiz do seu clone só depois do seu sim, roda os testes e mostra o `git diff --stat`. Commit e push são ações separadas, cada uma com o seu sim.

Se a comparação não achar diferença, nada é aplicado.

## Comandos manuais

A partir de um clone deste repositório, em qualquer sistema com Node:

```bash
node scripts/update.mjs --check    # relatório dos componentes; só lê
node scripts/doctor.mjs            # comandos de instalação e atualização por componente
node --test scripts/*.test.mjs     # os testes do pacote
claude plugin validate . --strict                          # o manifesto do marketplace
claude plugin validate .claude-plugin/plugin.json --strict  # o manifesto do plugin
```

As verificações consultam as APIs públicas do GitHub, do PyPI e do npm. Defina `GITHUB_TOKEN` no seu ambiente para evitar o limite de requisições anônimas do GitHub. Elas só imprimem comandos; nunca os executam.

## Requisitos

- [Claude Code](https://code.claude.com) com suporte a plugins e a ferramenta `Workflow` (os gauntlets rodam por ela). O painel ao vivo também precisa da ferramenta `Artifact`.
- Node 22.1 ou mais novo ([nodejs.org](https://nodejs.org)). Os scripts usam só a biblioteca padrão e o `node:test`; não há nada para `npm install`.
- `git`, e a linha de comando `gh` para ler e escrever as issues dos contratos.
- Acesso à internet para as verificações de versão e as instalações.
- Windows, macOS ou Linux: todo comando de instalação e atualização existe para os três.
- [uv](https://docs.astral.sh/uv/getting-started/installation/) para o Spec-Kit e o Graphify (a verificação da máquina oferece instalá-lo primeiro).

## Privacidade

O pacote não guarda dado pessoal, caminho local, e-mail nem nome de empresa. A única exceção é o handle do dono do repositório público, `RenatoWernik`, que aparece nos links do repositório. Tudo o que é específico do seu projeto é escrito nos arquivos do seu projeto na hora do setup.

## Licença

[MIT](./LICENSE)
