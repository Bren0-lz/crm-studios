---
description: Executa a próxima tarefa do PLAN.md, verifica, commita e atualiza o estado.
---

Execute **UMA** iteração do loop de desenvolvimento. Responda em pt-BR.

1. Leia `STATE.md` e `PLAN.md`. Identifique a próxima tarefa `TODO` cujas dependências estão `DONE`.
2. Se não houver nenhuma, ou houver bloqueio aberto: **PARE** e diga o motivo.
   Não invente tarefa nova, não "adiante" outra coisa.
3. Marque a tarefa `DOING` no `PLAN.md` e delegue ao agente `implementer` (via Agent,
   subagent_type `implementer`) passando: ID, escopo, gate e as descobertas do diário que
   sejam relevantes.
4. Se voltar `BLOCKED`: marque a tarefa `BLOCKED`, registre o motivo em `STATE.md`, **PARE** e me chame.
5. Delegue ao agente `verifier` (subagent_type `verifier`) passando apenas o ID e o escopo —
   nada do raciocínio do implementer.
6. Se `FAIL`: incremente as tentativas em `STATE.md` e volte ao passo 3 informando o motivo da falha.
   Na **3ª** falha: marque a tarefa `BLOCKED`, **PARE** e me chame.
7. Se `PASS`:
   - marque a tarefa `DONE` no `PLAN.md` e atualize `STATE.md`: última concluída = ID,
     tarefa atual = próxima elegível, tentativas = 0, uma linha no diário
   - `git add -A && git commit -m "<ID>: <título da tarefa>"` — mensagem em pt-BR, **sem**
     linhas `Co-Authored-By` nem "Generated with Claude" (regra do dono do repositório).
     O commit inclui código, `PLAN.md` e `STATE.md` juntos; o hash fica no `git log`.
8. **Nunca** rode `git push`.
9. Reporte em 3 linhas: o que foi feito · gate que passou · qual é a próxima.

**Nunca faça mais de uma tarefa por invocação.** O valor do loop está no ponto de controle
entre iterações, não na velocidade.
