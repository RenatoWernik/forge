// Corpus de comandos dos hooks (F-13, #14): o oráculo fechado dos critérios 1 e 2, versionado e alargável.
// Cada comando é só TEXTO que vai no JSON do evento PreToolUse; nenhum é executado. Cada um corre com tool_name Bash e PowerShell,
// com o mesmo veredito esperado. Os primeiros de cada lista são os do contrato, pela ordem da issue #14.
// Um comando acrescentado aqui pertence a uma classe do contrato ou das respostas do orquestrador às PERGUNTAS da Ronda −1 (#14, 2026-10-29).

// Critério 1. Matar processos por nome: tem de BLOQUEAR (e a mensagem diz a alternativa, matar por PID)
export const MATAR_BLOQUEIA = [
  // do contrato
  'taskkill /IM node.exe', 'taskkill /F /IM node.exe', 'taskkill /im node.exe /t', 'killall node', 'pkill node', 'pkill -f node',
  'Stop-Process -Name node', 'Get-Process node | Stop-Process', 'kill $(pgrep node)',
  // taskkill: maiúsculas, ordem das opções, espaços, aspas, .exe, caminho completo, coringa, filtro por imagem, forma do Git Bash
  'taskkill /im NODE.EXE /t', 'TASKKILL /F /IM node.exe', 'TaskKill /Im Node.Exe', 'taskkill /F /IM node.exe /T', 'taskkill /T /F /IM node.exe',
  'taskkill  /F   /IM   node.exe', 'taskkill /IM "node.exe"', "taskkill /IM 'node.exe'", 'taskkill /IM node.exe /F', 'taskkill.exe /F /IM node.exe',
  'taskkill /f /im node*', 'taskkill //F //IM node.exe', 'taskkill //IM node.exe //T', 'taskkill /FI "IMAGENAME eq node.exe" /F',
  'C:\\Windows\\System32\\taskkill.exe /F /IM node.exe', 'taskkill\t/IM\tnode.exe',
  // Unix: sinais, aspas, sudo, substituição de comando, xargs
  'killall -9 node', 'killall -KILL node', 'killall "node"', "pkill 'node'", 'pkill -9 node', 'pkill -9 -f node', 'pkill -f "node server.js"',
  'sudo killall node', 'sudo pkill -f node', 'kill -9 $(pgrep node)', 'kill $(pgrep -f node)', 'kill -9 `pgrep node`', 'kill $(pidof node)',
  'pgrep node | xargs kill', 'pgrep -f node | xargs kill -9', "ps aux | grep node | awk '{print $2}' | xargs kill",
  // PowerShell: maiúsculas, aspas, -ProcessName, aliases (spps, gps, kill), .Kill(), Where-Object
  'Stop-Process -Name node -Force', 'Stop-Process -Name "node"', "Stop-Process -Name 'node' -Force", 'stop-process -name node', 'STOP-PROCESS -NAME NODE',
  'Stop-Process -ProcessName node', 'spps -Name node', 'Get-Process node | Stop-Process -Force', 'Get-Process -Name node | Stop-Process', 'gps node | spps',
  'Get-Process node | kill', '(Get-Process node).Kill()', 'Get-Process -Name node | ForEach-Object { $_.Kill() }',
  'Get-Process | Where-Object { $_.Name -eq "node" } | Stop-Process', 'Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force',
  // wmic
  'wmic process where name="node.exe" delete', 'wmic process where "name=\'node.exe\'" call terminate',
  // dentro de cmd /c, powershell -c, pwsh, bash -c, sh -c
  'cmd /c taskkill /IM node.exe', 'cmd.exe /c "taskkill /F /IM node.exe"', 'cmd /C "taskkill /im node.exe /t"', 'powershell -c "Stop-Process -Name node"',
  'powershell -Command "Get-Process node | Stop-Process"', 'powershell.exe -NoProfile -Command "Stop-Process -Name node -Force"',
  'pwsh -c "Get-Process node | Stop-Process"', 'bash -c "killall node"', "sh -c 'pkill -f node'",
  // encadeados com &&, ;, ||, |, nova linha, &, subshell, bloco, prefixos
  'npm test && taskkill /IM node.exe', 'taskkill /F /IM node.exe; npm start', 'git status; killall node', 'npm run build || pkill node',
  'cd app && Stop-Process -Name node -Force; npm start', 'npm test\ntaskkill /IM node.exe', 'echo y | taskkill /F /IM node.exe', 'killall node &',
  '(pkill node)', '{ killall node; }', 'if ($true) { Stop-Process -Name node }', '   killall node', 'FOO=1 killall node',
  'timeout 5 && taskkill /F /IM node.exe', 'Start-Sleep 1; Get-Process node | Stop-Process',
  // resposta 2 do orquestrador (#14): matar QUALQUER processo por nome bloqueia, não só o node
  'taskkill /IM chrome.exe', 'taskkill /F /IM python.exe', 'pkill python', 'killall vite', 'Stop-Process -Name code', 'killall -9 python3',
  'Stop-Process -Name chrome -Force', 'Get-Process code | Stop-Process', 'taskkill /F /IM msedge.exe /T', 'pkill -f vitest',
];

