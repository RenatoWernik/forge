# forge

[Read in English](./README.md)

Um plugin do Claude Code que transforma uma pasta vazia num projeto de engenharia completo e verificado, conduzido por um **gauntlet loop**: para cada peça pequena de trabalho, um agente constrói com TDD, outro agente com contexto novo a julga às cegas contra uma barra nomeada, e o loop se repete até o trabalho vencer. O plugin não trava nenhum modelo: quem escolhe é você.

## O que é

O forge empacota uma framework em duas skills:

- `/forge:new-project` confere a sua máquina, faz algumas perguntas, gera o projeto inteiro (manual, invariantes, checklist de bootstrap, dois workflows, um verificador e uma página de painel ao vivo) e executa o bootstrap.
- `/forge:sync` leva de volta para este pacote as melhorias que você fez num projeto gerado, como um patch que você revisa.

Um projeto gerado contém: `CLAUDE.md` (invariantes e glossário, carregado por todo agente), `FRAMEWORK.md` (o manual do orquestrador), `BOOTSTRAP.md` (o checklist de configuração de uma vez só, chamado CP0), os workflows `gauntlet-build` e `gauntlet-ponytail`, `.claude/check.cjs` (valida tudo isso), `.claude/forge.json` (seus modelos e idioma), a página do painel, `.ai-memory.toml`, `.gitignore` e `.graphifyignore`. Os arquivos gerados ficam em inglês; os textos do painel, notas, docs e commits usam o idioma que você escolher no setup.

## Os 8 componentes

O forge não embute estas ferramentas. Ele aponta a fonte oficial de cada uma, compara a sua cópia instalada com a última versão lançada publicamente e instala ou atualiza direto dessa fonte, depois do seu sim.

