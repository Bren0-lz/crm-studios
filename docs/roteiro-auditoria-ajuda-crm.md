# Roteiro para completar o manual do CRM no Chrome

Use este arquivo como instrução em uma nova sessão do ChatGPT com acesso à aba do CRM e ao GitHub. Abra uma sessão autenticada do CRM, preferencialmente em conta de demonstração. Anexe também o [manual atual](manual-crm-organiza-studios.md).

## Objetivo da sessão

Mapeie os itens abaixo em [crm.organizastudios.com](https://crm.organizastudios.com) e cruze as descobertas com a branch `main` do [repositório](https://github.com/Bren0-lz/crm-studios). Registre o SHA consultado e use referências daquele commit em toda a entrega. Registre divergências entre a tela publicada e a revisão consultada.

O manual já tem 15 tutoriais. Evite reescrevê-los. Revalide apenas as partes explicitamente marcadas abaixo, ou quando a interface mostrar uma diferença. Em caso de tempo limitado, faça o primeiro bloco que couber e deixe indicado onde retomar.

## Ordem de investigação

As referências de teste abaixo são pontos de partida para a pesquisa. Confirme na interface onde se entra em cada fluxo, quais condições ativam a ação e o que é possível observar sem enviar o formulário.

| Ordem | Módulo | Fluxos por mapear e ponto de partida |
| --- | --- | --- |
| 1 | Agenda e Visão geral | Abra o cartão de um atendimento na **Agenda** e observe **Detalhes** e o menu de três pontos por situação. Mapeie confirmar presença, registrar falta, finalizar atendimento, bloqueio de horário, criar e repetir nota, ver histórico de remarcações e atalhos para pendências e concluídos. Confira se existe lembrete de sessão por WhatsApp, em que tela aparece e se abre uma mensagem ou dispara um envio. Compare com os atalhos da **Visão geral**. Comece em [agenda.spec.ts](../e2e/agenda.spec.ts), [agenda-notes.spec.ts](../e2e/agenda-notes.spec.ts) e [auto-finalization.spec.ts](../e2e/auto-finalization.spec.ts). |
| 2 | Clientes e CRM comercial | Na ficha de **Clientes**, mapeie edição, abas, duplicados, importação, exportação e cadastro com aula experimental, plano, avulso ou produto. No cartão do funil, procure tarefas, contato, mover etapa, marcar perda, editar e importar. Reconfirme os campos obrigatórios de **Novo lead**. Compare com [client-workspace.spec.ts](../e2e/client-workspace.spec.ts), [patients.spec.ts](../e2e/patients.spec.ts) e os testes de `features/commercial`. |
| 3 | Turmas e Lista de espera | Abra **Turmas**, o cartão e uma aula. Mapeie matrícula com vaga, cancelamento, presença, conclusão e reposição. Em **Lista de espera**, mapeie fila por produto, filtros, oferecer vaga, matricular a partir da fila, remover cliente e opções de aviso. Separe turma cheia de fila por serviço. Consulte [groups.spec.ts](../e2e/groups.spec.ts) e os testes de `features/waitlist`. |
| 4 | Planos e sessões, Financeiro e Vendas | Abra o menu de um plano e os detalhes de uma parcela. Procure saldo, renovação, pausa, cancelamento, devolução, ajustes, comprovantes, recibos e pagamentos parciais ou divididos. Inspecione **Contas a pagar** e **Comissões** para despesas, recorrências, fornecedores e folha. Em **Vendas de produtos**, confira nova venda, descontos, estoque, histórico e reversão. Use [plans-finance.spec.ts](../e2e/plans-finance.spec.ts), [receivables-actions.spec.ts](../e2e/receivables-actions.spec.ts) e [sales-history-cards.spec.ts](../e2e/sales-history-cards.spec.ts). |
| 5 | Comunicações, Contatos sugeridos e Eventos | Confira campanhas, modelos de mensagem, prévia, destinatários, agendamento, falhas e permissões. Em **Contatos sugeridos**, identifique motivos, meios disponíveis e como registrar o contato. No cartão de **Eventos**, mapeie editar, participantes, importar, exportar e converter, quando disponíveis. Comece em [events.spec.ts](../e2e/events.spec.ts) e nos testes desses módulos. |
| 6 | Contratos, recibos e assinaturas públicas | Separe os passos de quem monta, revisa e emite o documento dos passos de quem recebe o link e assina. Verifique geração do link, envio, estados, cancelamento e diferenças entre contrato e recibo. Use [contracts.spec.ts](../e2e/contracts.spec.ts) e [public-signature.spec.ts](../e2e/public-signature.spec.ts). Não use links reais de assinatura. |
| 7 | Prontuários, Relatórios e Histórico | Confira ficha, anexos, evolução, avaliação, modelos e exportação em **Prontuários**. Em **Relatórios**, mapeie filtros específicos de cada aba e exportação. Em **Histórico**, confira os filtros, detalhes e a navegação até o registro de origem. Comece em [reports.spec.ts](../e2e/reports.spec.ts) e nos testes desses módulos. |
| 8 | Configurações, perfis e Meu perfil | Mapeie usuários e permissões, filiais, serviços e salas, tipos de plano, formas de pagamento, feriados, integrações e nomes das abas. Confira atualização de perfil e senha. Compare menu e ações de um perfil restrito, se houver sessão apropriada. Use [settings.spec.ts](../e2e/settings.spec.ts) e [permissoes.md](permissoes.md). |

## Como verificar

1. Abra telas, menus, filtros e formulários em modo de leitura. Observe nome, posição e ordem dos controles. Use somente dados fictícios ao preencher campos para visualizar opções.
2. Evite salvar, enviar mensagem, registrar pagamento, excluir, cancelar ou alterar configurações. Para confirmar resultados de ações que gravam, consulte as asserções dos testes da mesma revisão e identifique essa fonte.
3. Confira se o rótulo, a permissão, a situação do registro e a sequência correspondem ao mesmo fluxo. Uma rota sozinha não comprova que existe um caminho no menu.
4. Se a sessão não tiver o perfil ou situação necessários, registre o ponto exato que falta conferir. Evite capturar ou transcrever dados pessoais, credenciais e links privados.

## Entrega para incorporar ao manual

Entregue um arquivo `novos-tutoriais-crm.md` com um bloco para cada tarefa comprovada. Mantenha os rótulos abaixo, que o chatbot usa para ler os guias. Use um identificador novo a partir de `tarefa-16`. Use **Também perguntam** para incluir formas comuns e específicas de pedir ajuda. Separe tarefas parecidas, como criar uma matrícula e oferecer uma vaga.

```markdown
<a id="tarefa-16"></a>

## [Nome da tarefa em linguagem simples]

- **Também perguntam:** [Pergunta comum? Outra forma de pedir a mesma tarefa?]
- **Onde começar:** Menu lateral → [Tela](https://crm.organizastudios.com/...).
- **Antes de começar:** [Perfil, permissão ou condição confirmada.]

1. [Uma ação curta com o nome exato do botão ou campo em **negrito**.]
2. [Próxima ação.]

**Como saber se deu certo:** [Resultado que aparece, se confirmado.]
**Se o botão não aparecer:** [Condição verificada ou pergunta simples.]
**Verificação:** [O que foi visto na tela e o que foi confirmado em código/teste.]
**Fontes:** [Tela] · [Arquivo no SHA consultado] · [Teste no mesmo SHA]
```

Ao final, liste **Pendências de verificação** com módulo, tarefa, última tela aberta e o que faltou comprovar. Se precisar parar, diga qual item deve ser retomado primeiro. Escreva para quem tem pouca experiência com computador. Use frases curtas, uma ação por passo e os nomes que aparecem na tela.