// Critério 1. Tem de PASSAR: matar por PID, comandos com «node», e o texto dos comandos perigosos como dado (echo, grep, commit, listar)
export const MATAR_PASSA = [
  // do contrato
  'taskkill /PID 1234', 'taskkill /F /PID 1234', 'kill 1234', 'Stop-Process -Id 1234', 'node --version', 'git log',
  // por PID, em todas as formas
  'taskkill /PID 1234 /T /F', 'taskkill //PID 1234 //F', 'TASKKILL /pid 1234', 'taskkill /F /PID 1234 /PID 5678', 'kill -9 1234', 'kill -TERM 1234 5678',
  'kill -s KILL 1234', 'Stop-Process -Id 1234 -Force', 'Stop-Process -Id 1234,5678', 'spps -Id 1234', 'Get-Process -Id 1234 | Stop-Process',
  '(Get-Process -Id 1234).Kill()', 'kill $(cat server.pid)', 'kill -9 $(cat .checkpoints/dev.pid)', 'xargs kill < pids.txt', 'kill "$SERVER_PID"',
  'kill $!', 'Stop-Process -Id $proc.Id', 'node -e "process.kill(1234)"', 'kill %1',
  // comandos comuns que têm «node» ou «kill»
  'node --test', 'node server.js', 'npm test', 'npm run dev', 'git status', 'cd node && npm test', 'ls node_modules', 'Get-ChildItem node_modules', 'nodemon server.js',
  // o texto perigoso como dado: echo, grep, commit, issue, documentação
  'echo killall node', 'echo "taskkill /IM node.exe"', "Write-Output 'Stop-Process -Name node'", 'Write-Host "pkill node"', 'grep taskkill README.md',
  'grep -rn "taskkill /IM node.exe" docs', 'rg "killall node" .', "Select-String -Pattern 'Stop-Process -Name node' -Path *.md",
  'git commit -m "docs: nunca taskkill /IM node.exe"', 'git log --grep=killall', 'gh issue comment 14 --body "nunca uses pkill node"', 'cat docs/taskkill.md',
  'man killall', 'Get-Help Stop-Process', 'Get-Command taskkill',
  // listar processos por nome sem os matar
  'Get-Process node', 'Get-Process -Name node | Select-Object Id', 'Get-Process node | Format-Table Id,CPU', 'pgrep node', 'pgrep -f "node server.js"',
  'ps aux | grep node', 'tasklist /FI "IMAGENAME eq node.exe"', 'tasklist | findstr node', 'wmic process where name="node.exe" get processid', 'echo $(pgrep node)',
  // dentro de wrappers e encadeados, sem matar por nome
  'cmd /c npm test', 'powershell -c "Get-Process node"', 'bash -c "node --version"', 'taskkill /PID 1234 && node server.js', 'node --test; taskkill /PID 4321',
];