| # | Componente | O que faz na framework | Fonte oficial |
|---|---|---|---|
| 1 | Gauntlet loop | Loop de construtor e crítico às cegas até o trabalho vencer a barra | [robonuggets/gauntlet-loop](https://github.com/robonuggets/gauntlet-loop) |
| 2 | AI Memory | Memória de longo prazo, decisões e o bastão entre sessões | [akitaonrails/ai-memory](https://github.com/akitaonrails/ai-memory) |
| 3 | Claude-mem | Busca sobre o que foi feito ou tentado em sessões anteriores | [thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) |
| 4 | Ponytail | Corta o excesso de código; roda como um gauntlet próprio por checkpoint | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) |
| 5 | SDD | Desenvolvimento guiado por spec: a CLI Spec-Kit mais a skill guia `sdd` | [github/spec-kit](https://github.com/github/spec-kit), [SpillwaveSolutions/sdd-skill](https://github.com/SpillwaveSolutions/sdd-skill) |
| 6 | TDD | Red antes do código, green depois, uma fatia vertical por vez | [mattpocock/skills](https://github.com/mattpocock/skills) (`tdd`) |
| 7 | Skills do Matt Pocock | Grilling, modelagem de domínio, diagnóstico de bugs, pesquisa e mais | [mattpocock/skills](https://github.com/mattpocock/skills) |
| 8 | Graphify | Grafo de conhecimento do código e dos docs (`query`, `path`, `affected`) | [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) |

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

Reinicie o Claude Code para as skills aparecerem. Para atualizar depois: `claude plugin marketplace update forge`, depois `claude plugin update forge@forge`, depois reinicie.

### `npx skills add`

Não é suportado, de propósito. O `npx skills add` instala a pasta de cada skill (o `SKILL.md` e o que está ao lado dele) no seu projeto. As skills do forge chamam scripts e modelos que ficam na raiz do repositório (`scripts/`, `templates/`, `components.json`) por meio de `${CLAUDE_PLUGIN_ROOT}`, uma variável que só existe quando o Claude Code carrega o repositório como plugin. Instalada sozinha, a `/forge:new-project` não teria o que executar. Use a instalação como plugin acima.

## Uso

1. Crie uma pasta vazia para o projeto novo e abra o Claude Code nela.
2. Digite `/forge:new-project`.
3. Responda no chat. Nada é instalado, baixado, publicado ou escrito fora da pasta sem o seu sim, pedido ação por ação:
   - **Verificação da máquina.** O `doctor` compara cada ferramenta com a última versão lançada publicamente (release do GitHub, PyPI ou npm; nunca uma versão fixa). Para cada componente que falta ou está desatualizado, mostra o comando exato e o link oficial da documentação, e espera o seu sim.
   - **Perguntas de setup.** Nome do projeto, idioma, modelo e esforço do desenvolvedor, do crítico e dos auxiliares, escopo do ai-memory, tipo de script do Spec-Kit (`sh` ou `ps`), estilo simples (sem travessões, setas nem emojis no manual) e regras globais suas que conflitam com a framework.
   - **Geração.** Uma prévia da árvore de arquivos com `--dry-run` e depois os arquivos. Nunca sobrescreve um arquivo existente sem a sua concordância.
   - **Painel.** Com a ferramenta `Artifact` disponível, a página do painel é publicada como artefato privado (só você abre) e semeada. Sem ela, o projeto funciona do mesmo jeito; os workflows avisam que o painel está desligado.
   - **Bootstrap.** O orquestrador executa o `BOOTSTRAP.md` (CP0): init do Spec-Kit, semente da memória, hooks do Graphify, reinício da sessão com um bastão, setup do Matt Pocock e um primeiro gauntlet que valida os workflows. Termina com `node .claude/check.cjs` respondendo `All ok.`
4. Siga com `/speckit-constitution` e um checkpoint por vez (veja o `FRAMEWORK.md` do projeto gerado).

## Configuração de modelos

O forge não fixa nenhum modelo. No setup você escolhe, para cada um de três papéis, um alias de modelo ou ID completo que a ferramenta `Workflow` aceite (por exemplo `sonnet`, `opus`, `haiku`) e um esforço (`low`, `medium`, `high`, `xhigh`, `max`):

| Papel | Serve para |
|---|---|
| `developer` | constrói cada peça com TDD e Ponytail; nunca julga o próprio trabalho |
| `critic` | julga às cegas com contexto novo a cada rodada; o modelo mais forte que você tiver é uma boa escolha |
| `aux` | agente do painel e leitores de pesquisa |

A escolha fica gravada em `.claude/forge.json` do projeto:

```json
{
  "language": "Português (Brasil)",
  "plainStyle": true,
  "models": {
    "developer": { "model": "sonnet", "effort": "high" },
    "critic":    { "model": "opus",   "effort": "high" },
    "aux":       { "model": "sonnet", "effort": "medium", "label": "nome opcional para exibição", "match": "regex opcional que o ID resolvido do modelo deve satisfazer" }
  }
}
```

Os valores acima só mostram o formato. Scripts de Workflow não leem arquivos, então o orquestrador copia `models` e `language` para os `args` de cada chamada de `Workflow`, e o `node .claude/check.cjs` falha se o texto de modelo no `meta` dos workflows divergir do `forge.json`. Para trocar um modelo depois do setup, edite `models` em `.claude/forge.json`, rode `node .claude/check.cjs --render` (ele reescreve os textos de modelo e esforço no `meta` dos dois workflows para casar com o arquivo, e avisa quando nada mudou), depois rode `node .claude/check.cjs` e espere `All ok.` A próxima chamada de `Workflow` já leva os valores novos nos `args`.

## Sync

Depois de melhorar um workflow, o verificador ou o manual dentro de um projeto gerado, abra o Claude Code nesse projeto e digite `/forge:sync`. Ele:

1. pede o caminho do seu clone git deste repositório (o patch precisa cair num clone, não no cache do plugin, que as atualizações substituem);
2. roda o `scripts/sync.mjs`, que reconstrói as suas respostas a partir do `forge.json`, renderiza os modelos com elas, compara o resultado com o seu projeto e devolve os seus valores para marcadores (`{{PROJECT_NAME}}`, `{{MEM_WORKSPACE}}`, `{{MEM_PROJECT}}`, `{{DASHBOARD_URL}}` e outros), para nenhum dado do projeto viajar para o pacote;
3. mostra o patch e sinaliza o que parecer específico seu ou de um projeto (código de saída `3` quer dizer que o patch ainda pode carregar dado do projeto);
4. aplica em `templates/` só depois do seu sim, roda os testes e mostra o `git diff --stat`. Commit e push são ações separadas, cada uma com o seu sim.

Se a comparação não achar diferença, nada é aplicado.

## Comandos manuais

A partir de um clone deste repositório, em qualquer sistema com Node:

```bash
node scripts/doctor.mjs            # relatório da máquina; sai com 0 se tudo está ok, com 1 se não
node scripts/doctor.mjs --json     # o mesmo, como dado
node --test scripts/*.test.mjs     # os testes do pacote
claude plugin validate . --strict                          # o manifesto do marketplace
claude plugin validate .claude-plugin/plugin.json --strict  # o manifesto do plugin
```

O doctor consulta as APIs públicas do GitHub, do PyPI e do npm. Defina `GITHUB_TOKEN` no seu ambiente para evitar o limite de requisições anônimas do GitHub. Ele só imprime comandos; nunca os executa.

## Requisitos

- [Claude Code](https://code.claude.com) com suporte a plugins e a ferramenta `Workflow` (os gauntlets rodam por ela). O painel ao vivo também precisa da ferramenta `Artifact`.
- [Node.js](https://nodejs.org) 20.12 ou mais novo. Os scripts usam só a biblioteca padrão e o `node:test`; não há nada para `npm install`.
- `git`.
- Acesso à internet para as verificações de versão e as instalações.
- Windows, macOS ou Linux: todo comando de instalação e atualização existe para os três.
- [uv](https://docs.astral.sh/uv/getting-started/installation/) para o Spec-Kit e o Graphify (o doctor oferece instalá-lo primeiro).

## Privacidade

O pacote não guarda dado pessoal, caminho local, e-mail nem nome de empresa. A única exceção é o handle do dono do repositório público, `RenatoWernik`, que aparece nos links do repositório. Tudo o que é específico do seu projeto é escrito nos arquivos do seu projeto na hora do setup.

## Licença

[MIT](./LICENSE)
