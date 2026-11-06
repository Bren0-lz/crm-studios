---
description: Executa a próxima tarefa do PLAN.md, verifica, commita, abre PR e atualiza o estado.
---

Execute **UMA** iteração do loop de desenvolvimento. Responda em pt-BR.

1. Leia o `PLAN.md` (Status de cada tarefa). Identifique a próxima tarefa `TODO` cujas dependências estão `DONE`.
2. Se não houver nenhuma, ou houver bloqueio aberto: **PARE** e diga o motivo.
   Não invente tarefa nova, não "adiante" outra coisa.
   Se a tarefa elegível tiver `**Tipo:** manual`: **não delegue**. Marque-a `BLOCKED` no
   `PLAN.md`, registre em `diario/<data>-<ID>.md` "aguardando revisão manual de <ID>", **PARE** e me chame
   com o escopo da revisão. (Marcar `BLOCKED` faz o loop headless parar; o dono marca `DONE`
   depois de aprovar.)
3. Crie o branch da tarefa a partir da `main` atual (`git fetch origin main` e
   `git switch -c <branch-da-tarefa> origin/main`), nunca de um branch antigo ou de outro PR
   (regras em "PRs sem conflito" no `CLAUDE.md`). Marque a tarefa `DOING` no `PLAN.md` e delegue ao agente `implementer` (via Agent,
   subagent_type `implementer`) passando: ID, escopo, gate e as descobertas do diário que
   sejam relevantes (arquivos das tarefas relacionadas em `diario/` e, para o histórico
   anterior a 06/11/2026, o `STATE.md`).
4. Se voltar `BLOCKED`: marque a tarefa `BLOCKED`, registre o motivo em `diario/<data>-<ID>.md`, **PARE** e me chame.
5. Delegue ao agente `verifier` (subagent_type `verifier`) passando apenas o ID e o escopo —
   nada do raciocínio do implementer.
6. Se `FAIL`: registre `FAIL n/3: <motivo>` em `diario/<data>-<ID>.md` e volte ao passo 3 informando o motivo da falha.
   Na **3ª** falha: marque a tarefa `BLOCKED`, **PARE** e me chame.
7. Se `PASS`:
   - marque a tarefa `DONE` no `PLAN.md` e escreva a linha `DONE` (gate, decisões,
     descobertas) em `diario/<data>-<ID>.md`. **Não edite o `STATE.md`** (regra "Diário por
     tarefa" do `CLAUDE.md`)
   - rode `node apps/web/scripts/audit-panels.cjs` (exceto na D01, que é quem o zera); se falhar,
     trate como `FAIL` do passo 6
   - `git add -A && git commit -m "<ID>: <título da tarefa>"` — mensagem em pt-BR, **sem**
     linhas `Co-Authored-By` nem "Generated with Claude" (regra do dono do repositório).
     O commit inclui código, `PLAN.md` e o arquivo do diário juntos; o hash fica no `git log`.
8. Sincronize com a `main` antes do push: `git fetch origin main && git merge origin/main`.
   Se houver conflito, resolva trecho a trecho (nunca `checkout --ours/--theirs` no arquivo
   inteiro), renumere a migração se o número já existir na `main`, porte para MySQL
   qualquer SQL do Postgres que venha do branch (seção "Banco de dados: MySQL/MariaDB" do
   `CLAUDE.md`), rode o gate completo de novo
   e confirme `git merge-tree --write-tree origin/main HEAD` com saída 0.
   Abra um PR: `git push -u origin <branch-da-tarefa>` (nunca no branch padrão, nunca
   force-push) e crie o pull request para o branch padrão com título `<ID>: <título da tarefa>`
   e descrição em pt-BR com o que mudou e a saída do gate (inclua `npm run test:mysql` quando a
   tarefa mexer em SQL ou migração).
9. Reporte em 3 linhas: o que foi feito · gate que passou + link do PR · qual é a próxima.

**Nunca faça mais de uma tarefa por invocação.** O valor do loop está no ponto de controle
entre iterações, não na velocidade.