// Critério 2. Comandos de teste: com run_in_background true têm de BLOQUEAR (a mensagem diz a alternativa: primeiro plano, blocos de até 9 min);
// os mesmos em primeiro plano (run_in_background false ou ausente) têm de PASSAR
export const TESTES = [
  // do contrato
  'npm test', 'npm run test', 'pnpm test', 'yarn test', 'npx vitest', 'vitest run', 'npx playwright test', 'pytest', 'node --test', 'go test ./...', 'cargo test', 'dotnet test',
  // os mesmos com argumentos, caminhos e formas equivalentes
  'npm test -- --reporter=dot', 'npm run test -- --watch=false', 'pnpm test --filter api', 'pnpm run test', 'yarn test --ci', 'yarn run test', 'yarn test --watchAll=false',
  'pnpm test -- --run', 'npx vitest run', 'npx vitest --run', 'npx vitest run src/painel.test.ts', 'npx vitest run --coverage', 'pnpm vitest run', 'pnpm exec vitest run',
  'vitest run --reporter=verbose', 'vitest', 'npx playwright test --project=chromium', 'npx playwright test tests/e2e/login.spec.ts', 'npx playwright test --headed',
  'npx playwright test --grep @smoke', 'pnpm exec playwright test', 'pnpm playwright test', 'pytest -q tests/', 'pytest -k hooks', 'python -m pytest -x', 'python3 -m pytest',
  'node --test scripts/*.test.mjs', 'node --test --test-reporter=tap tests/critico/', 'node --test tests/critico/f-13-r0/', 'node --test --test-concurrency=1', 'node --test test/',
  'go test ./... -run TestHooks', 'go test -v ./pkg/...', 'go test -race ./...', 'cargo test --release', 'cargo test -p forge', 'cargo test -- --nocapture',
  'dotnet test MySln.sln', 'dotnet test --no-build', 'dotnet test ./tests/Unit.csproj', 'npm.cmd test', 'npx.cmd vitest run',
  // encadeados, redireções, variáveis de ambiente, wrappers
  'cd app && npm test', 'npm run build && npm test', 'npm test 2>&1 | tee test.log', 'npm test > test.log 2>&1', 'CI=1 npm test', '$env:CI=1; npx vitest run',
  'cmd /c npm test', 'powershell -c "npm test"', 'timeout 540 npx playwright test', 'NODE_OPTIONS=--max-old-space-size=4096 node --test', '  npm test',
  'cd /d C:\\work\\app && pnpm test',
  // resposta 3 do orquestrador (#14): jest, bun test, deno test, npm t, test:e2e e mocha também são comandos de teste
  'npx jest', 'npx jest --ci', 'jest', 'bun test', 'bun test src/', 'deno test', 'deno test -A', 'npm t', 'npm run test:e2e', 'pnpm run test:e2e',
  'npx mocha', 'mocha tests/',
  // R1 do crítico (#14, 2026-10-29): atalho de script do pnpm e do yarn sem `run`, e opções com valor dos gestores antes do subcomando
  'pnpm test:e2e', 'yarn test:e2e', 'pnpm test:unit', 'pnpm --filter @guilda/web test', 'pnpm --filter api test', 'pnpm -C app test',
  'pnpm --dir packages/web test', 'pnpm run -r test', 'npm --prefix app test', 'npm -w api test', 'yarn workspace api test',
  // a mesma classe: outras formas das mesmas opções
  'pnpm -r test', 'pnpm -w test', 'npm test -w api', 'npm --workspace api test', 'pnpm --filter=api test', 'pnpm --dir=app test:e2e', 'yarn --cwd app test',
  'yarn --cwd app test:unit', 'bun --cwd app test', 'pnpm -F api run test:e2e', 'npm --prefix app run test:e2e', 'pnpm --filter api exec vitest run',
  'bun test:e2e', 'pnpm --filter "@guilda/web" test',
];

// Critério 2. Em segundo plano (run_in_background true) têm de PASSAR: servidores, builds e comandos que só mencionam «test»
export const FUNDO_PASSA = [
  // do contrato
  'npm run dev', 'node server.js',
  // servidores e vigias
  'npm start', 'pnpm dev', 'yarn dev', 'npx vite', 'vite --port 5173', 'next dev', 'npm run dev -- --port 3001', 'node --watch server.js', 'node --inspect server.js',
  'python -m http.server 8000', 'python app.py', 'npx http-server ./dist', 'npx tsc --watch', 'docker compose up', 'npm run storybook', 'dotnet run', 'cargo run', 'go run ./cmd/server',
  // servidores e comandos com «test» no caminho ou no texto
  'node tests/fixtures/server.mjs', 'npx serve test-results', 'tail -f test.log', 'echo "npm test"', 'cat test-results.json', 'git log --grep test',
  // outros trabalhos longos que não são testes
  'npm run build', 'npm install', 'git fetch',
  // resposta 3 do orquestrador (#14): o show-report do Playwright é um servidor e passa
  'npx playwright show-report', 'npx playwright show-report playwright-report', 'pnpm exec playwright show-report',
  // R1 do crítico (#14): vizinhos dos comandos com opções com valor e atalhos de script, que não são testes
  'pnpm --filter api dev', 'pnpm --filter @guilda/web dev', 'pnpm -C app dev', 'pnpm --dir packages/web start', 'pnpm run -r build', 'pnpm -r build', 'pnpm -w build',
  'npm --prefix app run dev', 'npm -w api run build', 'yarn workspace api dev', 'yarn --cwd app start', 'bun --cwd app dev', 'pnpm build',
  'pnpm --filter api dev -- --test', 'pnpm --filter api dev -- test', 'npm run dev -- --test', 'pnpm -F api start',
  'pnpm --filter test dev', 'yarn workspace test dev',
];
