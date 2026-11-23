# Novos tutoriais do CRM Organiza Studios

**Inspeção:** 20/11/2026, horário de São Paulo.  
**Revisão funcional consultada da branch main:** [`dd13b30dbf99a361899221397f476792601a54d2`](https://github.com/Bren0-lz/crm-studios/commit/dd13b30dbf99a361899221397f476792601a54d2). A main foi conferida novamente ao fim e continuava nesse SHA. Todas as referências de código e testes abaixo estão fixadas nessa revisão.  
**Site:** [crm.organizastudios.com](https://crm.organizastudios.com). A revisão exata publicada não foi identificada; não se presume que seja o mesmo commit.  
**Sessão:** perfil Admin, já autenticado no Brave. Não foi necessário novo login. A inspeção não foi feita no Chrome.  
**Base:** os 15 tutoriais anteriores foram consultados na revisão de documentação disponível. Eles não foram reescritos. Este complemento usa os identificadores **tarefa-16 a tarefa-101**.

**Atualização de 23/11/2026:** Os guias 102 a 104 e as correções do guia 80 refletem a revisão posterior da interface. As evidências datadas abaixo registram a auditoria original de 20/11.

## Como interpretar a verificação

Os oito blocos do roteiro foram percorridos. A autorização posterior permitiu adicionar dados fictícios ao ambiente informado como não produtivo. Os registros criados foram identificados com **[DEMO]**.

Cada tarefa separa o que foi visto na interface, o que foi executado com dados fictícios e o que foi confirmado somente no código ou nas asserções de testes. **Os testes foram lidos, não executados nesta auditoria.** Um link para um teste não significa que todos os passos daquele guia tenham sido exercitados por esse teste; o campo **Verificação** delimita sua cobertura.

Os passos de salvar, enviar, cancelar ou assinar são instruções para quem usar o manual. A auditoria só executou as gravações fictícias descritas no registro ao final. Nenhuma mensagem foi enviada pelo WhatsApp, nenhum link público de assinatura foi aberto e nenhuma assinatura foi feita.

O plugin de consulta ao manual respondeu **INVALID_ARGUMENT** nas tentativas e nas repetições. A conferência usou a interface autenticada e os arquivos da revisão acima pelo GitHub. Para permissões por operação, consulte [Permissões da revisão][fonte-124].

## Índice dos novos tutoriais

| ID | Tarefa | Onde começar |
| --- | --- | --- |
| 16 | [Confirmar a presença de um cliente](#tarefa-16) | Agenda |
| 17 | [Registrar que o cliente faltou](#tarefa-17) | Agenda |
| 18 | [Finalizar um atendimento individual](#tarefa-18) | Agenda |
| 19 | [Bloquear um horário de profissional ou sala](#tarefa-19) | Agenda |
| 20 | [Criar uma nota na agenda](#tarefa-20) | Agenda |
| 21 | [Criar uma nota que se repete](#tarefa-21) | Agenda |
| 22 | [Editar uma nota de uma série](#tarefa-22) | Agenda |
| 23 | [Ver o histórico de remarcações](#tarefa-23) | Agenda |
| 24 | [Finalizar os atendimentos pendentes em uma lista](#tarefa-24) | Agenda |
| 25 | [Consultar atendimentos concluídos](#tarefa-25) | Agenda |
| 26 | [Preparar um lembrete de sessão por WhatsApp](#tarefa-26) | Comunicações |
| 27 | [Editar o cadastro de um cliente](#tarefa-27) | Clientes |
| 28 | [Importar clientes de uma planilha](#tarefa-28) | Clientes |
| 29 | [Exportar a lista de clientes](#tarefa-29) | Clientes |
| 30 | [Cadastrar um cliente e já agendar uma aula experimental](#tarefa-30) | Clientes |
| 31 | [Cadastrar um cliente e contratar um plano na mesma tela](#tarefa-31) | Clientes |
| 32 | [Cadastrar um cliente e vender uma sessão avulsa](#tarefa-32) | Clientes |
| 33 | [Cadastrar um cliente e adicionar um produto](#tarefa-33) | Clientes |
| 34 | [Criar e acompanhar uma tarefa de um lead](#tarefa-34) | CRM comercial |
| 35 | [Registrar um contato com um lead](#tarefa-35) | CRM comercial |
| 36 | [Mover um lead para outra etapa](#tarefa-36) | CRM comercial |
| 37 | [Marcar um lead como perdido](#tarefa-37) | CRM comercial |
| 38 | [Importar leads para o funil](#tarefa-38) | CRM comercial |
| 39 | [Matricular um cliente em uma turma com vaga](#tarefa-39) | Turmas |
| 40 | [Cancelar uma matrícula da turma](#tarefa-40) | Turmas |
| 41 | [Registrar a frequência de uma aula da turma](#tarefa-41) | Turmas |
| 42 | [Concluir uma aula de turma](#tarefa-42) | Turmas |
| 43 | [Reservar uma aula de reposição](#tarefa-43) | Turmas |
| 44 | [Colocar um cliente na espera por produto](#tarefa-44) | Lista de espera |
| 45 | [Consultar e filtrar a lista de espera](#tarefa-45) | Lista de espera |
| 46 | [Avisar que surgiu vaga ou chegou um produto](#tarefa-46) | Lista de espera |
| 47 | [Matricular um cliente a partir da fila](#tarefa-47) | Lista de espera |
| 48 | [Atualizar a situação de uma pessoa na fila](#tarefa-48) | Lista de espera |
| 49 | [Remover uma entrada da lista de espera](#tarefa-49) | Lista de espera |
| 50 | [Consultar o saldo e o extrato de sessões](#tarefa-50) | Planos e sessões |
| 51 | [Renovar o plano de um cliente](#tarefa-51) | Planos e sessões |
| 52 | [Pausar um plano e depois ativá-lo](#tarefa-52) | Planos e sessões |
| 53 | [Cancelar um plano e registrar uma devolução](#tarefa-53) | Planos e sessões |
| 54 | [Dividir a contratação de um plano entre formas de pagamento](#tarefa-54) | Planos e sessões |
| 55 | [Ajustar o valor de uma parcela em aberto](#tarefa-55) | Financeiro |
| 56 | [Registrar um recebimento parcial](#tarefa-56) | Financeiro |
| 57 | [Registrar um recebimento dividido entre formas](#tarefa-57) | Financeiro |
| 58 | [Anexar comprovantes de pagamento](#tarefa-58) | Financeiro |
| 59 | [Consultar, imprimir e acompanhar um recibo](#tarefa-59) | Financeiro |
| 60 | [Cadastrar uma despesa pontual](#tarefa-60) | Financeiro |
| 61 | [Cadastrar uma despesa que se repete todo mês](#tarefa-61) | Financeiro |
| 62 | [Cadastrar um fornecedor](#tarefa-62) | Vendas de produtos |
| 63 | [Consultar comissões e cadastrar uma regra](#tarefa-63) | Financeiro |
| 64 | [Cadastrar um produto com preço e estoque inicial](#tarefa-64) | Vendas de produtos |
| 65 | [Registrar uma venda de produto com desconto](#tarefa-65) | Vendas de produtos |
| 66 | [Consultar o histórico e os detalhes de vendas](#tarefa-66) | Vendas de produtos |
| 67 | [Ajustar o estoque de um produto](#tarefa-67) | Vendas de produtos |
| 68 | [Cancelar uma venda de produto ainda a receber](#tarefa-68) | Vendas de produtos |
| 69 | [Estornar e cancelar uma venda de produto paga](#tarefa-69) | Vendas de produtos |
| 70 | [Criar uma mensagem padrão com prévia](#tarefa-70) | Comunicações |
| 71 | [Programar os momentos de uma campanha automática](#tarefa-71) | Comunicações |
| 72 | [Entender a sugestão e registrar o contato](#tarefa-72) | Contatos sugeridos |
| 73 | [Editar os dados de um evento](#tarefa-73) | Eventos |
| 74 | [Adicionar um participante a um evento](#tarefa-74) | Eventos |
| 75 | [Importar participantes de um evento](#tarefa-75) | Eventos |
| 76 | [Exportar a lista de participantes](#tarefa-76) | Eventos |
| 77 | [Transformar um participante em cliente](#tarefa-77) | Eventos |
| 78 | [Criar um modelo de documento](#tarefa-78) | Contratos |
| 79 | [Preparar, revisar e emitir um documento](#tarefa-79) | Contratos |
| 80 | [Preparar o link de assinatura de um contrato](#tarefa-80) | Contratos |
| 81 | [Assinar um contrato recebido da clínica](#tarefa-81) | Link recebido da clínica |
| 82 | [Assinar um recibo recebido da clínica](#tarefa-82) | Link recebido da clínica |
| 83 | [Cancelar um documento emitido ou em rascunho](#tarefa-83) | Contratos |
| 84 | [Abrir e consultar a ficha de prontuário](#tarefa-84) | Prontuários |
| 85 | [Anexar um arquivo ao prontuário](#tarefa-85) | Prontuários |
| 86 | [Criar e publicar um modelo de avaliação](#tarefa-86) | Prontuários |
| 87 | [Registrar uma avaliação usando um formulário](#tarefa-87) | Prontuários |
| 88 | [Exportar ou imprimir o prontuário](#tarefa-88) | Prontuários |
| 89 | [Consultar os filtros e exportar um relatório](#tarefa-89) | Relatórios |
| 90 | [Filtrar e exportar o extrato financeiro](#tarefa-90) | Relatórios |
| 91 | [Pesquisar alterações e abrir seus detalhes](#tarefa-91) | Histórico |
| 92 | [Consultar e ajustar as permissões de um usuário](#tarefa-92) | Configurações |
| 93 | [Cadastrar uma filial](#tarefa-93) | Configurações |
| 94 | [Cadastrar um serviço e definir seus recursos](#tarefa-94) | Configurações |
| 95 | [Cadastrar uma sala com capacidade](#tarefa-95) | Configurações |
| 96 | [Cadastrar um plano no catálogo](#tarefa-96) | Configurações |
| 97 | [Adicionar um feriado ao calendário](#tarefa-97) | Configurações |
| 98 | [Definir parcelamento das formas de pagamento](#tarefa-98) | Configurações |
| 99 | [Mudar o nome exibido de uma aba do menu](#tarefa-99) | Configurações |
| 100 | [Atualizar a foto e o nome do próprio perfil](#tarefa-100) | Meu perfil |
| 101 | [Alterar a própria senha](#tarefa-101) | Meu perfil |
| 102 | [Sair de todos os dispositivos](#tarefa-102) | Menu lateral |
| 103 | [Inativar clientes em lote](#tarefa-103) | Clientes |
| 104 | [Consultar o histórico de acessos ao prontuário](#tarefa-104) | Prontuários |

<a id="tarefa-16"></a>

## Confirmar a presença de um cliente

- **Também perguntam:** Como confirmo a sessão? Como marco o atendimento como confirmado?
- **Onde começar:** Menu lateral → [Agenda](https://crm.organizastudios.com/agenda).
- **Antes de começar:** Atendimento **Agendado** e acesso para marcar presença.

1. Abra o cartão do atendimento.
2. Clique em **Confirmar presença**.

**Como saber se deu certo:** A janela fecha. Aparece **Presença confirmada.**

**Se o botão não aparecer:** O atendimento já confirmado não mostra essa ação. Confira a permissão **Marcar presença**.

**Verificação:** Executado no atendimento fictício. Código e teste confirmam a mudança para Confirmado.

**Fontes:** [Agenda](https://crm.organizastudios.com/agenda) · [AppointmentDetailsModal.tsx][fonte-1] · [dashboard-appointment-actions.integration.test.tsx][fonte-2]

<a id="tarefa-17"></a>

## Registrar que o cliente faltou

- **Também perguntam:** Como marco falta? Como registro que não compareceu?
- **Onde começar:** Menu lateral → [Agenda](https://crm.organizastudios.com/agenda).
- **Antes de começar:** Atendimento agendado ou confirmado. Aguarde a liberação: 15 minutos antes do início.

1. Abra os detalhes do atendimento.
2. Clique em **Marcar falta**.
3. Se necessário, preencha **Motivo (opcional)** com pelo menos dois caracteres.
4. Clique em **Registrar falta**.

**Como saber se deu certo:** Aparece **Falta registrada.** O cartão passa a **Não compareceu**.

**Se o botão não aparecer:** Confira o horário de liberação e a permissão de presença.

**Verificação:** Falta registrada no atendimento fictício. Teste cobre motivo vazio e preenchido. A tela informa que falta não consome sessão.

**Fontes:** [Agenda](https://crm.organizastudios.com/agenda) · [AppointmentDetailsModal.tsx][fonte-1] · [appointment-attendance.integration.test.tsx][fonte-3]

<a id="tarefa-18"></a>

## Finalizar um atendimento individual

- **Também perguntam:** Como marco a sessão como realizada? Como concluo um atendimento?
- **Onde começar:** Menu lateral → [Agenda](https://crm.organizastudios.com/agenda).
- **Antes de começar:** Atendimento agendado ou confirmado e permissão de presença. A ação libera 15 minutos antes do início.

1. Abra os detalhes do atendimento.
2. Confira a data e o cliente.
3. Clique em **Marcar como realizado**.

**Como saber se deu certo:** O atendimento passa a **Finalizado**. A sessão vinculada é consumida ao finalizar.

**Se o botão não aparecer:** Confira a situação e o aviso de horário disponível.

**Verificação:** Botão visto habilitado e desabilitado conforme o horário. Mudança individual conferida no teste; a gravação manual desta auditoria usou a fila A finalizar.

**Fontes:** [Agenda](https://crm.organizastudios.com/agenda) · [AppointmentDetailsModal.tsx][fonte-1] · [appointment-attendance.integration.test.tsx][fonte-3]

<a id="tarefa-19"></a>

## Bloquear um horário de profissional ou sala

- **Também perguntam:** Como fecho a agenda para uma folga? Como reservo indisponibilidade da sala?
- **Onde começar:** Menu lateral → [Agenda](https://crm.organizastudios.com/agenda).
- **Antes de começar:** Acesso para **Bloquear horários** e recurso cadastrado.

1. Clique em **Bloquear horário**.
2. Em **Tipo**, escolha **Profissional** ou **Sala**.
3. Selecione o **Recurso**.
4. Preencha **Início**, **Término** e **Motivo**.
5. Clique em **Criar bloqueio**.

**Como saber se deu certo:** O bloqueio aparece na Agenda, conforme o componente de criação.

**Se o botão não aparecer:** Confira a permissão de bloqueio. Recurso, datas e motivo precisam estar preenchidos.

**Verificação:** Formulário visto sem salvar. Código confirma criação; teste consultado verifica os campos que habilitam o botão.

**Fontes:** [Agenda](https://crm.organizastudios.com/agenda) · [ScheduleBlockModal.tsx][fonte-4] · [schedule-block-missing.integration.test.tsx][fonte-5]

<a id="tarefa-20"></a>

## Criar uma nota na agenda

- **Também perguntam:** Como deixo um recado na agenda? Como faço uma anotação sem atendimento?
- **Onde começar:** Menu lateral → [Agenda](https://crm.organizastudios.com/agenda).
- **Antes de começar:** Acesso a recados da Agenda. A nota não reserva um atendimento.

1. Clique em **Nova nota**.
2. Preencha **Descrição**, **Data**, **Hora inicial** e **Hora final**.
3. Escolha **Cor do fundo** e **Para quem mostrar**.
4. Se usar **Profissional atual**, confira **Profissional**.
5. Clique em **Salvar nota**.

**Como saber se deu certo:** A nota aparece no dia e horário. **Mostrar notas** precisa estar marcado.

**Se o botão não aparecer:** Confira a permissão **Escrever recados na agenda**. No celular, procure **Mais**.

**Verificação:** Formulário conferido e série fictícia salva. Teste verifica exibição, cor e alternância de Mostrar notas.

**Fontes:** [Agenda](https://crm.organizastudios.com/agenda) · [AgendaNoteModal.tsx][fonte-6] · [agenda-notes.spec.ts][fonte-7]

<a id="tarefa-21"></a>

## Criar uma nota que se repete

- **Também perguntam:** Como repito um recado toda semana? Como faço uma nota recorrente?
- **Onde começar:** Menu lateral → [Agenda](https://crm.organizastudios.com/agenda).
- **Antes de começar:** Abra **Nova nota** e preencha a anotação.

1. Marque **Repetir nota**.
2. Preencha **Repetir até**.
3. Marque os dias em **Dias da semana**.
4. Clique em **Salvar nota**.

**Como saber se deu certo:** A nota se repete nos dias escolhidos. O limite informado é de 120 ocorrências, incluindo a primeira.

**Se o botão não aparecer:** Confira a data final e os dias marcados.

**Verificação:** Criada série fictícia para duas sextas-feiras. Teste confirma duas ocorrências ligadas à mesma série.

**Fontes:** [Agenda](https://crm.organizastudios.com/agenda) · [AgendaNoteModal.tsx][fonte-6] · [agenda-notes.spec.ts][fonte-7]

<a id="tarefa-22"></a>

## Editar uma nota de uma série

- **Também perguntam:** Como altero só um recado? Como mudo esta nota e as próximas?
- **Onde começar:** Menu lateral → [Agenda](https://crm.organizastudios.com/agenda).
- **Antes de começar:** Nota existente e permissão para recados.

1. Abra a nota.
2. Clique em **Editar**.
3. Altere os campos necessários.
4. Em **Aplicar a**, escolha **Só esta** ou **Esta e as próximas**.
5. Clique em **Salvar nota**.

**Como saber se deu certo:** As ocorrências do alcance escolhido são atualizadas.

**Se o botão não aparecer:** Em uma série, escolha o alcance antes de salvar. Para localizar a nota, marque Mostrar notas.

**Verificação:** Detalhes e seletor de alcance vistos. Edição não salva nesta auditoria; teste cobre Esta e as próximas.

**Fontes:** [Agenda](https://crm.organizastudios.com/agenda) · [AgendaNoteModal.tsx][fonte-6] · [agenda-notes.spec.ts][fonte-7]

<a id="tarefa-23"></a>

## Ver o histórico de remarcações

- **Também perguntam:** Onde vejo os horários anteriores? Quem remarcou a sessão?
- **Onde começar:** Menu lateral → [Agenda](https://crm.organizastudios.com/agenda).
- **Antes de começar:** Atendimento existente. O histórico continua disponível após falta ou finalização.

1. No cartão, abra o menu de três pontos.
2. Clique em **Histórico**.

**Como saber se deu certo:** Abre **Histórico de reagendamentos**, com horário anterior, novo horário, autor e recursos. Sem mudanças, aparece **Sem reagendamentos**.

**Se o botão não aparecer:** Em **Visão geral**, a opção se chama **Histórico de reagendamentos** no menu do atendimento.

**Verificação:** Uma remarcação fictícia foi salva e seu histórico foi lido. Teste confirma dados anteriores e novos.

**Fontes:** [Agenda](https://crm.organizastudios.com/agenda) · [AppointmentRescheduleHistoryModal.tsx][fonte-8] · [reschedule-history-modal.integration.test.tsx][fonte-9]

<a id="tarefa-24"></a>

## Finalizar os atendimentos pendentes em uma lista

- **Também perguntam:** Onde ficam os atendimentos a finalizar? Como concluo várias sessões?
- **Onde começar:** Menu lateral → [Agenda](https://crm.organizastudios.com/agenda).
- **Antes de começar:** Atendimentos já terminados, ainda agendados ou confirmados, e permissão para marcar presença.

1. Na **Visão geral**, clique em **Finalizar atendimentos**; o alerta **Atendimentos a finalizar** também abre a lista.
2. Se precisar, filtre por **Cliente**, **Profissional**, **Serviço**, **Situação**, **De** e **Até**.
3. Marque os atendimentos corretos.
4. Clique em **Marcar como realizados** ou **Marcar falta**.
5. Leia o efeito e confirme na janela.

**Como saber se deu certo:** Os registros tratados saem da lista. Na demonstração, apareceu **1 atendimento marcado como realizado.**

**Se o botão não aparecer:** O atalho da Visão geral aparece quando há pendências. Sem seleção, os botões ficam desabilitados.

**Verificação:** Finalização em lote executada apenas no atendimento fictício. Teste cobre filtros, realizados e faltas.

**Fontes:** [Agenda](https://crm.organizastudios.com/agenda) · [PendingFinalizationPage.tsx][fonte-10] · [pending-finalization.integration.test.tsx][fonte-11]

<a id="tarefa-25"></a>

## Consultar atendimentos concluídos

- **Também perguntam:** Como vejo sessões finalizadas automaticamente? Onde consulto os atendimentos realizados?
- **Onde começar:** Menu lateral → [Agenda](https://crm.organizastudios.com/agenda).
- **Antes de começar:** Acesso à Agenda. O atalho foi visto nesta sessão com a configuração de finalização automática carregada.

1. Na Agenda, clique em **Concluídos**.
2. Escolha **Hoje**, **7 dias**, **Este mês**, **Mês passado** ou **Personalizado**.
3. Se precisar, filtre por **Cliente**, **Profissional**, **Serviço** e **Origem**.
4. Abra o atendimento para conferir seus detalhes.

**Como saber se deu certo:** A lista separa **Finalização automática** e **Registrado pela equipe** e mostra o resumo do período.

**Se o botão não aparecer:** No celular, procure **Mais → Concluídos**. Confira as permissões e a configuração da clínica.

**Verificação:** Foram vistos um atendimento concluído automaticamente e outro finalizado pela equipe. Nenhuma correção de situação foi salva.

**Fontes:** [Agenda](https://crm.organizastudios.com/agenda) · [CompletedAppointmentsPage.tsx][fonte-12] · [auto-finalization.spec.ts][fonte-13]

<a id="tarefa-26"></a>

## Preparar um lembrete de sessão por WhatsApp

- **Também perguntam:** Existe lembrete de atendimento? O CRM envia a mensagem sozinho? Como lembro a sessão de amanhã?
- **Onde começar:** Menu lateral → [Comunicações](https://crm.organizastudios.com/comunicacoes).
- **Antes de começar:** Cliente com atendimento agendado ou confirmado, número de contato e permissão de campanhas.

1. Em **Mensagens padrão**, clique em **Nova mensagem**.
2. Preencha **Título (só a equipe vê)** e **Mensagem**.
3. Use **Inserir data do atendimento** e **Inserir hora do atendimento**.
4. Clique em **Salvar mensagem**.
5. Clique em **Usar em campanha**.
6. Escolha os clientes; em **Por filtros**, **Atendimentos e frequência** permite selecionar **Amanhã** ou outro período.
7. Clique em **Conferir quem recebe** e confira a data na prévia.
8. Dê um nome e clique em **Criar e começar a enviar**.

**Como saber se deu certo:** Abre o acompanhamento. **Abrir conversa no WhatsApp** prepara a conversa; o envio é feito no WhatsApp. Depois, a equipe usa **Marcar como enviada**.

**Se o botão não aparecer:** Mensagem com data/hora precisa de atendimento compatível. A conferência informa quem foi pulado e o motivo.

**Verificação:** Modelo, sessão futura e campanha fictícios criados. Prévia correta, um pendente e zero envios. Nenhum WhatsApp aberto.

**Fontes:** [Comunicações](https://crm.organizastudios.com/comunicacoes) · [CampaignSenderPage.tsx][fonte-14] · [campaigns.integration.test.tsx][fonte-15]

<a id="tarefa-27"></a>

## Editar o cadastro de um cliente

- **Também perguntam:** Como corrijo o telefone? Como mudo os dados da ficha?
- **Onde começar:** Menu lateral → [Clientes](https://crm.organizastudios.com/clientes).
- **Antes de começar:** Cliente cadastrado e permissão de edição.

1. Abra a ficha do cliente.
2. Clique em **Editar cadastro**.
3. Altere os campos necessários; **Mais informações** reúne os dados complementares.
4. Se quiser, preencha **Motivo da alteração (opcional)**.
5. Clique em **Salvar alterações**.

**Como saber se deu certo:** Os dados atualizados aparecem na ficha; o motivo informado fica no histórico.

**Se o botão não aparecer:** Na lista também há **Editar** ao lado do cliente. Confira seu acesso de edição.

**Verificação:** Edição e campos vistos; nenhum cliente antigo alterado. Teste confirma envio do motivo opcional.

**Fontes:** [Clientes](https://crm.organizastudios.com/clientes) · [PatientModal.tsx][fonte-16] · [patient-change-reason.integration.test.tsx][fonte-17]

<a id="tarefa-28"></a>

## Importar clientes de uma planilha

- **Também perguntam:** Como trago a lista de alunos do Excel? Como importo CSV de clientes?
- **Onde começar:** Menu lateral → [Clientes](https://crm.organizastudios.com/clientes).
- **Antes de começar:** Acesso de importação. Arquivo CSV ou XLSX de até 2 MB, com títulos na primeira linha.

1. Na lista de Clientes, abra **Mais → Importar**.
2. Se precisar, use **Baixar modelo CSV**.
3. Escolha a **Planilha de clientes**.
4. Indique o dado correspondente a cada coluna; nome e telefone são obrigatórios na importação.
5. Confira a prévia.
6. Clique em **Importar … clientes**, com a quantidade conferida.

**Como saber se deu certo:** A importação inclui os cadastros válidos. Dados faltantes ou inválidos podem gerar etiquetas de cadastro incompleto, conforme a prévia e o processamento.

**Se o botão não aparecer:** Sem arquivo, aparece **Importar 0 clientes** desabilitado. Confira tamanho, formato e mapeamento.

**Verificação:** Formulário e regras vistos. Nenhum arquivo importado nesta auditoria; componente e teste cobrem cadastro incompleto.

**Fontes:** [Clientes](https://crm.organizastudios.com/clientes) · [PatientImportModal.tsx][fonte-18] · [patient-import-incomplete.integration.test.tsx][fonte-19]

<a id="tarefa-29"></a>

## Exportar a lista de clientes

- **Também perguntam:** Como baixo os clientes em Excel? Como escolho as colunas da exportação?
- **Onde começar:** Menu lateral → [Clientes](https://crm.organizastudios.com/clientes).
- **Antes de começar:** Acesso de exportação. A exportação usa os filtros aplicados na lista.

1. Aplique os filtros desejados em Clientes.
2. Abra **Mais → Exportar**.
3. Escolha **CSV (.csv)** ou **Excel (.xlsx)**.
4. Marque as **Colunas** desejadas.
5. Clique em **Exportar**.

**Como saber se deu certo:** O navegador baixa a planilha com o recorte e as colunas escolhidos, conforme o componente.

**Se o botão não aparecer:** Confira a permissão de exportação e mantenha ao menos uma coluna selecionada.

**Verificação:** Formatos, aviso de filtros e colunas vistos. Download não executado. Teste consultado cobre as ações do cabeçalho.

**Fontes:** [Clientes](https://crm.organizastudios.com/clientes) · [PatientExportModal.tsx][fonte-20] · [patients-header-actions.integration.test.tsx][fonte-21]

<a id="tarefa-30"></a>

## Cadastrar um cliente e já agendar uma aula experimental

- **Também perguntam:** Como cadastro com aula teste? Como marco uma experimental junto da ficha?
- **Onde começar:** Menu lateral → [Clientes](https://crm.organizastudios.com/clientes).
- **Antes de começar:** Acesso a cadastro e agendamento. Serviço, profissional e sala disponíveis.

1. Clique em **Novo cliente** e preencha os dados obrigatórios.
2. Clique em **Agendar aula experimental**.
3. Confira **Serviço**, **Profissional** e **Sala**.
4. Preencha **Data e horário**; se necessário, **Observação**.
5. Clique em **Salvar e agendar aula experimental**.

**Como saber se deu certo:** O cadastro e a experimental são criados juntos.

**Se o botão não aparecer:** Com a aula adicionada, plano e serviço avulso ficam desabilitados. Use **Remover aula experimental** para trocar o tipo de contratação.

**Verificação:** Formulário visto; gravação conjunta confirmada no teste. O cadastro rápido da Agenda também foi exercitado com dados fictícios.

**Fontes:** [Clientes](https://crm.organizastudios.com/clientes) · [PatientModal.tsx][fonte-16] · [guided-client-registration.integration.test.tsx][fonte-22]

<a id="tarefa-31"></a>

## Cadastrar um cliente e contratar um plano na mesma tela

- **Também perguntam:** Como vendo um plano durante o cadastro? Como cadastro com mensalidade e turma?
- **Onde começar:** Menu lateral → [Clientes](https://crm.organizastudios.com/clientes).
- **Antes de começar:** Plano ativo no catálogo e acesso para cadastrar, contratar e, quando exigido, matricular.

1. Em **Novo cliente**, preencha o cadastro.
2. Clique em **Adicionar plano**.
3. Escolha **Plano cadastrado**.
4. Confira valores, datas, formas de pagamento e parcelas.
5. Escolha a **Turma** quando o plano exigir; confira seus horários.
6. Confira a sacola e clique em **Salvar e criar plano**.

**Como saber se deu certo:** O cliente é cadastrado com o plano e suas cobranças. Em turma cheia, o fluxo informa a espera antes de criar cobranças.

**Se o botão não aparecer:** O formulário informa os campos faltantes. Se não houver catálogo, cadastre-o em **Configurações → Planos**.

**Verificação:** Campos e catálogo vistos. Resultados da contratação com turma/espera conferidos nos testes; não se salvou novo cliente por este formulário.

**Fontes:** [Clientes](https://crm.organizastudios.com/clientes) · [PatientModal.tsx][fonte-16] · [guided-client-registration.integration.test.tsx][fonte-22]

<a id="tarefa-32"></a>

## Cadastrar um cliente e vender uma sessão avulsa

- **Também perguntam:** Como cadastro com um atendimento pago à parte? Onde escolho o serviço avulso?
- **Onde começar:** Menu lateral → [Clientes](https://crm.organizastudios.com/clientes).
- **Antes de começar:** Serviço cadastrado como **Plano avulso** no catálogo e acesso de contratação.

1. Em **Novo cliente**, preencha o cadastro.
2. Clique em **Adicionar serviço avulso**.
3. Escolha o item em **Plano cadastrado**.
4. Confira pagamento e datas.
5. Em **Horários da contratação**, informe profissional, sala, primeira data e dia/horário da sessão.
6. Clique em **Salvar e criar serviço avulso**.

**Como saber se deu certo:** A ficha, o plano de uma sessão, as cobranças e a reserva configurada são criados juntos.

**Se o botão não aparecer:** Se aparecer **Nenhum serviço avulso cadastrado**, cadastre o plano em **Configurações → Planos**.

**Verificação:** Catálogo fictício criado e formulário revalidado com ele. Venda avulsa conferida no teste, sem salvar este rascunho.

**Fontes:** [Clientes](https://crm.organizastudios.com/clientes) · [PatientModal.tsx][fonte-16] · [guided-client-registration.integration.test.tsx][fonte-22]

<a id="tarefa-33"></a>

## Cadastrar um cliente e adicionar um produto

- **Também perguntam:** Como vendo um produto junto do cadastro? Como cadastro e monto uma compra?
- **Onde começar:** Menu lateral → [Clientes](https://crm.organizastudios.com/clientes).
- **Antes de começar:** Produto ativo com preço e estoque. Acesso para cadastrar e vender produtos.

1. Em **Novo cliente**, preencha os dados obrigatórios.
2. Clique em **Adicionar produto**.
3. Escolha **Produto**, **Quantidade** e **Preço unitário**.
4. Em **Pagamento**, escolha **Pago agora** ou **A receber**.
5. Confira as formas de pagamento e a sacola.
6. Use o botão de salvar indicado para os itens da contratação.

**Como saber se deu certo:** O cadastro inclui a venda; o teste confirma a criação do cliente antes da venda do produto.

**Se o botão não aparecer:** Sem produto ativo, a tela orienta cadastrar em **Vendas de produtos → Estoque**.

**Verificação:** Formulário revalidado após criar produto fictício. Esta combinação não foi salva; teste cobre venda de produto junto do cadastro.

**Fontes:** [Clientes](https://crm.organizastudios.com/clientes) · [PatientModal.tsx][fonte-16] · [guided-client-registration.integration.test.tsx][fonte-22]

<a id="tarefa-34"></a>

## Criar e acompanhar uma tarefa de um lead

- **Também perguntam:** Como agendo um retorno comercial? Onde ficam as tarefas do interessado?
- **Onde começar:** Menu lateral → [CRM comercial](https://crm.organizastudios.com/comercial).
- **Antes de começar:** Lead existente e acesso para atividades comerciais.

1. No cartão, clique em **Atividades**.
2. Abra **Tarefas**.
3. Preencha **Tarefa** e **Vencimento**.
4. Se precisar, preencha **Observações**.
5. Clique em **Adicionar tarefa**.

**Como saber se deu certo:** A tarefa aparece na lista com vencimento e ações **Concluir** e **Cancelar**.

**Se o botão não aparecer:** Confira o acesso a atividades. O campo Tarefa vazio mantém o botão desabilitado.

**Verificação:** Tarefa fictícia criada e contagem atualizada no cartão. Conclusão/cancelamento não executados.

**Fontes:** [CRM comercial](https://crm.organizastudios.com/comercial) · [LeadActivityModal.tsx][fonte-23] · [extended-workflows.integration.test.tsx][fonte-24]

<a id="tarefa-35"></a>

## Registrar um contato com um lead

- **Também perguntam:** Como anoto uma ligação? Como registro que o interessado não atendeu?
- **Onde começar:** Menu lateral → [CRM comercial](https://crm.organizastudios.com/comercial).
- **Antes de começar:** Acesso de atividades. Este registro documenta um contato; não envia mensagem.

1. No cartão, abra **Atividades → Contatos**.
2. Escolha **Canal** e **Direção**.
3. Informe **Conseguiu falar?** e confira **Data e hora**.
4. Preencha **Registro do contato**.
5. Clique em **Registrar contato**.

**Como saber se deu certo:** O contato aparece no histórico com canal, resultado e autor.

**Se o botão não aparecer:** O registro do contato precisa estar preenchido. Confira a permissão de atividades.

**Verificação:** Formulário visto sem salvar. Teste cobre ligação não atendida sem tratá-la como mensagem enviada.

**Fontes:** [CRM comercial](https://crm.organizastudios.com/comercial) · [LeadActivityModal.tsx][fonte-23] · [lead-contact-channel.integration.test.tsx][fonte-25]

<a id="tarefa-36"></a>

## Mover um lead para outra etapa

- **Também perguntam:** Como mudo a fase do funil? Como vejo quem mudou a etapa?
- **Onde começar:** Menu lateral → [CRM comercial](https://crm.organizastudios.com/comercial).
- **Antes de começar:** Lead existente e acesso para movimentar o funil.

1. No cartão, abra o seletor **Etapa de …**.
2. Escolha a etapa desejada.
3. Para conferir a mudança, abra os detalhes do lead.
4. Clique em **Movimentações**.

**Como saber se deu certo:** O cartão muda de coluna e a movimentação mostra etapa anterior, nova etapa e autor.

**Se o botão não aparecer:** A etapa **Perdidos** abre um pedido de motivo. Mover cartões pelo seletor é o caminho confirmado.

**Verificação:** Lead fictício movido de Novos para Em contato; histórico conferido.

**Fontes:** [CRM comercial](https://crm.organizastudios.com/comercial) · [LeadDetailsModal.tsx][fonte-26] · [kanban-stage-moves.integration.test.tsx][fonte-27]

<a id="tarefa-37"></a>

## Marcar um lead como perdido

- **Também perguntam:** Como registro uma oportunidade perdida? Como anoto o motivo da perda?
- **Onde começar:** Menu lateral → [CRM comercial](https://crm.organizastudios.com/comercial).
- **Antes de começar:** Lead aberto e acesso para alterar sua etapa.

1. No seletor de etapa do cartão, escolha **Perdidos**.
2. Em **Marcar lead como perdido**, informe **Motivo da perda**.
3. Se houver motivos cadastrados, selecione o adequado; **Outro motivo** pede texto.
4. Clique em **Confirmar**.

**Como saber se deu certo:** O lead deixa as oportunidades abertas e fica em Perdidos com o motivo registrado.

**Se o botão não aparecer:** Sem motivo, Confirmar fica desabilitado. A forma do campo depende dos motivos cadastrados.

**Verificação:** Confirmação vista e abandonada em Voltar. Testes cobrem catálogo de motivos e texto livre.

**Fontes:** [CRM comercial](https://crm.organizastudios.com/comercial) · [LeadLostModal.tsx][fonte-28] · [lead-lost-reason.integration.test.tsx][fonte-29]

<a id="tarefa-38"></a>

## Importar leads para o funil

- **Também perguntam:** Como importo interessados de uma planilha? Como escolho a origem e a etapa da importação?
- **Onde começar:** Menu lateral → [CRM comercial](https://crm.organizastudios.com/comercial).
- **Antes de começar:** CSV ou XLSX até 2 MB e acesso para importar leads.

1. Clique em **Importar leads**.
2. Escolha **Planilha de leads**.
3. Mapeie as colunas e confira a prévia.
4. Confira **Origem** e **Etapa do funil**.
5. Clique em **Importar … leads**.

**Como saber se deu certo:** Os leads entram na etapa e origem escolhidas. Correspondências de telefone, e-mail ou CPF são sinalizadas como aviso.

**Se o botão não aparecer:** Campos da planilha não são obrigatórios; linhas vazias ou só com colunas ignoradas não entram.

**Verificação:** Formulário e texto de regras vistos. Nenhum arquivo enviado; teste cobre origem, etapa e aviso de cliente existente.

**Fontes:** [CRM comercial](https://crm.organizastudios.com/comercial) · [LeadImportModal.tsx][fonte-30] · [lead-import.integration.test.tsx][fonte-31]

<a id="tarefa-39"></a>

## Matricular um cliente em uma turma com vaga

- **Também perguntam:** Como inscrevo um aluno numa turma? Como faço matrícula com vaga livre?
- **Onde começar:** Menu lateral → [Turmas](https://crm.organizastudios.com/turmas).
- **Antes de começar:** Turma ativa com vaga, cliente cadastrado e permissão de matrícula.

1. Clique em **Matricular cliente**.
2. Escolha **Turma** e **Cliente**.
3. Confira **Início da matrícula**.
4. Clique em **Matricular**.

**Como saber se deu certo:** O cartão aumenta os matriculados e mostra a vaga restante. A matrícula direta não é a etapa de configurar plano e pagamento da fila.

**Se o botão não aparecer:** Se a turma estiver cheia, o botão muda para **Colocar na lista de espera**.

**Verificação:** Matrícula fictícia confirmada; o cartão passou a um matriculado e uma vaga livre.

**Fontes:** [Turmas](https://crm.organizastudios.com/turmas) · [GroupsPage.tsx][fonte-32] · [groups.spec.ts][fonte-33]

<a id="tarefa-40"></a>

## Cancelar uma matrícula da turma

- **Também perguntam:** Como libero a vaga de um aluno? Como tiro alguém da turma?
- **Onde começar:** Menu lateral → [Turmas](https://crm.organizastudios.com/turmas).
- **Antes de começar:** Matrícula existente e permissão de cancelamento.

1. No cartão, clique em **Abrir turma**.
2. Em **Dados da turma**, localize o participante.
3. Clique em **Cancelar matrícula de …**.
4. Leia a confirmação.
5. Clique em **Cancelar matrícula**.

**Como saber se deu certo:** A matrícula termina na data atual e libera a vaga. A fila não é matriculada automaticamente.

**Se o botão não aparecer:** Confira se o participante está matriculado e se seu acesso permite cancelar.

**Verificação:** Confirmação aberta para matrícula fictícia, sem confirmar. Teste cobre Voltar e confirmação.

**Fontes:** [Turmas](https://crm.organizastudios.com/turmas) · [GroupsPage.tsx][fonte-32] · [group-enrollment-cancel.integration.test.tsx][fonte-34]

<a id="tarefa-41"></a>

## Registrar a frequência de uma aula da turma

- **Também perguntam:** Como marco presença na turma? Como registro falta justificada?
- **Onde começar:** Menu lateral → [Turmas](https://crm.organizastudios.com/turmas).
- **Antes de começar:** Cliente matriculado na data da aula e acesso à frequência.

1. Abra a turma.
2. Clique em **Frequência e reposições**.
3. Abra a aula no calendário.
4. Em **Frequência de …**, escolha **Presente**, **Falta** ou **Falta justificada**.
5. Para todos ainda sem registro, use **Marcar todos presentes** e confira a confirmação.

**Como saber se deu certo:** A situação passa a aparecer junto do participante. Falta justificada é a origem informada para créditos de reposição.

**Se o botão não aparecer:** Marcar todos presentes libera 15 minutos antes da aula. Confira a permissão de frequência.

**Verificação:** Aula e opções vistas. Não se alterou frequência de participantes existentes; código confirma gravação individual. Teste cobre navegação das aulas.

**Fontes:** [Turmas](https://crm.organizastudios.com/turmas) · [GroupSessionModal.tsx][fonte-35] · [groups.spec.ts][fonte-33]

<a id="tarefa-42"></a>

## Concluir uma aula de turma

- **Também perguntam:** Como finalizo um encontro da turma? Como concluo a aula?
- **Onde começar:** Menu lateral → [Turmas](https://crm.organizastudios.com/turmas).
- **Antes de começar:** Encontro agendado e permissão para concluir aulas.

1. Abra **Frequência e reposições** da turma.
2. Abra a aula correta.
3. Confira os participantes e os registros de frequência.
4. Clique em **Concluir encontro**.

**Como saber se deu certo:** O componente atualiza os dados e mostra **Encontro concluído.**

**Se o botão não aparecer:** O botão exige encontro agendado e permissão de conclusão.

**Verificação:** Botão visto. Não foi concluída aula de turma nesta auditoria; chamada e aviso conferidos no componente. Teste citado cobre abertura da aula.

**Fontes:** [Turmas](https://crm.organizastudios.com/turmas) · [GroupSessionModal.tsx][fonte-35] · [groups.spec.ts][fonte-33]

<a id="tarefa-43"></a>

## Reservar uma aula de reposição

- **Também perguntam:** Como uso um crédito de reposição? Como escolho outra turma para repor?
- **Onde começar:** Menu lateral → [Turmas](https://crm.organizastudios.com/turmas).
- **Antes de começar:** Crédito disponível da turma de origem e permissão de reposição. Destino futuro com vaga.

1. Abra a turma de origem.
2. Clique em **Frequência e reposições**.
3. Selecione **Crédito de reposição**.
4. Escolha **Encontro de reposição**.
5. Clique em **Reservar reposição**.

**Como saber se deu certo:** O crédito deixa os disponíveis e o cliente aparece como **Reposição** no encontro de destino.

**Se o botão não aparecer:** Sem crédito, aparece **Nenhum crédito de reposição disponível**. O destino deve ser futuro, ter vaga e ser diferente da aula de origem.

**Verificação:** Estado sem crédito visto. Seleção e reserva completas conferidas no teste; não foi criada falta justificada artificial para gerar crédito.

**Fontes:** [Turmas](https://crm.organizastudios.com/turmas) · [GroupOperationsPanel.tsx][fonte-36] · [replacement-booking.integration.test.tsx][fonte-37]

<a id="tarefa-44"></a>

## Colocar um cliente na espera por produto

- **Também perguntam:** Como aviso que alguém quer um produto? Como faço fila de reposição do estoque?
- **Onde começar:** Menu lateral → [Lista de espera](https://crm.organizastudios.com/lista-de-espera).
- **Antes de começar:** Cliente e produto ativo cadastrados; acesso para gerenciar a lista.

1. Clique em **Adicionar à lista**.
2. Selecione **Cliente**.
3. Escolha **Reposição de produto**.
4. Selecione **Produto**.
5. Se quiser, preencha **Observações**.
6. Clique em **Adicionar à lista** na janela.

**Como saber se deu certo:** A pessoa aparece na fila do produto com posição e situação Aguardando.

**Se o botão não aparecer:** Confira Cliente e Produto. Esta fila não é a espera por uma vaga em turma.

**Verificação:** Entrada fictícia de produto criada e conferida em primeiro lugar.

**Fontes:** [Lista de espera](https://crm.organizastudios.com/lista-de-espera) · [WaitlistEntryModal.tsx][fonte-38] · [waitlist-page.integration.test.tsx][fonte-39]

<a id="tarefa-45"></a>

## Consultar e filtrar a lista de espera

- **Também perguntam:** Como vejo quem está esperando por um serviço? Onde vejo a posição da fila?
- **Onde começar:** Menu lateral → [Lista de espera](https://crm.organizastudios.com/lista-de-espera).
- **Antes de começar:** Acesso à Lista de espera.

1. Em **Maior procura**, clique em **Ver fila** do item desejado.
2. Use **Cliente**, **Item** e **Situação** para refinar a lista.
3. Clique em **Limpar filtros** para voltar ao recorte inicial.

**Como saber se deu certo:** A tabela mostra somente as entradas do recorte, com posição e situação.

**Se o botão não aparecer:** Na fila mostra Aguardando e Avisado. Para quem já foi atendido, selecione **Atendido** ou **Todas**.

**Verificação:** Filtros exercitados; a entrada fictícia atendida foi localizada e fotografada.

**Fontes:** [Lista de espera](https://crm.organizastudios.com/lista-de-espera) · [WaitlistPage.tsx][fonte-40] · [waitlist-page.integration.test.tsx][fonte-39]

<a id="tarefa-46"></a>

## Avisar que surgiu vaga ou chegou um produto

- **Também perguntam:** Como ofereço uma vaga? Como preparo o aviso de reposição pelo WhatsApp?
- **Onde começar:** Menu lateral → [Lista de espera](https://crm.organizastudios.com/lista-de-espera).
- **Antes de começar:** Entrada ainda na fila, telefone informado e acesso à entrada.

1. Clique em **Abrir entrada de …**; na tabela o botão aparece como **Atualizar**.
2. Confira o serviço ou produto e a posição.
3. Para serviço, confira os dias e horários da turma com vaga.
4. Clique em **Avisar por WhatsApp** para abrir a mensagem pronta.
5. Envie pelo WhatsApp somente depois de conferir a conversa.

**Como saber se deu certo:** O atalho prepara uma conversa. A abertura sozinha não matricula o cliente nem equivale a mensagem entregue.

**Se o botão não aparecer:** O aviso precisa de telefone e entrada ainda na fila. A matrícula é outra ação.

**Verificação:** Link e texto preparados vistos; nenhum WhatsApp aberto ou mensagem enviada. O componente usa um link de conversa.

**Fontes:** [Lista de espera](https://crm.organizastudios.com/lista-de-espera) · [WaitlistManageModal.tsx][fonte-41] · [waitlist-page.integration.test.tsx][fonte-39]

<a id="tarefa-47"></a>

## Matricular um cliente a partir da fila

- **Também perguntam:** Como transformo a espera em matrícula? Como ofereço a turma e configuro o pagamento?
- **Onde começar:** Menu lateral → [Lista de espera](https://crm.organizastudios.com/lista-de-espera).
- **Antes de começar:** Entrada de serviço ainda na fila, turma com vaga, catálogo adequado e permissões para contratar e matricular.

1. Abra a entrada do cliente.
2. Em **Turma com vaga**, escolha o destino e confira os horários.
3. Clique em **Matricular e configurar pagamento**.
4. Selecione **Plano cadastrado**.
5. Confira turma, valores, datas, formas e documento opcional.
6. Clique em **Criar plano e parcelas**.

**Como saber se deu certo:** A matrícula é confirmada e a entrada muda para **Atendido**.

**Se o botão não aparecer:** Fila de produto não oferece matrícula. Confira vaga e permissões de plano e matrícula.

**Verificação:** Fluxo completo executado para um cliente fictício; plano/cobrança criados e entrada marcada Atendido.

**Fontes:** [Lista de espera](https://crm.organizastudios.com/lista-de-espera) · [WaitlistManageModal.tsx][fonte-41] · [waitlist-enroll.integration.test.tsx][fonte-42]

<a id="tarefa-48"></a>

## Atualizar a situação de uma pessoa na fila

- **Também perguntam:** Como marco que já avisei? Como registro que desistiu da espera?
- **Onde começar:** Menu lateral → [Lista de espera](https://crm.organizastudios.com/lista-de-espera).
- **Antes de começar:** Acesso para gerenciar a lista.

1. Abra a entrada.
2. Em **Situação**, escolha **Aguardando**, **Avisado**, **Atendido** ou **Desistiu**.
3. Se necessário, atualize **Observações**.
4. Clique em **Salvar**.

**Como saber se deu certo:** A entrada muda de situação e pode sair do filtro Na fila. O histórico é preservado.

**Se o botão não aparecer:** Salvar fica desabilitado quando nada mudou. Confira a permissão de gerenciamento.

**Verificação:** Opções vistas; mudança manual não salva. Teste confirma saída da fila e atualização da posição seguinte.

**Fontes:** [Lista de espera](https://crm.organizastudios.com/lista-de-espera) · [WaitlistManageModal.tsx][fonte-41] · [waitlist-page.integration.test.tsx][fonte-39]

<a id="tarefa-49"></a>

## Remover uma entrada da lista de espera

- **Também perguntam:** Como apago uma entrada da fila? Como retiro um registro lançado por engano?
- **Onde começar:** Menu lateral → [Lista de espera](https://crm.organizastudios.com/lista-de-espera).
- **Antes de começar:** Permissão para gerenciar a lista. A confirmação informa que a entrada é apagada.

1. Abra a entrada.
2. Clique em **Remover da lista**.
3. Leia o aviso.
4. Se a intenção for apagar, confirme em **Remover da lista**.

**Como saber se deu certo:** A entrada é apagada. Para manter o histórico, use Atendido ou Desistiu na situação.

**Se o botão não aparecer:** Confira o acesso de gerenciamento. **Voltar** abandona a remoção.

**Verificação:** Confirmação vista sem executar exclusão. O efeito consta no componente; teste da página cobre gestão e filtros, sem validar esta exclusão.

**Fontes:** [Lista de espera](https://crm.organizastudios.com/lista-de-espera) · [WaitlistManageModal.tsx][fonte-41] · [waitlist-page.integration.test.tsx][fonte-39]

<a id="tarefa-50"></a>

## Consultar o saldo e o extrato de sessões

- **Também perguntam:** Como vejo sessões restantes? Onde vejo os movimentos do pacote?
- **Onde começar:** Menu lateral → [Planos e sessões](https://crm.organizastudios.com/planos).
- **Antes de começar:** Plano do cliente acessível.

1. Localize o plano em **Planos dos clientes**.
2. Confira o saldo por serviço no cartão.
3. Clique em **Extrato**.

**Como saber se deu certo:** O extrato mostra saldo e movimentos, como **Crédito inicial do plano**.

**Se o botão não aparecer:** Use **Buscar plano por cliente** e confira o filtro de situação.

**Verificação:** Saldo de quatro sessões e crédito inicial vistos no plano fictício.

**Fontes:** [Planos e sessões](https://crm.organizastudios.com/planos) · [SessionMovementsModal.tsx][fonte-43] · [plan-cancel-refund.integration.test.tsx][fonte-44]

<a id="tarefa-51"></a>

## Renovar o plano de um cliente

- **Também perguntam:** Como faço uma nova vigência? Como renovo o pacote?
- **Onde começar:** Menu lateral → [Planos e sessões](https://crm.organizastudios.com/planos).
- **Antes de começar:** Plano não cancelado, ainda não renovado, e acesso para renovar.

1. No cartão, clique em **Renovar**.
2. Confira nome, sessões, valor, **Início** e **Fim da validade**.
3. Confira formas de pagamento, parcelas e primeiro vencimento.
4. Clique em **Renovar plano e gerar parcelas**.

**Como saber se deu certo:** O novo período recebe saldo e parcelas próprios. O saldo restante do plano anterior não é transferido.

**Se o botão não aparecer:** Planos cancelados, já renovados ou originados de comanda podem não oferecer Renovar.

**Verificação:** Formulário visto sem salvar. Condições e novo período conferidos no código; teste de planos cobre contratação e financeiro.

**Fontes:** [Planos e sessões](https://crm.organizastudios.com/planos) · [PlansPage.tsx][fonte-45] · [plans-finance.spec.ts][fonte-46]

<a id="tarefa-52"></a>

## Pausar um plano e depois ativá-lo

- **Também perguntam:** Como suspendo temporariamente o pacote? Como volto um plano pausado?
- **Onde começar:** Menu lateral → [Planos e sessões](https://crm.organizastudios.com/planos).
- **Antes de começar:** Plano ativo e permissão para alterar sua situação.

1. No cartão, clique em **Pausar**.
2. Se quiser, preencha **Motivo (opcional)** e **Previsão de retorno (opcional)**.
3. Leia o efeito na validade.
4. Clique em **Pausar plano**.
5. Para voltar depois, use **Ativar** no cartão.

**Como saber se deu certo:** Enquanto pausado, o plano não é usado nos atendimentos. Na reativação, uma validade com fim avança pelos dias pausados; plano contínuo não muda datas.

**Se o botão não aparecer:** Plano cancelado não oferece reativação. Confira seu acesso para alterar a situação.

**Verificação:** Pausa vista sem salvar. Teste confirma motivo e situação pausada; Ativar e extensão de validade conferidos no código.

**Fontes:** [Planos e sessões](https://crm.organizastudios.com/planos) · [PlanPauseModal.tsx][fonte-47] · [plan-pause.integration.test.tsx][fonte-48]

<a id="tarefa-53"></a>

## Cancelar um plano e registrar uma devolução

- **Também perguntam:** Como encerro um pacote? Como registro valor devolvido ao cliente?
- **Onde começar:** Menu lateral → [Planos e sessões](https://crm.organizastudios.com/planos).
- **Antes de começar:** Permissão de cancelamento. Plano cancelado não pode ser reativado.

1. No cartão, clique em **Cancelar**.
2. Leia o efeito sobre sessões e parcelas abertas.
3. Se já houve devolução, marque **Houve estorno de valor ao cliente**.
4. Informe valor, forma de pagamento e observação do estorno, quando aplicável.
5. Clique em **Confirmar**.

**Como saber se deu certo:** As parcelas abertas são canceladas e as sessões ficam indisponíveis. A devolução informada gera saída financeira em Estornos a clientes.

**Se o botão não aparecer:** Sem valor de devolução, a confirmação fica bloqueada quando essa opção está marcada. O teste rejeita valor acima do plano.

**Verificação:** Confirmação e campos vistos; nenhum plano cancelado nem devolução registrada nesta auditoria. Resultado confirmado no teste.

**Fontes:** [Planos e sessões](https://crm.organizastudios.com/planos) · [PlanCancelModal.tsx][fonte-49] · [plan-cancel-refund.integration.test.tsx][fonte-44]

<a id="tarefa-54"></a>

## Dividir a contratação de um plano entre formas de pagamento

- **Também perguntam:** Como combino Pix e cartão no plano? Como separo entrada e cobranças recorrentes?
- **Onde começar:** Menu lateral → [Planos e sessões](https://crm.organizastudios.com/planos).
- **Antes de começar:** Contratação aberta, catálogo escolhido e valores combinados.

1. Em **Formas de pagamento**, clique em **Adicionar forma de pagamento**.
2. Escolha a forma e o **Valor (R$)** de cada parte.
3. Confira as cobranças e, quando solicitado, marque **Só na primeira vez** ou **Recorrente (segue nas renovações)**.
4. Confira **Soma das formas** e **Ver parcelas**.
5. Conclua a contratação depois de revisar a turma e as datas.

**Como saber se deu certo:** Cada forma gera suas cobranças. A soma precisa fechar o valor do plano.

**Se o botão não aparecer:** Confira as partes sem valor e a classificação de cobrança de cada forma.

**Verificação:** Plano fictício criado com Pix50 e Cartão50 e duas parcelas. Testes específicos de recorrência são a fonte para renovações; nenhuma renovação foi executada.

**Fontes:** [Planos e sessões](https://crm.organizastudios.com/planos) · [PlanModal.tsx][fonte-50] · [plan-payment-recurrence.integration.test.tsx][fonte-51]

<a id="tarefa-55"></a>

## Ajustar o valor de uma parcela em aberto

- **Também perguntam:** Como corrijo o valor de uma parcela? Onde justifico um ajuste?
- **Onde começar:** Menu lateral → [Financeiro](https://crm.organizastudios.com/financeiro).
- **Antes de começar:** Parcela em aberto e acesso para ajustar recebimentos.

1. Em **Contas a receber**, abra **Mais ações** da parcela.
2. Clique em **Ajustar**.
3. Preencha **Novo valor (R$)**.
4. Preencha **Justificativa** com pelo menos cinco caracteres.
5. Clique em **Confirmar**.

**Como saber se deu certo:** O novo valor substitui o atual e a justificativa fica registrada no histórico.

**Se o botão não aparecer:** O ajuste é oferecido nas situações permitidas pela parcela. Confira a justificativa e a permissão.

**Verificação:** Formulário visto sem salvar. Validação e chamada de ajuste conferidas no componente; teste e2e verifica ações da linha.

**Fontes:** [Financeiro](https://crm.organizastudios.com/financeiro) · [ReceivableAdjustModal.tsx][fonte-52] · [receivables-actions.spec.ts][fonte-53]

<a id="tarefa-56"></a>

## Registrar um recebimento parcial

- **Também perguntam:** Como dou baixa só em parte? Como deixo o restante para outra data?
- **Onde começar:** Menu lateral → [Financeiro](https://crm.organizastudios.com/financeiro).
- **Antes de começar:** Parcela aberta e permissão para receber. Informe somente o valor que já recebeu.

1. Clique em **Dar baixa** da parcela.
2. Confira **Forma de pagamento recebida**.
3. Em **Valor recebido**, informe a parte recebida.
4. Confira o saldo e preencha **Vencimento do saldo**.
5. Revise descontos, juros e datas.
6. Clique em **Confirmar baixa**.

**Como saber se deu certo:** A parte recebida fica paga e o saldo vira uma nova parcela.

**Se o botão não aparecer:** Com mais de uma forma, o valor recebido vem da soma das partes. Confira o vencimento do saldo.

**Verificação:** Prévia de parcial20 sobre50 vista; nenhuma parcial gravada. Teste confirma parcela paga e saldo aberto.

**Fontes:** [Financeiro](https://crm.organizastudios.com/financeiro) · [SettleModal.tsx][fonte-54] · [split-settlement.integration.test.tsx][fonte-55]

<a id="tarefa-57"></a>

## Registrar um recebimento dividido entre formas

- **Também perguntam:** Como recebo parte no Pix e parte no cartão? Como dou baixa com dois meios?
- **Onde começar:** Menu lateral → [Financeiro](https://crm.organizastudios.com/financeiro).
- **Antes de começar:** Parcela aberta e acesso para registrar recebimento.

1. Abra **Dar baixa**.
2. Clique em **Adicionar forma de pagamento**.
3. Escolha as formas recebidas.
4. Preencha **Valor da forma 1**, **Valor da forma 2** e as demais partes, se houver.
5. Confira a soma e eventual saldo.
6. Clique em **Confirmar baixa**.

**Como saber se deu certo:** A parcela registra cada forma e valor. Se a soma for menor, o saldo segue como nova parcela.

**Se o botão não aparecer:** Preencha o valor de todas as formas e confira o saldo antes de confirmar.

**Verificação:** Baixa fictícia integral de50 registrada como Pix25 + Cartão25. Teste também cobre divisão com saldo restante.

**Fontes:** [Financeiro](https://crm.organizastudios.com/financeiro) · [SettleModal.tsx][fonte-54] · [split-settlement.integration.test.tsx][fonte-55]

<a id="tarefa-58"></a>

## Anexar comprovantes de pagamento

- **Também perguntam:** Como guardo um comprovante? Posso adicionar mais de um arquivo?
- **Onde começar:** Menu lateral → [Financeiro](https://crm.organizastudios.com/financeiro).
- **Antes de começar:** Permissão para comprovantes. Aceita PDF, PNG ou JPEG de até 5 MB por arquivo.

1. Na baixa, use **Adicionar comprovantes (opcional)**; para parcela paga, abra **Mais ações → Comprovantes**.
2. Escolha os arquivos.
3. Confira os anexos e conclua o formulário correspondente.

**Como saber se deu certo:** Os arquivos anexados aparecem em **Comprovantes** da parcela.

**Se o botão não aparecer:** Em parcela ainda sem baixa, os anexos são associados ao confirmar o pagamento. Confira a permissão e os limites.

**Verificação:** Campos e estado sem comprovantes vistos. Nenhum arquivo enviado; teste cobre anexos de pagamento.

**Fontes:** [Financeiro](https://crm.organizastudios.com/financeiro) · [SettleModal.tsx][fonte-54] · [payment-proofs.integration.test.tsx][fonte-56]

<a id="tarefa-59"></a>

## Consultar, imprimir e acompanhar um recibo

- **Também perguntam:** Onde encontro o recibo da parcela? Como vejo se foi assinado?
- **Onde começar:** Menu lateral → [Financeiro](https://crm.organizastudios.com/financeiro).
- **Antes de começar:** Parcela paga e acesso ao recibo.

1. Em **Contas a receber**, clique em **Recibo** da parcela paga.
2. Confira valor, formas de pagamento e data.
3. Veja **Assinatura do recibo**, com envio, visualização e assinatura.
4. Use **Imprimir recibo** para imprimir.
5. O atalho **Enviar recibo pelo WhatsApp** prepara o envio do link ao cliente.

**Como saber se deu certo:** O recibo mostra sua identificação e os estados separados. O clique de envio é registrado conforme o teste; ele não comprova entrega no WhatsApp.

**Se o botão não aparecer:** Recibo fica disponível na parcela paga. Sem número do cliente, o envio com assinatura pode ficar desabilitado.

**Verificação:** Recibo da baixa fictícia aberto, sem envio ou assinatura. Continuou **Recibo não enviado**.

**Fontes:** [Financeiro](https://crm.organizastudios.com/financeiro) · [ReceiptModal.tsx][fonte-57] · [receipt-signature-send.integration.test.tsx][fonte-58]

<a id="tarefa-60"></a>

## Cadastrar uma despesa pontual

- **Também perguntam:** Como lanço uma conta a pagar uma vez? Como cadastro uma despesa da clínica?
- **Onde começar:** Menu lateral → [Financeiro](https://crm.organizastudios.com/financeiro).
- **Antes de começar:** Permissão de despesas e categoria cadastrada.

1. Clique em **Nova despesa**.
2. Mantenha **Pontual (uma vez)**.
3. Preencha **Descrição**, **Fornecedor** quando houver e **Categoria**.
4. Informe **Valor** e a data.
5. Escolha se a data é de **Vencimento** ou **Lançamento**.
6. Clique em **Cadastrar despesa**.

**Como saber se deu certo:** A conta passa a aparecer em **Contas a pagar**, conforme a gravação do formulário.

**Se o botão não aparecer:** Centro de custo é opcional. Sem descrição, categoria ou valor, o botão informa o que falta.

**Verificação:** Formulário visto sem salvar. Testes cobrem fornecedor, categoria e datas de despesas.

**Fontes:** [Financeiro](https://crm.organizastudios.com/financeiro) · [PayableModal.tsx][fonte-59] · [payable-modal.integration.test.tsx][fonte-60]

<a id="tarefa-61"></a>

## Cadastrar uma despesa que se repete todo mês

- **Também perguntam:** Como cadastro aluguel recorrente? Como registro água e luz com valor variável?
- **Onde começar:** Menu lateral → [Financeiro](https://crm.organizastudios.com/financeiro).
- **Antes de começar:** Acesso para despesas fixas e categoria cadastrada.

1. Abra **Nova despesa → Fixa (todo mês)**.
2. Preencha descrição, fornecedor e categoria.
3. Escolha **Tipo de valor**: **Valor fixo** ou **Valor variável**.
4. Confira valor mensal, quando aplicável.
5. Preencha **Mês inicial**, mês final opcional e **Dia do vencimento**.
6. Confira os avisos e clique em **Cadastrar despesa fixa**.

**Como saber se deu certo:** A regra gera as contas mensais. Valores não definidos precisam ser informados no mês correspondente.

**Se o botão não aparecer:** Confira descrição e categoria. O valor mensal pode ficar vazio para informar depois.

**Verificação:** Formulário visto sem criar recorrência. Testes cobrem troca do tipo e regra sem valor.

**Fontes:** [Financeiro](https://crm.organizastudios.com/financeiro) · [RecurringPayableModal.tsx][fonte-61] · [new-expense-modal.integration.test.tsx][fonte-62]

<a id="tarefa-62"></a>

## Cadastrar um fornecedor

- **Também perguntam:** Como adiciono uma empresa fornecedora? Onde cadastro fornecedor de despesas?
- **Onde começar:** Menu lateral → [Vendas de produtos](https://crm.organizastudios.com/vendas).
- **Antes de começar:** Permissão para gerenciar fornecedores.

1. Em **Vendas de produtos**, abra **Fornecedores**.
2. Clique em **Novo fornecedor**.
3. Em **Dados**, preencha **Nome**, tipo, documento e contatos necessários.
4. Se necessário, confira **Pedidos** e **Documentos**.
5. Clique em **Salvar fornecedor**.

**Como saber se deu certo:** O fornecedor fica disponível para as despesas; pedidos e documentos pertencem ao cadastro.

**Se o botão não aparecer:** O WhatsApp indicado pode receber documentos. Confira os dados antes de usar os atalhos de envio.

**Verificação:** Formulário e abas vistos sem salvar. Teste cobre os fluxos do fornecedor.

**Fontes:** [Vendas de produtos](https://crm.organizastudios.com/vendas) · [SupplierModal.tsx][fonte-63] · [supplier-modal-flows.integration.test.tsx][fonte-64]

<a id="tarefa-63"></a>

## Consultar comissões e cadastrar uma regra

- **Também perguntam:** Como defino o percentual do profissional? Onde são pagas as comissões?
- **Onde começar:** Menu lateral → [Financeiro](https://crm.organizastudios.com/financeiro).
- **Antes de começar:** Acesso às comissões e à criação de regras.

1. Abra **Comissões**.
2. Clique em **Nova regra**.
3. Escolha **Origem da regra** e **Profissional**, quando aplicável.
4. Informe **Percentual (%)**, **Vale a partir de** e fim opcional.
5. Clique em **Salvar**.
6. Depois de conferir os atendimentos concluídos, use **Gerar comissões do mês**.

**Como saber se deu certo:** As comissões são geradas para consulta. O pagamento é feito pela aba **Folha**; a regra do usuário prevalece sobre a do profissional.

**Se o botão não aparecer:** Sem regra e atendimentos elegíveis, a lista pode ficar vazia. Confira suas permissões.

**Verificação:** Lista vazia e formulário vistos. Nenhuma regra criada ou comissão gerada. Cálculo e precedência constam no código; teste citado cobre reconciliação financeira.

**Fontes:** [Financeiro](https://crm.organizastudios.com/financeiro) · [FinancePage.tsx][fonte-65] · [workspace-flows.integration.test.tsx][fonte-66]

<a id="tarefa-64"></a>

## Cadastrar um produto com preço e estoque inicial

- **Também perguntam:** Como coloco um produto à venda? Como cadastro o estoque inicial?
- **Onde começar:** Menu lateral → [Vendas de produtos](https://crm.organizastudios.com/vendas).
- **Antes de começar:** Permissão para gerenciar estoque.

1. Abra **Estoque → Novo produto**.
2. Preencha **Nome** e **Unidade**.
3. Informe **Custo (R$)** e **Preço de venda (R$)**.
4. Informe **Estoque inicial**.
5. Confira classificação, tamanhos e aviso de reposição, quando usados.
6. Clique em **Salvar produto**.

**Como saber se deu certo:** O produto aparece na lista. Sem preço de venda, não pode ser vendido.

**Se o botão não aparecer:** Confira a permissão de estoque. Categoria pode definir distinção por tamanho.

**Verificação:** Produto fictício criado com10 unidades e preço10; aviso Produto cadastrado.

**Fontes:** [Vendas de produtos](https://crm.organizastudios.com/vendas) · [ProductModal.tsx][fonte-67] · [inventory-tab.integration.test.tsx][fonte-68]

<a id="tarefa-65"></a>

## Registrar uma venda de produto com desconto

- **Também perguntam:** Como vendo um produto? Como aplico desconto por item?
- **Onde começar:** Menu lateral → [Vendas de produtos](https://crm.organizastudios.com/vendas).
- **Antes de começar:** Cliente, produto ativo com preço e estoque; permissões de venda.

1. Abra **Nova venda**.
2. Escolha **Cliente**, **Produto**, **Quantidade** e **Preço unitário**.
3. Se necessário, clique em **Configurar desconto do produto** ou **Configurar desconto geral**.
4. Escolha porcentagem ou valor e aplique o desconto.
5. Em **Pagamento**, escolha **Pago agora** ou **A receber** e confira formas e vencimento.
6. Confira o total e clique em **Registrar venda**.

**Como saber se deu certo:** A venda entra no histórico e reduz o estoque. A receber gera cobrança para baixa posterior.

**Se o botão não aparecer:** Confira os campos faltantes e o saldo de estoque. As formas podem ser divididas pelo botão de adicionar.

**Verificação:** Venda fictícia de1 unidade com10% de desconto criada por9 a receber. Estoque passou de10 para9.

**Fontes:** [Vendas de produtos](https://crm.organizastudios.com/vendas) · [NewSaleSection.tsx][fonte-69] · [sales-page.integration.test.tsx][fonte-70]

<a id="tarefa-66"></a>

## Consultar o histórico e os detalhes de vendas

- **Também perguntam:** Como vejo vendas antigas? Como filtro as vendas por cliente ou produto?
- **Onde começar:** Menu lateral → [Vendas de produtos](https://crm.organizastudios.com/vendas).
- **Antes de começar:** Acesso ao histórico de vendas.

1. Abra **Vendas realizadas**.
2. Use o período e os filtros de **Cliente**, **Vendedor**, **Produto**, **Situação** e valores.
3. Clique em **Ver venda de …**.

**Como saber se deu certo:** Os detalhes mostram produtos, total, desconto, vendedor e situação do pagamento.

**Se o botão não aparecer:** Confira o período e os filtros. O histórico também apresenta vendas a receber.

**Verificação:** Venda fictícia localizada e aberta. Teste cobre o histórico em tabela e cartões.

**Fontes:** [Vendas de produtos](https://crm.organizastudios.com/vendas) · [SalesHistorySection.tsx][fonte-71] · [sales-history-cards.spec.ts][fonte-72]

<a id="tarefa-67"></a>

## Ajustar o estoque de um produto

- **Também perguntam:** Como lanço entrada de estoque? Como registro perda ou acerto de quantidade?
- **Onde começar:** Menu lateral → [Vendas de produtos](https://crm.organizastudios.com/vendas).
- **Antes de começar:** Acesso para gerenciar estoque.

1. Abra **Estoque → Ajustar estoque**.
2. Escolha **Produto** e **Tipo**.
3. Informe **Quantidade** e **Motivo**.
4. Clique em **Salvar ajuste**.

**Como saber se deu certo:** O saldo é atualizado e a movimentação aparece em **Histórico de estoque**.

**Se o botão não aparecer:** Confira Produto e Motivo. Tipos vistos: Compra/entrada, Ajuste de entrada, Ajuste de saída e Perda.

**Verificação:** Formulário e tipos vistos sem salvar ajuste. Teste cobre cadastro, ajuste e edição de estoque.

**Fontes:** [Vendas de produtos](https://crm.organizastudios.com/vendas) · [InventorySection.tsx][fonte-73] · [inventory-tab.integration.test.tsx][fonte-68]

<a id="tarefa-68"></a>

## Cancelar uma venda de produto ainda a receber

- **Também perguntam:** Como desfaço uma venda? Como devolvo o item ao estoque?
- **Onde começar:** Menu lateral → [Vendas de produtos](https://crm.organizastudios.com/vendas).
- **Antes de começar:** Venda a receber e permissão de cancelamento.

1. Em **Vendas realizadas**, abra a venda correta.
2. Clique em **Cancelar venda**.
3. Preencha **Motivo do cancelamento**.
4. Leia o aviso de devolução ao estoque.
5. Confirme em **Cancelar venda**.

**Como saber se deu certo:** A venda é cancelada e os produtos retornam ao estoque, conforme o componente e os testes.

**Se o botão não aparecer:** Sem motivo, a confirmação fica desabilitada. Venda já paga exige também permissão de estorno e tem confirmação diferente.

**Verificação:** Confirmação vista apenas na venda fictícia, sem cancelar.

**Fontes:** [Vendas de produtos](https://crm.organizastudios.com/vendas) · [SaleDetailsModal.tsx][fonte-74] · [sales-page.integration.test.tsx][fonte-70]

<a id="tarefa-69"></a>

## Estornar e cancelar uma venda de produto paga

- **Também perguntam:** Como desfaço uma venda paga? Como estorno a venda e retorno o estoque?
- **Onde começar:** Menu lateral → [Vendas de produtos](https://crm.organizastudios.com/vendas).
- **Antes de começar:** Venda paga, acesso para cancelar e permissão de estorno.

1. Abra a venda em **Vendas realizadas**.
2. Clique em **Cancelar venda**.
3. Preencha **Motivo do cancelamento**.
4. Confira a opção de estornar o pagamento ao cliente.
5. Confirme em **Estornar e cancelar**.

**Como saber se deu certo:** O CRM registra a venda e o pagamento como cancelados/estornados e restitui o estoque.

**Se o botão não aparecer:** Sem permissão de estorno, a confirmação é bloqueada e explica que o pagamento precisa ser tratado por quem tem acesso.

**Verificação:** Variação paga não aberta na tela publicada. Botões, confirmação e resultado conferidos no componente e nas asserções do teste.

**Fontes:** [Vendas de produtos](https://crm.organizastudios.com/vendas) · [SaleDetailsModal.tsx][fonte-74] · [sales-page.integration.test.tsx][fonte-70]

<a id="tarefa-70"></a>

## Criar uma mensagem padrão com prévia

- **Também perguntam:** Como salvo um texto para usar depois? Como personalizo a mensagem com o nome?
- **Onde começar:** Menu lateral → [Comunicações](https://crm.organizastudios.com/comunicacoes).
- **Antes de começar:** Permissão de mensagens padrão.

1. Abra **Mensagens padrão → Nova mensagem**.
2. Preencha **Título (só a equipe vê)**.
3. Escreva **Mensagem**; use os botões **Inserir nome** e outros campos necessários.
4. Confira **Prévia no WhatsApp**.
5. Se quiser, adicione até três imagens.
6. Clique em **Salvar mensagem**.

**Como saber se deu certo:** A mensagem aparece no acervo e oferece **Usar em campanha**.

**Se o botão não aparecer:** Texto limitado a1000 caracteres. Imagens PNG, JPEG ou WebP até2MB cada; códigos não reconhecidos precisam ser corrigidos.

**Verificação:** Modelo fictício salvo e prévia conferida; nenhuma imagem anexada.

**Fontes:** [Comunicações](https://crm.organizastudios.com/comunicacoes) · [TemplateEditorModal.tsx][fonte-75] · [campaigns.integration.test.tsx][fonte-15]

<a id="tarefa-71"></a>

## Programar os momentos de uma campanha automática

- **Também perguntam:** Como preparo lembrete um dia antes? Como faço mensagens automáticas por aniversário ou sessão?
- **Onde começar:** Menu lateral → [Comunicações](https://crm.organizastudios.com/comunicacoes).
- **Antes de começar:** Permissão de campanhas automáticas. A automação monta a lista do dia para a equipe tratar.

1. Abra **Campanhas automáticas → Nova campanha automática**.
2. Preencha **Nome da campanha** e escolha **Evento**.
3. Em **Quando**, informe os dias antes ou use o dia do evento.
4. Escreva a mensagem com os campos oferecidos; use **Adicionar mensagem** para outros momentos.
5. Confira a opção **Campanha ativa** e clique em **Salvar campanha**.

**Como saber se deu certo:** Quem se enquadra aparece em **Início → Campanhas automáticas**. Isso não significa envio automático da conversa pelo WhatsApp.

**Se o botão não aparecer:** Os campos disponíveis mudam conforme o evento. Confira a permissão e a opção de campanha ativa.

**Verificação:** Formulário e evento Atendimento agendado vistos, sem salvar/ativar. Testes cobrem momentos e fila diária.

**Fontes:** [Comunicações](https://crm.organizastudios.com/comunicacoes) · [AutoCampaignEditorModal.tsx][fonte-76] · [auto-campaigns.integration.test.tsx][fonte-77]

<a id="tarefa-72"></a>

## Entender a sugestão e registrar o contato

- **Também perguntam:** Por que o CRM sugeriu esse cliente? Como anoto o retorno ou adio o contato?
- **Onde começar:** Menu lateral → [Contatos sugeridos](https://crm.organizastudios.com/relacionamento).
- **Antes de começar:** Sugestão existente e acesso para registrar contato.

1. Clique no nome do cliente em **Quem contatar**.
2. Confira os motivos em **Situações** e os detalhes de parcelas, planos ou contratos.
3. Clique em **Registrar contato**.
4. Escolha **Resultado**.
5. Para **Adiar contato**, preencha **Adiar até**; acrescente **Observação** se necessário.
6. Clique em **Salvar contato**.

**Como saber se deu certo:** O registro trata a sugestão conforme o resultado. O teste confirma tratamento conjunto quando o mesmo cliente tem mais de um motivo.

**Se o botão não aparecer:** Os atalhos dependem dos dados disponíveis; o caso visto ofereceu WhatsApp e telefone informado. Confira a permissão de atividades.

**Verificação:** Motivo Pagamento atrasado, pendências e formulário vistos. Nenhum contato salvo ou mensagem enviada.

**Fontes:** [Contatos sugeridos](https://crm.organizastudios.com/relacionamento) · [ContactActivityModal.tsx][fonte-78] · [grouped-suggestions.integration.test.tsx][fonte-79]

<a id="tarefa-73"></a>

## Editar os dados de um evento

- **Também perguntam:** Como altero local ou data do evento? Onde edito o aulão?
- **Onde começar:** Menu lateral → [Eventos](https://crm.organizastudios.com/eventos).
- **Antes de começar:** Evento cadastrado e permissão de edição.

1. Na lista de eventos, clique em **Editar** do evento correto.
2. Altere os campos necessários, como nome, **Data e horário** ou **Local ou cidade**.
3. Confira serviço e público estimado quando usados.
4. Clique em **Salvar evento**.

**Como saber se deu certo:** A lista mostra os novos dados do evento.

**Se o botão não aparecer:** Confira se seu perfil permite alterar eventos.

**Verificação:** Botão de edição visto. Formulário e resultado conferidos no componente e no teste; evento antigo não alterado.

**Fontes:** [Eventos](https://crm.organizastudios.com/eventos) · [EventModal.tsx][fonte-80] · [events.spec.ts][fonte-81]

<a id="tarefa-74"></a>

## Adicionar um participante a um evento

- **Também perguntam:** Como cadastro alguém no aulão? Como incluo um participante?
- **Onde começar:** Menu lateral → [Eventos](https://crm.organizastudios.com/eventos).
- **Antes de começar:** Evento existente e acesso para gerenciar participantes.

1. No evento, clique em **Participantes**.
2. Clique em **Adicionar participante**.
3. Preencha nome e contatos disponíveis.
4. Clique em **Adicionar participante** dentro da janela.

**Como saber se deu certo:** O participante entra na lista. A tela informa que também entra no comercial com origem do evento.

**Se o botão não aparecer:** Todos os campos deste formulário são opcionais. Contatos já cadastrados também podem participar.

**Verificação:** Participante fictício criado; lista e aviso Participante adicionado conferidos.

**Fontes:** [Eventos](https://crm.organizastudios.com/eventos) · [EventParticipantModal.tsx][fonte-82] · [event-participants.integration.test.tsx][fonte-83]

<a id="tarefa-75"></a>

## Importar participantes de um evento

- **Também perguntam:** Como trago inscritos de uma planilha? Como importo a lista do evento?
- **Onde começar:** Menu lateral → [Eventos](https://crm.organizastudios.com/eventos).
- **Antes de começar:** Arquivo CSV ou XLSX até2MB, títulos na primeira linha e permissão de participantes.

1. Abra **Participantes** do evento.
2. Clique em **Importar participantes**.
3. Escolha **Planilha de participantes**.
4. Mapeie as colunas e confira a prévia.
5. Clique em **Importar … participantes**.

**Como saber se deu certo:** Clientes existentes são vinculados ao cadastro. Quem já participa do evento é ignorado; linhas vazias não entram.

**Se o botão não aparecer:** Os campos da planilha são opcionais. Sem arquivo, o botão mostra zero participantes.

**Verificação:** Formulário e regras vistos, sem enviar arquivo. Teste e2e cobre mapeamento, dados faltantes e contatos existentes.

**Fontes:** [Eventos](https://crm.organizastudios.com/eventos) · [EventImportModal.tsx][fonte-84] · [events.spec.ts][fonte-81]

<a id="tarefa-76"></a>

## Exportar a lista de participantes

- **Também perguntam:** Como baixo a planilha dos inscritos? Onde exporto o evento?
- **Onde começar:** Menu lateral → [Eventos](https://crm.organizastudios.com/eventos).
- **Antes de começar:** Acesso de consulta ao evento.

1. Abra **Participantes** do evento correto.
2. Clique em **Exportar participantes**.

**Como saber se deu certo:** O navegador baixa uma planilha XLSX identificada com o evento.

**Se o botão não aparecer:** O teste confirma que acesso de consulta ao evento é suficiente; confira se você está no detalhe do evento.

**Verificação:** Botão visto. Download não executado; formato e arquivo confirmados no teste de exportação.

**Fontes:** [Eventos](https://crm.organizastudios.com/eventos) · [EventDetailPage.tsx][fonte-85] · [event-export.integration.test.tsx][fonte-86]

<a id="tarefa-77"></a>

## Transformar um participante em cliente

- **Também perguntam:** Como converto o inscrito do evento? Onde completo o cadastro do participante?
- **Onde começar:** Menu lateral → [Eventos](https://crm.organizastudios.com/eventos).
- **Antes de começar:** Participante ainda não convertido e permissão para conversão e cadastro de clientes.

1. Na lista, clique em **Se tornou cliente**.
2. Se faltarem dados, confira a mensagem sugerida e clique em **Preencher cadastro**.
3. Complete os campos obrigatórios do cliente.
4. Clique em **Cadastrar cliente**.

**Como saber se deu certo:** O participante passa a ser identificado como cliente e a ação de conversão deixa de aparecer.

**Se o botão não aparecer:** A falta de CPF e dados de emergência pode impedir o cadastro. Confira as permissões.

**Verificação:** Pedido de dados e formulário preenchido com contatos fictícios vistos. Não se confirmou conversão; teste confirma o vínculo com cliente.

**Fontes:** [Eventos](https://crm.organizastudios.com/eventos) · [EventConvertModal.tsx][fonte-87] · [event-convert.integration.test.tsx][fonte-88]

<a id="tarefa-78"></a>

## Criar um modelo de documento

- **Também perguntam:** Como monto um contrato padrão? Como salvo um texto para reutilizar?
- **Onde começar:** Menu lateral → [Contratos](https://crm.organizastudios.com/contratos).
- **Antes de começar:** Acesso para criar modelos de contratos.

1. Abra a aba **Criar modelo**; se a lista estiver vazia, use **Criar primeiro modelo**.
2. Preencha **Nome do modelo** e **Tipo**.
3. Escolha **Usar contrato padrão** ou **Começar em branco**.
4. Edite **Conteúdo** e confira a prévia.
5. Clique em **Criar modelo**.

**Como saber se deu certo:** O modelo aparece em **Modelos**, identificado com a versão.

**Se o botão não aparecer:** Confira sua permissão de modelos. Alterações posteriores usam o fluxo de Nova versão.

**Verificação:** Modelo fictício criado em branco, com texto sem validade contratual; versão1 conferida.

**Fontes:** [Contratos](https://crm.organizastudios.com/contratos) · [DocumentsPage.tsx][fonte-89] · [contracts.spec.ts][fonte-90]

<a id="tarefa-79"></a>

## Preparar, revisar e emitir um documento

- **Também perguntam:** Como faço o contrato de um cliente? Como confiro o PDF antes de emitir?
- **Onde começar:** Menu lateral → [Contratos](https://crm.organizastudios.com/contratos).
- **Antes de começar:** Modelo ativo, cliente cadastrado e acesso de emissão.

1. Em **Documentos**, clique em **Novo documento**.
2. Confira **Modelo ativo**, **Cliente**, plano e profissional opcionais e **Título**.
3. Clique em **Preparar conteúdo** e revise o texto.
4. Clique em **Conferir PDF**; use **Abrir PDF** ou **Salvar PDF** para conferir o arquivo.
5. Clique em **Criar rascunho**.
6. Em **Revisar rascunho**, clique em **Emitir** e confira a confirmação **Emitir contrato**.

**Como saber se deu certo:** O documento fica Emitido. Após a emissão, seu texto não pode ser editado.

**Se o botão não aparecer:** Sem modelo ativo, Novo documento fica desabilitado. Falta de cliente bloqueia Preparar conteúdo.

**Verificação:** Rascunho e emissão executados somente com documento fictício sem validade contratual. Teste cobre revisão, PDF e emissão.

**Fontes:** [Contratos](https://crm.organizastudios.com/contratos) · [DocumentsPage.tsx][fonte-89] · [contracts.spec.ts][fonte-90]

<a id="tarefa-80"></a>

## Preparar o link de assinatura de um contrato

- **Também perguntam:** Como envio o contrato para assinar? Como vejo se o link foi visualizado?
- **Onde começar:** Menu lateral → [Contratos](https://crm.organizastudios.com/contratos).
- **Antes de começar:** Documento emitido e permissões de emissão e situação do documento.

1. Abra **Ver detalhes** do documento.
2. Clique em **Enviar pelo WhatsApp**.
3. Na janela **Enviar para assinatura**, confira mensagem e validade.
4. Use **Abrir WhatsApp** ou **Copiar link** quando for enviar ao destinatário.
5. Depois, confira o acompanhamento nos detalhes.

**Como saber se deu certo:** A preparação gera ou reaproveita o link. Nos detalhes, **Link ativo** indica que o link pode ser usado, e **Link gerado** mostra a data e quem o criou. Para compartilhar, conclua o envio no WhatsApp ou cole o link na mensagem ao destinatário. Confira **Visualizações** e **Assinatura** para acompanhar a abertura e a assinatura.

**Se o botão não aparecer:** Rascunho precisa ser emitido. Confira contato e permissões; links expirados têm tratamento próprio.

**Verificação:** A auditoria de 20/11 gerou um link fictício. O teste na revisão posterior cobre gerar o link e fechar a janela com o estado **Ainda não visualizado**.

**Fontes:** [Contratos](https://crm.organizastudios.com/contratos) · [Teste atualizado](../apps/web/src/features/contracts/signature-link.integration.test.tsx)

<a id="tarefa-81"></a>

## Assinar um contrato recebido da clínica

- **Também perguntam:** Como o cliente assina pelo celular? Precisa entrar no CRM para assinar?
- **Onde começar:** Link recebido da clínica → página pública do documento. Não há um link privado incluído neste arquivo.
- **Antes de começar:** Guia do destinatário, baseado em código e testes. Tenha o link válido recebido da clínica.

1. Abra o link recebido e leia o documento.
2. Confira **Nome completo** e **CPF de quem assina**.
3. Desenhe na **Área de assinatura**; **Limpar assinatura** permite refazer.
4. Se concordar, marque **Li o documento e concordo com os seus termos.**
5. Clique em **Assinar documento**.

**Como saber se deu certo:** O documento passa a apresentar a assinatura e a identificação do signatário.

**Se o botão não aparecer:** O botão depende de nome, CPF válido, desenho e aceite. Link expirado, cancelado ou indisponível mostra aviso próprio.

**Verificação:** Página pública não aberta nesta auditoria. Sequência, ausência de login, assinatura e estados confirmados nos testes. Nenhum link real anexado.

**Fontes:** [Tela da equipe](https://crm.organizastudios.com/contratos) · [PublicSignaturePage.tsx][fonte-93] · [signature-link.integration.test.tsx][fonte-92]

<a id="tarefa-82"></a>

## Assinar um recibo recebido da clínica

- **Também perguntam:** Como assino o recibo de pagamento? Como salvo o recibo assinado?
- **Onde começar:** Link recebido da clínica → página pública do documento. Não há um link privado incluído neste arquivo.
- **Antes de começar:** Guia do destinatário, baseado em código e teste. Link de recibo válido enviado pela clínica.

1. Abra o link recebido e confira o pagamento descrito.
2. Confira **Nome completo** e **CPF de quem assina**.
3. Desenhe sua assinatura.
4. Marque **Conferi o recibo e confirmo o pagamento descrito.** se os dados estiverem corretos.
5. Clique em **Assinar recibo**.
6. Depois, use **Imprimir ou salvar PDF** quando necessário.

**Como saber se deu certo:** O recibo mostra a assinatura e sua data. Reaberto depois, continua assinado.

**Se o botão não aparecer:** Preencha identificação, assinatura e confirmação. O recibo já assinado não oferece novamente o formulário.

**Verificação:** Nenhum link público de recibo aberto. Fluxo completo conferido no teste de celular; não foi feita assinatura nesta auditoria.

**Fontes:** [Tela da equipe](https://crm.organizastudios.com/financeiro) · [PublicReceiptSignaturePage.tsx][fonte-94] · [public-signature.spec.ts][fonte-95]

<a id="tarefa-83"></a>

## Cancelar um documento emitido ou em rascunho

- **Também perguntam:** Como invalido um contrato no sistema? Como cancelo um documento?
- **Onde começar:** Menu lateral → [Contratos](https://crm.organizastudios.com/contratos).
- **Antes de começar:** Permissão de cancelamento. A tela informa que o cancelamento é definitivo.

1. Abra os detalhes do documento correto.
2. Clique em **Cancelar documento**.
3. Preencha **Motivo**.
4. Leia o aviso e confirme em **Cancelar documento** somente quando essa for a intenção.

**Como saber se deu certo:** O documento fica cancelado. O teste da assinatura pública confirma que o link de contrato cancelado deixa de exibir o documento para assinatura.

**Se o botão não aparecer:** Confira a situação e sua permissão. **Voltar** abandona a confirmação.

**Verificação:** Janela vista sem cancelar o documento fictício. Gravação conferida no componente; bloqueio público coberto no teste.

**Fontes:** [Contratos](https://crm.organizastudios.com/contratos) · [CancelDocumentModal.tsx][fonte-96] · [signature-link.integration.test.tsx][fonte-92]

<a id="tarefa-84"></a>

## Abrir e consultar a ficha de prontuário

- **Também perguntam:** Onde vejo avaliações e arquivos do cliente? Como consulto o histórico clínico?
- **Onde começar:** Menu lateral → [Prontuários](https://crm.organizastudios.com/prontuarios).
- **Antes de começar:** Acesso aos prontuários do cliente.

1. Escolha o cliente na lista.
2. Use **Linha do tempo** para ver os registros em ordem.
3. Abra **Avaliações**, **Plano e medições**, **Arquivos** ou **Treinos e documentos** conforme o assunto.
4. Em Avaliações, clique na data do registro para abrir suas respostas.

**Como saber se deu certo:** A ficha mostra os registros do cliente escolhido e filtros próprios de cada seção.

**Se o botão não aparecer:** A ficha começa vazia até selecionar um cliente. A revisão consultada não oferece seção de Evolução.

**Verificação:** Ficha fictícia, avaliação e respostas abertas. Teste confirma ausência das seções legadas de evolução.

**Fontes:** [Prontuários](https://crm.organizastudios.com/prontuarios) · [ClinicalChart.tsx][fonte-97] · [workspace-flows.integration.test.tsx][fonte-98]

<a id="tarefa-85"></a>

## Anexar um arquivo ao prontuário

- **Também perguntam:** Como guardo exame ou laudo? Como adiciono um áudio ao prontuário?
- **Onde começar:** Menu lateral → [Prontuários](https://crm.organizastudios.com/prontuarios).
- **Antes de começar:** Cliente selecionado e acesso a anexos clínicos.

1. Abra **Arquivos → Anexar arquivo**; também existe **Mais ações → Anexar arquivo**.
2. Escolha **Arquivo** ou **Gravar áudio**.
3. Se necessário, escreva **Observações**.
4. Clique em **Anexar arquivo**.

**Como saber se deu certo:** O anexo aparece nos arquivos e no histórico clínico.

**Se o botão não aparecer:** PDF, Word e imagens: até5MB. Áudio: até15 minutos e16MB. Sem arquivo ou gravação, o botão informa o que falta.

**Verificação:** Formulário visto; nenhum anexo enviado nem microfone utilizado. Testes cobrem validação e preservação de anexos.

**Fontes:** [Prontuários](https://crm.organizastudios.com/prontuarios) · [ClinicalAttachmentModal.tsx][fonte-99] · [client-workspace.spec.ts][fonte-100]

<a id="tarefa-86"></a>

## Criar e publicar um modelo de avaliação

- **Também perguntam:** Como monto a ficha de avaliação? Como adiciono perguntas ao formulário?
- **Onde começar:** Menu lateral → [Prontuários](https://crm.organizastudios.com/prontuarios).
- **Antes de começar:** Acesso para criar modelos clínicos.

1. Em **Registrar avaliação**, use **Criar modelo** se faltar formulário; a área principal também oferece **Criar modelo**.
2. Preencha **Nome do modelo** e confira **Especialidade**.
3. Para cada campo, preencha **Pergunta ou título** e escolha **Tipo**.
4. Use **Adicionar campo**, obrigatoriedade e ordem conforme necessário.
5. Confira **Prévia do formulário**.
6. Clique em **Publicar modelo**, ou use **Salvar rascunho** para continuar depois.

**Como saber se deu certo:** O modelo publicado fica disponível para registrar avaliações. Modelos publicados são versionados.

**Se o botão não aparecer:** Falta de nome ou pergunta bloqueia a publicação. Rascunho não é formulário publicado disponível para uso.

**Verificação:** Modelo fictício de resposta longa publicado e imediatamente disponibilizado na avaliação.

**Fontes:** [Prontuários](https://crm.organizastudios.com/prontuarios) · [AssessmentTemplateModal.tsx][fonte-101] · [assessment-forms.integration.test.tsx][fonte-102]

<a id="tarefa-87"></a>

## Registrar uma avaliação usando um formulário

- **Também perguntam:** Como preencho a avaliação do cliente? Como consulto o que foi registrado?
- **Onde começar:** Menu lateral → [Prontuários](https://crm.organizastudios.com/prontuarios).
- **Antes de começar:** Cliente selecionado, formulário publicado e acesso para avaliações.

1. Clique em **Registrar avaliação**.
2. Escolha o formulário e clique em **Preencher formulário**, quando solicitado.
3. Preencha as respostas e **Observações**.
4. Clique em **Registrar avaliação** na janela.

**Como saber se deu certo:** A avaliação aparece na Linha do tempo e na aba Avaliações, com data e autor.

**Se o botão não aparecer:** Sem modelo, use Criar modelo se tiver essa permissão ou peça a publicação do formulário.

**Verificação:** Avaliação fictícia registrada e suas respostas conferidas. Não foram inseridas informações clínicas reais.

**Fontes:** [Prontuários](https://crm.organizastudios.com/prontuarios) · [ClinicalAssessmentModal.tsx][fonte-103] · [assessment-forms.integration.test.tsx][fonte-102]

<a id="tarefa-88"></a>

## Exportar ou imprimir o prontuário

- **Também perguntam:** Como baixo o prontuário do cliente? Como imprimo a ficha clínica?
- **Onde começar:** Menu lateral → [Prontuários](https://crm.organizastudios.com/prontuarios).
- **Antes de começar:** Cliente selecionado e permissão de exportação clínica.

1. Abra o prontuário do cliente correto.
2. Clique em **Exportar** para baixar os dados.
3. Para impressão, use **Imprimir**.

**Como saber se deu certo:** Exportar baixa um arquivo JSON do prontuário. Imprimir abre o fluxo de impressão do navegador.

**Se o botão não aparecer:** Confira o acesso de exportação e a seleção do cliente.

**Verificação:** Botões vistos; nenhum dado clínico exportado nesta auditoria. Formato JSON e fluxo conferidos no código e no teste.

**Fontes:** [Prontuários](https://crm.organizastudios.com/prontuarios) · [ClinicalChart.tsx][fonte-97] · [workspace-flows.integration.test.tsx][fonte-98]

<a id="tarefa-89"></a>

## Consultar os filtros e exportar um relatório

- **Também perguntam:** Como baixo o relatório de vendas? Como exporto clientes, campanhas ou DRE?
- **Onde começar:** Menu lateral → [Relatórios](https://crm.organizastudios.com/relatorios).
- **Antes de começar:** Acesso ao assunto e à sua exportação. O período geral é compartilhado pelas abas.

1. Escolha a aba desejada; **Visão geral** reúne Vendas, Indicadores, Rentabilidade e Equipe e origens.
2. Confira o período e os filtros específicos apresentados na aba.
3. Use o botão correspondente na tabela abaixo.

| Assunto | Caminho e botão |
| --- | --- |
| Vendas | Visão geral → Vendas → **Exportar Excel detalhado** |
| Indicadores | Visão geral → Indicadores → **Exportar Excel** |
| Clientes | Clientes → Consulta de clientes → **Consultar clientes** → **Exportar clientes** |
| Campanhas | Campanhas → **Tipo de campanha** → **Exportar planilha** |
| DRE | DRE → **Exportar DRE**; **Imprimir DRE** abre impressão |

**Como saber se deu certo:** O navegador baixa a planilha do relatório. Vendas, clientes e DRE têm exportações XLSX confirmadas nos testes.

**Se o botão não aparecer:** Nem toda aba tem botão de exportação. Confira as permissões de cada relatório.

**Verificação:** Todas as abas foram abertas. Downloads não executados nesta auditoria; testes conferem arquivos de vendas, clientes e DRE.

**Fontes:** [Relatórios](https://crm.organizastudios.com/relatorios) · [ReportsPage.tsx][fonte-104] · [reports.spec.ts][fonte-105]

<a id="tarefa-90"></a>

## Filtrar e exportar o extrato financeiro

- **Também perguntam:** Como exporto o caixa por forma de pagamento? Como filtro entradas e saídas do relatório?
- **Onde começar:** Menu lateral → [Relatórios](https://crm.organizastudios.com/relatorios).
- **Antes de começar:** Acesso ao relatório Financeiro e à exportação.

1. Abra a aba **Financeiro** dos Relatórios.
2. Localize **Extrato detalhado**.
3. Use busca, tipo, origem, categoria, centro de custo, forma de pagamento e os demais filtros necessários.
4. Confira período, valores e ordenação.
5. Clique em **Exportar extrato**.

**Como saber se deu certo:** A exportação baixa XLSX com o recorte do extrato.

**Se o botão não aparecer:** O botão depende de permissão e de lançamentos visíveis. Entradas e saídas do caixa usam datas financeiras próprias.

**Verificação:** Filtros e botão vistos; formato e parâmetros de exportação conferidos no componente. Teste citado cobre relatórios financeiros do mesmo módulo.

**Fontes:** [Relatórios](https://crm.organizastudios.com/relatorios) · [FinancialLedger.tsx][fonte-106] · [financial-report.integration.test.tsx][fonte-107]

<a id="tarefa-91"></a>

## Pesquisar alterações e abrir seus detalhes

- **Também perguntam:** Quem alterou esse cadastro? Como encontro uma ação no histórico?
- **Onde começar:** Menu lateral → [Histórico](https://crm.organizastudios.com/historico).
- **Antes de começar:** Acesso ao Histórico; detalhes clínicos dependem também das permissões correspondentes.

1. Preencha **Pesquisar**.
2. Se precisar, combine **Área**, **Tipo de atividade**, **Responsável**, **De** e **Até**.
3. Clique em **Pesquisar e filtrar**.
4. No resultado, clique em **Ver detalhes**.
5. Use **Resumo** ou **Detalhes técnicos**; para outra busca, use **Limpar filtros**.

**Como saber se deu certo:** O resumo mostra o que aconteceu, quem fez e quando. A paginação usa Anterior e Próxima.

**Se o botão não aparecer:** Confira filtros e permissão do Histórico. Não foi encontrado atalho direto para abrir o registro de origem dentro dos detalhes.

**Verificação:** Busca de registros fictícios e janela de detalhes exercitadas. Componente e teste confirmam filtros, abas e restrições.

**Fontes:** [Histórico](https://crm.organizastudios.com/historico) · [HistoryDetailsModal.tsx][fonte-108] · [history-page.integration.test.tsx][fonte-109]

<a id="tarefa-92"></a>

## Consultar e ajustar as permissões de um usuário

- **Também perguntam:** Como libero uma tela para a equipe? O cargo define o acesso?
- **Onde começar:** Menu lateral → [Configurações](https://crm.organizastudios.com/configuracoes).
- **Antes de começar:** Perfil administrador. Mudanças de acesso precisam refletir a função de cada pessoa.

1. Abra **Usuários**.
2. Clique em **Editar** do usuário; **Novo usuário** abre um cadastro novo.
3. Confira **Tipo** e use **Buscar permissão**.
4. Marque as operações necessárias por área; acesso à área é a base das ações.
5. Revise os demais campos e use o botão de salvar do cadastro.

**Como saber se deu certo:** O acesso segue as permissões selecionadas. **Cargo** é informativo; Admin tem acesso administrativo.

**Se o botão não aparecer:** As abas e ações dependem das permissões. O teste impede remover o último administrador da condição necessária para administrar.

**Verificação:** Cadastro de novo usuário e permissões lidos sem criar usuário ou alterar acessos. Perfis restritos foram comparados apenas nos testes.

**Fontes:** [Configurações](https://crm.organizastudios.com/configuracoes) · [UserFormModal.tsx][fonte-110] · [users-and-permissions.integration.test.tsx][fonte-111]

<a id="tarefa-93"></a>

## Cadastrar uma filial

- **Também perguntam:** Como adiciono outra unidade? Quais dados são separados por filial?
- **Onde começar:** Menu lateral → [Configurações](https://crm.organizastudios.com/configuracoes).
- **Antes de começar:** Perfil com acesso administrativo a filiais.

1. Abra **Filiais → Nova filial**.
2. Preencha **Nome da filial**.
3. Confira telefones, endereço e **Filial ativa**.
4. Clique em **Salvar filial**.

**Como saber se deu certo:** A filial fica disponível na operação. Agenda, salas, profissionais, turmas, estoque e financeiro são próprios; clientes, serviços e planos são da rede.

**Se o botão não aparecer:** Filial inativa some do seletor, mas mantém histórico. Confira seu acesso administrativo.

**Verificação:** Formulário visto sem criar filial. Testes cobrem cadastro e vínculo entre filiais.

**Fontes:** [Configurações](https://crm.organizastudios.com/configuracoes) · [BranchModal.tsx][fonte-112] · [branches.integration.test.tsx][fonte-113]

<a id="tarefa-94"></a>

## Cadastrar um serviço e definir seus recursos

- **Também perguntam:** Como adiciono Pilates ou outro atendimento? Onde defino duração e salas permitidas?
- **Onde começar:** Menu lateral → [Configurações](https://crm.organizastudios.com/configuracoes).
- **Antes de começar:** Acesso para cadastrar serviços.

1. Abra **Serviços e salas → Serviços**.
2. Clique em **Novo cadastro**.
3. Preencha **Nome** e **Duração (minutos)**.
4. Se necessário, marque profissionais e salas permitidos.
5. Clique em **Salvar cadastro**.

**Como saber se deu certo:** O serviço fica disponível nos cadastros e agendamentos compatíveis. O preço fica nos planos; sessão única usa um Plano avulso.

**Se o botão não aparecer:** Nenhum profissional ou sala marcado significa todos disponíveis. Confira a permissão de cadastro.

**Verificação:** Formulário e explicações vistos sem salvar serviço. Regras de cadastro e atualização conferidas no código e testes de configurações.

**Fontes:** [Configurações](https://crm.organizastudios.com/configuracoes) · [AdministrativeRegistrySection.tsx][fonte-114] · [settings.spec.ts][fonte-115]

<a id="tarefa-95"></a>

## Cadastrar uma sala com capacidade

- **Também perguntam:** Como adiciono uma sala? Onde limito quantos clientes cabem ao mesmo tempo?
- **Onde começar:** Menu lateral → [Configurações](https://crm.organizastudios.com/configuracoes).
- **Antes de começar:** Acesso para cadastrar salas.

1. Abra **Serviços e salas → Salas**.
2. Clique em **Novo cadastro**.
3. Preencha **Nome da sala**.
4. Informe **Capacidade de atendimento simultâneo**.
5. Clique em **Salvar cadastro**.

**Como saber se deu certo:** A sala passa a poder ser usada nos serviços e na agenda. Sua capacidade limita os usos simultâneos.

**Se o botão não aparecer:** Confira o acesso de cadastro de sala e a capacidade informada.

**Verificação:** Formulário visto sem criar sala. Componente e teste de configurações consultados.

**Fontes:** [Configurações](https://crm.organizastudios.com/configuracoes) · [AdministrativeRegistrySection.tsx][fonte-114] · [settings.spec.ts][fonte-115]

<a id="tarefa-96"></a>

## Cadastrar um plano no catálogo

- **Também perguntam:** Como crio o modelo da mensalidade? Como cadastro o serviço avulso para vender?
- **Onde começar:** Menu lateral → [Configurações](https://crm.organizastudios.com/configuracoes).
- **Antes de começar:** Acesso à configuração do catálogo de planos.

1. Abra **Planos → Cadastrar plano**.
2. Preencha **Nome do plano** e escolha **Tipo de plano**.
3. Informe **Valor total**.
4. Escolha os serviços e suas sessões; mensalidades usam sessões por semana.
5. Para **Plano avulso**, confira o parcelamento permitido.
6. Clique em **Salvar plano**.

**Como saber se deu certo:** O catálogo fica disponível nas novas contratações. Alterações não mudam contratos já vendidos.

**Se o botão não aparecer:** Confira nome, valor e serviços. Tipo de plano determina os campos de frequência e sessões.

**Verificação:** Modelos fictícios Mensal e Avulso salvos e usados nos fluxos de contratação.

**Fontes:** [Configurações](https://crm.organizastudios.com/configuracoes) · [PlanTemplateModal.tsx][fonte-116] · [single-plan-template.integration.test.tsx][fonte-117]

<a id="tarefa-97"></a>

## Adicionar um feriado ao calendário

- **Também perguntam:** Como marco um feriado? Como importo os feriados do ano?
- **Onde começar:** Menu lateral → [Configurações](https://crm.organizastudios.com/configuracoes).
- **Antes de começar:** Acesso à configuração de feriados.

1. Abra **Feriados**.
2. Para cadastro individual, preencha **Data** e **Nome do feriado**.
3. Clique em **Adicionar feriado**.
4. Para a lista anual, use **Importar feriados do ano** e confira a seleção antes de confirmar.

**Como saber se deu certo:** O cadastro individual mostra **Feriado adicionado.** A importação tem uma conferência própria.

**Se o botão não aparecer:** Confira a permissão e os campos obrigatórios. Nenhuma importação anual foi confirmada nesta auditoria.

**Verificação:** Aba e controles vistos; resultado de cadastro individual conferido no componente. Teste citado cobre configurações, sem provar esta importação anual.

**Fontes:** [Configurações](https://crm.organizastudios.com/configuracoes) · [HolidaysContent.tsx][fonte-118] · [settings.spec.ts][fonte-115]

<a id="tarefa-98"></a>

## Definir parcelamento das formas de pagamento

- **Também perguntam:** Como limito parcelas do cartão? Onde habilito parcelamento de um meio de pagamento?
- **Onde começar:** Menu lateral → [Configurações](https://crm.organizastudios.com/configuracoes).
- **Antes de começar:** Acesso à configuração de formas de pagamento.

1. Abra **Formas de pagamento**.
2. Localize a forma desejada.
3. Confira **Aceita parcelamento**.
4. Defina **Máximo de parcelas** quando o parcelamento for aceito.
5. Clique em **Salvar formas de pagamento**.

**Como saber se deu certo:** Novas contratações seguem os limites configurados.

**Se o botão não aparecer:** O próprio formulário de contratação indica limites, como Pix só à vista. Confira as permissões de configuração.

**Verificação:** Aba vista sem mudar limites. Componentes de contratação refletiram Pix à vista e Cartão até4x.

**Fontes:** [Configurações](https://crm.organizastudios.com/configuracoes) · [PaymentMethodsContent.tsx][fonte-119] · [settings.spec.ts][fonte-115]

<a id="tarefa-99"></a>

## Mudar o nome exibido de uma aba do menu

- **Também perguntam:** Como renomeio um módulo no menu? Como volto aos nomes padrão?
- **Onde começar:** Menu lateral → [Configurações](https://crm.organizastudios.com/configuracoes).
- **Antes de começar:** Acesso administrativo à personalização do menu.

1. Abra **Abas do menu**.
2. Altere o nome desejado.
3. Clique em **Salvar nomes das abas**.
4. Para voltar aos nomes originais, use **Restaurar nomes padrão** e confira a alteração antes de salvar.

**Como saber se deu certo:** O menu usa os nomes personalizados. Os caminhos e as permissões continuam associados às áreas originais.

**Se o botão não aparecer:** Confira seu acesso administrativo. Salvar fica desabilitado quando nada foi alterado.

**Verificação:** Aba e botões vistos sem renomear. Teste cobre os nomes do menu.

**Fontes:** [Configurações](https://crm.organizastudios.com/configuracoes) · [NavTabLabelsContent.tsx][fonte-120] · [nav-tab-labels.integration.test.tsx][fonte-121]

<a id="tarefa-100"></a>

## Atualizar a foto e o nome do próprio perfil

- **Também perguntam:** Como troco minha foto? Como altero meu nome na agenda?
- **Onde começar:** Menu lateral → [Meu perfil](https://crm.organizastudios.com/perfil).
- **Antes de começar:** Sessão do próprio usuário.

1. Em **Dados pessoais**, altere **Nome completo**.
2. Para foto, escolha **Foto** em PNG ou JPEG até2MB.
3. Se houver profissional vinculado, confira **Nome na agenda** e **Cor na agenda**.
4. Clique em **Salvar perfil**.

**Como saber se deu certo:** Aparece **Perfil salvo.** Os dados do perfil são atualizados.

**Se o botão não aparecer:** **E-mail de acesso** e **Cargo** são de leitura nesta tela. Campos da Agenda dependem de profissional vinculado.

**Verificação:** Campos vistos sem mudar o usuário real. Teste confirma foto, nome e nome na agenda.

**Fontes:** [Meu perfil](https://crm.organizastudios.com/perfil) · [ProfilePage.tsx][fonte-122] · [profile.integration.test.tsx][fonte-123]

<a id="tarefa-101"></a>

## Alterar a própria senha

- **Também perguntam:** Como troco minha senha? O que acontece com acessos em outros aparelhos?
- **Onde começar:** Menu lateral → [Meu perfil](https://crm.organizastudios.com/perfil).
- **Antes de começar:** Sessão do próprio usuário e senha atual conhecida.

1. Na seção **Senha**, preencha **Senha atual**.
2. Preencha **Nova senha**.
3. Repita em **Confirmar nova senha**.
4. Clique em **Alterar senha**.

**Como saber se deu certo:** O código mostra **Senha alterada. As sessões em outros aparelhos foram encerradas.**

**Se o botão não aparecer:** Confira a confirmação e a senha atual. O formulário informa quando a nova senha não atende à validação.

**Verificação:** Somente formulário inspecionado. Nenhuma senha digitada, revelada ou alterada. Teste cobre confirmação, senha atual e sucesso.

**Fontes:** [Meu perfil](https://crm.organizastudios.com/perfil) · [ProfilePage.tsx][fonte-122] · [profile.integration.test.tsx][fonte-123]

<a id="tarefa-102"></a>

## Sair de todos os dispositivos

- **Antes de começar:** Entre na sua conta. A confirmação encerra também a sessão atual.

1. No celular, toque em **Abrir menu**.
2. No rodapé do menu lateral, clique em **Sair de todos os dispositivos**.
3. Clique em **Encerrar acessos** para voltar à tela de login. Para manter a sessão, clique em **Cancelar**.

**Fontes:** [Menu lateral](../apps/web/src/app/Shell.tsx) · [Confirmação](../apps/web/src/shared/auth/RevokeSessionsButton.tsx)

<a id="tarefa-103"></a>

## Inativar clientes em lote

- **Antes de começar:** Entre com um perfil administrador. A prévia considera os cadastros da rede e as regras de elegibilidade, como plano vigente e atividade na Agenda.

1. Em **Clientes**, abra **Mais** e clique em **Inativar em lote**.
2. Informe **Meses sem atividade**, entre 3 e 120.
3. Clique em **Ver prévia**.
4. Marque os clientes que quer inativar e confira o total selecionado.
5. Clique em **Confirmar inativação**.

**Como saber se deu certo:** A tela informa quantos clientes foram inativados e quantos foram ignorados. O servidor confere a elegibilidade novamente ao confirmar. Você pode usar **Cancelar** antes da confirmação para manter os cadastros como estão.

**Fontes:** [Modal de inativação](../apps/web/src/features/patients/PatientInactivationModal.tsx) · [Cenário de navegador](../e2e/audit-followup.spec.ts)

<a id="tarefa-104"></a>

## Consultar o histórico de acessos ao prontuário

- **Antes de começar:** Seu perfil precisa ter permissão para consultar os acessos.

1. Em **Prontuários**, abra o prontuário do cliente. Você também pode usar a aba **Prontuário** na ficha em **Clientes**.
2. Abra **Mais ações**.
3. Clique em **Histórico de acessos**.
4. Confira o usuário, a ação, a data e a hora. Os eventos mais recentes aparecem primeiro.

**Como saber se deu certo:** A janela está identificada pelo nome do cliente e mostra as ações registradas para aquele prontuário.

**Fontes:** [Janela de histórico](../apps/web/src/features/clinical/ClinicalAccessHistoryModal.tsx) · [Cenário de navegador](../e2e/audit-followup.spec.ts)

## Inventário complementar das telas

### Ficha do cliente e validação de duplicidade

A ficha tem **Agenda**, **Planos**, **Financeiro**, **Contratos**, **Prontuário** e **Histórico**. Os dados gerais mostram situação, plano ativo, próximo atendimento e contatos. Há atalhos contextuais para os módulos, como **Abrir na Agenda**. O caminho foi aberto pelo nome da pessoa na lista de Clientes. [PatientDetailPage.tsx][fonte-127]

O cadastro manual exige CPF válido e único. Se aparecer **Já existe um cliente com este CPF.**, procure a ficha existente em **Clientes**. A mesclagem foi retirada da interface. [PatientsPage.tsx][fonte-126] · [PatientDetailPage.tsx][fonte-127]

Em **Novo lead**, **Nome completo**, **Telefone**, **Origem** e **Interesse** são obrigatórios. Nesta sessão, Origem começou em **Indicação** e Interesse em **Fisioterapia**. Os dois valores devem ser conferidos; não se deve orientar que estarão sempre vazios. **WhatsApp** não era obrigatório nesse cadastro de lead.

### Relatórios: organização e filtros específicos

| Aba principal | Seções ou filtros próprios vistos | Exportação vista |
| --- | --- | --- |
| Visão geral | Vendas, Indicadores, Rentabilidade, Equipe e origens. Usam o período geral. | Vendas: Excel detalhado. Indicadores: Excel. Não foi visto botão próprio em Rentabilidade ou Equipe e origens. |
| Clientes | Retenção; Ranking e faixa etária; Sem retorno; Consulta de clientes. A consulta tem busca, Situação e Desconto. | Exportar clientes e Imprimir clientes na consulta. |
| Campanhas | Tipo de campanha. | Exportar planilha. |
| DRE | DRE por competência, com o período compartilhado. | Exportar DRE e Imprimir DRE. |
| Financeiro | Agrupar entradas e saídas; Colunas e Linhas do fluxo de caixa; filtros do Extrato detalhado. | Exportar extrato. |

Filtros do **Extrato detalhado** vistos: **Buscar**, **Tipo**, **Origem**, **Categoria**, **Centro de custo**, **Forma de pagamento**, **Cliente, fornecedor ou profissional**, **Profissional pago**, **Valor mínimo (R$)**, **Valor máximo (R$)**, **Ordenar**, **De** e **Até**. Eles são próprios do extrato, além do período geral do relatório. [ReportsPage.tsx][fonte-104] · [FinancialLedger.tsx][fonte-106]

### Configurações: todas as abas abertas

| Aba | Conteúdo e ações vistos | Condição ou limite da verificação |
| --- | --- | --- |
| Clínica | Identificação, logotipo, contato/localização e mensagens de recebimentos; Salvar configurações. | Aba administrativa. Dados existentes não alterados. |
| Usuários | Novo usuário, Editar, Desativar, Redefinir senha, Encerrar acessos; permissões por operação, agenda, painel de vendas, salário e comissão. | Cadastro novo apenas inspecionado. Nenhum usuário, senha ou acesso criado/alterado. |
| Filiais | Nova filial e Editar; identificação, telefones, endereço e ativa. | Aba administrativa. Nenhuma filial criada. |
| Abas do menu | Personalizar nomes, Restaurar nomes padrão, Salvar nomes das abas. | Aba administrativa. Nenhum nome alterado. |
| Planos | Catálogo por tipo, serviços, sessões/frequência, valor e parcelamento do avulso. | Dois modelos fictícios criados. |
| Feriados | Data, Nome do feriado, Adicionar feriado, Importar feriados do ano. | Aba administrativa. Sem gravação/importação. |
| Finalização automática | Finalizar atendimentos automaticamente, espera e unidade, Salvar finalização automática; atalho para concluídos. | Aba administrativa. A configuração existente não foi alterada; sua execução foi observada em atendimento fictício. |
| Formas de pagamento | Aceita parcelamento, limite por forma, Salvar formas de pagamento. | Aba administrativa. Limites não alterados. |
| Integrações | Nome, Ler vendas, Gravar vendas, Criar chave; seção Telegram. | Aba administrativa. Nenhuma chave criada, exibida ou revogada. O teste cobre exibição única do token e revogação. |
| Etiquetas | Nome, categoria, cor, adicionar/editar; etiquetas automáticas de atraso e cadastro incompleto. | Nenhuma etiqueta criada/alterada. |
| Cadastros | Comercial e Clínico; origens, formas de contato e motivos de não efetivação, entre os catálogos. | Conteúdo aberto; sem alterações. |
| Serviços e salas | Serviços e Salas; Novo cadastro/Editar, recursos e capacidade. | Formulários novos abertos sem salvar. |
| Contatos sugeridos | Prazos e mensagens; Salvar prazos e mensagens. | Prazos existentes não alterados. |

A revisão marca Clínica, Usuários, Filiais, Abas do menu, Feriados, Finalização automática, Formas de pagamento e Integrações como abas administrativas. As demais continuam sujeitas aos acessos e às operações da área. [model.ts][fonte-125] · [permissoes.md][fonte-124]

Os prazos de contatos incluem aniversário, veio uma vez e não voltou, plano acabando, saldo baixo, vencido com saldo, tratamento parado, faltas seguidas e ex-cliente. Na lista publicada desta sessão, o motivo efetivamente aberto foi **Pagamento atrasado**. Não se afirmou que todos os motivos estavam presentes nos dados. [model.ts][fonte-125]

### Contas a pagar, comissões e folha

**Contas a pagar** separa **Contas** e **Despesas fixas**. **Comissões** oferece regras e geração do mês, mas informa que o pagamento é feito pela **Folha**. A regra vinculada ao usuário prevalece sobre a do profissional.

**Folha** mostrou competência, **Novo vale** e **Lançar folha do mês**. Não havia colaborador elegível. A tela exige **Recebe salário** e valor no cadastro do usuário. O lançamento da folha gera uma despesa por colaborador; o pagamento dessa despesa trata as comissões incluídas, conforme o teste consultado. Esse fluxo não foi exercitado ao vivo e permanece na tabela de pendências. [payroll.integration.test.tsx][fonte-133]

## Revalidação dos 15 guias anteriores

| Guia anterior | Revalidação desta auditoria |
| --- | --- |
| tarefa-1 — Agendar atendimento | Cadastro rápido e agendamento fictício executados. Cliente, tipo, serviço, recursos, data/hora e plano conferidos. |
| tarefa-2 — Remarcar atendimento | Remarcação fictícia executada e histórico consultado. |
| tarefa-3 — Cadastrar cliente sem plano | Cadastro fictício salvo sem itens. A interface usa O que o cliente vai fazer? e não exige escolher Só cadastrar por enquanto. |
| tarefa-4 — Novo lead | Nome, Telefone, Origem e Interesse obrigatórios; valores iniciais de origem/interesse conferidos nesta sessão. |
| tarefa-5 — Converter lead | Não refeito. A variante de conversão do participante de evento foi inspecionada sem salvar. |
| tarefa-6 — Criar turma | Turma fictícia criada com duas vagas e horário de terça. |
| tarefa-7 — Dados/frequência da turma | As duas abas foram abertas; uma aula e suas ações também foram inspecionadas. |
| tarefa-8 — Espera de turma cheia | Estado de turma cheia visto. Caminho e gravação da espera permanecem apoiados no teste e2e; não foi adicionada espera nessa turma antiga. |
| tarefa-9 — Contratar pacote | Pacote fictício contratado, com pagamento dividido e vínculo a turma existente. |
| tarefa-10 — Fila por serviço | Entrada fictícia criada e depois atendida pela contratação/matrícula. |
| tarefa-11 — Baixa recebida | Baixa fictícia de50 registrada com duas formas; recibo e situação Paga conferidos. |
| tarefa-12 — Criar evento | Não refeito: já havia evento de teste. Participante fictício adicionado. |
| tarefa-13 — Relatórios por período | Controles e compartilhamento do período conferidos; inventário de abas corrigido. |
| tarefa-14 — Cancelar atendimento | Confirmação e motivo obrigatório vistos no atendimento fictício; cancelamento não confirmado. |
| tarefa-15 — Estornar baixa | Menu da parcela paga com Estornar confirmado. Nenhum estorno foi executado. |

## Divergências e cuidados para incorporar ao manual

| Assunto | Tela publicada e fonte da revisão consultada | Conclusão |
| --- | --- | --- |
| Versão publicada | Não foi encontrada identificação conclusiva do commit em execução. | Não atribuir automaticamente o SHA da main ao site publicado. Não foi comprovada divergência de implantação. |
| Novo cliente | A tela e o componente atual oferecem itens em O que o cliente vai fazer?. O teste e2e ainda procura Só cadastrar por enquanto. | Divergência entre teste e formulário na mesma revisão; usar o formulário e os testes de cadastro guiado para os novos guias. |
| Novo lead | Nesta sessão Origem/Interesse vieram preenchidos; continuam obrigatórios. | Revalidar o texto anterior que dizia que sempre começavam em Selecione; valores dependem do estado/catálogo. |
| Relatórios | Há cinco abas principais e subdivisões internas. | Corrigir o inventário anterior de nove abas no mesmo nível. |
| Evolução clínica | A interface oferece **Linha do tempo** e **Buscar no histórico** para os eventos clínicos exibidos. | Retirar os guias de criação, edição, finalização e adendo de evoluções. |
| Link de contrato | Abrir **Enviar para assinatura** em um documento emitido gera ou reaproveita o link. | Acompanhar geração, visualizações e assinatura nos detalhes. Conferir o envio da mensagem no canal usado para compartilhar. |
| Recibo | Abrir o recibo não marcou envio. O teste registra envio no clique do atalho de WhatsApp. | Enviado, visualizado e assinado são estados distintos; clique no atalho também não comprova entrega externa. |
| Estoque | O estado vazio de Nova venda orientou Estoque do Financeiro, mas o caminho observado está em Vendas de produtos → Estoque. | Usar o caminho do menu verificado. O texto vazio é uma indicação imprecisa, não prova de outra tela. |
| Histórico | Detalhes da alteração tem Resumo/Detalhes técnicos. Não foi visto link para o registro de origem e o componente não apresenta esse atalho. | Não orientar que basta clicar em um ID ou numa rota técnica para abrir o registro. |

Fontes dessas comparações: [patients.spec.ts][fonte-128] · [PatientModal.tsx][fonte-16] · [ReportsPage.tsx][fonte-104] · [workspace-flows.integration.test.tsx][fonte-98] · [SendForSignatureModal.tsx][fonte-91] · [receipt-signature-tracking.integration.test.tsx][fonte-132] · [HistoryDetailsModal.tsx][fonte-108]

## Dados fictícios que permaneceram no sistema

| Área | Registros adicionados e resultado observado |
| --- | --- |
| Clientes | Dois clientes [DEMO], com contatos fictícios e e-mails example.invalid. Não são reproduzidos CPF, identificadores privados ou credenciais. |
| Agenda | Três atendimentos: um concluído automaticamente, um concluído pela equipe e um agendado para21/11 às10h. Série de nota semanal configurada para20 e27/11. |
| Turmas | Uma turma [DEMO] com duas vagas e12 encontros; duas matrículas fictícias. |
| Catálogo de planos | Modelos [DEMO] Mensal Manual e [DEMO] Avulso Manual. |
| Contratações e financeiro | Um pacote de100 dividido em duas cobranças e um mensal de100. Uma baixa fictícia de50: Pix25 + Cartão25. Nenhuma movimentação bancária externa. |
| Produtos | Um produto [DEMO], entrada inicial10, uma venda de1 unidade; saldo final9. Venda fictícia de9 a receber, após desconto de1. |
| Lista de espera | Uma entrada de produto Aguardando; uma entrada de serviço tratada pela matrícula, com situação Atendido. Entradas antigas preservadas. |
| Comercial e evento | Um lead direto [DEMO] e uma tarefa; um participante [DEMO] adicionado ao evento de teste, com lead de origem do evento. |
| Comunicações | Uma mensagem padrão e uma campanha [DEMO], com um destinatário pendente e zero envios. Nenhuma campanha automática salva/ativada. |
| Documentos | Um modelo e um documento [DEMO], com texto explícito sem validade contratual. Documento emitido, link de assinatura preparado, estado Aguardando assinatura; nenhuma visualização pública ou assinatura. |
| Prontuários | Um modelo de avaliação [DEMO] publicado e uma avaliação com texto exclusivamente fictício. Nenhuma informação clínica real inserida. |

Não foram excluídos registros, canceladas matrículas antigas, modificadas credenciais/permissões, alterados dados da clínica ou configuradas integrações.

## Pendências de verificação

**Primeiro ponto para retomar:** **Turmas → abrir turma com crédito disponível → Frequência e reposições**. É o primeiro fluxo da ordem do roteiro cuja seleção completa não pôde ser vista com os dados disponíveis. O funcionamento esperado já está coberto por código/testes e foi separado da validação ao vivo.

| Módulo | Tarefa | Última tela do fluxo | O que falta comprovar ao vivo |
| --- | --- | --- | --- |
| Turmas | Reservar e tratar reposição | Frequência e reposições, Nenhum crédito de reposição disponível | Abrir os seletores com crédito disponível, reservar e conferir o participante de reposição. |
| Turmas | Frequência e conclusão | Aula futura de turma, com seletores e aviso de disponibilidade | Exercitar registros e conclusão em encontro apropriado. Nesta auditoria somente a matrícula foi gravada. |
| Clientes/Comercial/Eventos | Prévia de importação | Importar clientes, Importar leads e Importar participantes, sem arquivo | Abrir a prévia com planilhas fictícias, conferir mapeamento e mensagens de erro da publicação. Testes foram lidos, sem upload ao vivo. |
| Financeiro | Comprovantes | Comprovantes da parcela paga, sem anexos | Enviar arquivo fictício e conferir download/gestão ao vivo; limites e preservação estão nos testes. |
| Financeiro | Folha e vale | Folha, Nenhum colaborador na folha | Com colaborador elegível, abrir Novo vale, lançar folha, conferir despesas e efeitos nas comissões. Nenhum usuário/salário foi modificado para viabilizar isso. |
| Planos/Financeiro/Vendas | Pausa, renovação, cancelamentos e estornos não executados | Formulários e confirmações correspondentes | As transições não gravadas permanecem validadas por código/teste. Cada tutorial informa a cobertura exata; não são resultados de execução nesta sessão. |
| Comunicações | Falhas operacionais e fila automática | Editor de campanha automática e acompanhamento manual, com zero envios | Tratar fila diária, erro de envio/atualização e retomada em cenário apropriado. A prévia e o acompanhamento manual foram confirmados. |
| Contratos e recibos | Experiência pública do signatário | Preparação de link da equipe; links públicos não abertos | Conferir em sessão própria de teste, sem links reais, as telas de leitura, aceite e assinatura. Nesta entrega os guias públicos são de código/teste. |
| Eventos | Registrar contato do participante | Lista de participantes, botão Registrar contato | Abrir o formulário e validar seus resultados específicos; contato comercial e contato sugerido foram inspecionados em seus módulos. |
| Prontuários | Arquivos e impressão/exportação | Arquivos e ficha do cliente fictício | Upload, gravação de áudio e arquivos exportados não foram exercitados; exportação JSON confirmada no código/teste. |
| Configurações/Perfis | Usuário comum/restrito | Novo usuário, permissões, sem salvar | Comparar menu e botões com uma sessão apropriada de usuário comum. Os testes fornecem a comparação da revisão. |
| Configurações | Filiais, feriados, integração, nomes e limites | Abas e formulários correspondentes | As alterações não realizadas estão apoiadas nas fontes; não foram criadas chaves nem alterada a configuração existente. |
| Meu perfil | Atualização e senha | Dados pessoais e Senha | Resultados confirmados no código/teste, sem alterar o usuário real ou digitar senha. |
| Publicação | Identificar revisão implantada | Site publicado | Obter evidência da versão implantada; a main consultada está registrada, mas a equivalência não foi demonstrada. |

## Referências fixadas na revisão

As definições abaixo atendem aos links de cada tutorial. Todas apontam para o mesmo SHA funcional consultado.

[fonte-1]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/AppointmentDetailsModal.tsx
[fonte-2]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/dashboard-appointment-actions.integration.test.tsx
[fonte-3]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/appointment-attendance.integration.test.tsx
[fonte-4]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/ScheduleBlockModal.tsx
[fonte-5]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/schedule-block-missing.integration.test.tsx
[fonte-6]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/AgendaNoteModal.tsx
[fonte-7]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/agenda-notes.spec.ts
[fonte-8]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/AppointmentRescheduleHistoryModal.tsx
[fonte-9]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/reschedule-history-modal.integration.test.tsx
[fonte-10]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/PendingFinalizationPage.tsx
[fonte-11]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/pending-finalization.integration.test.tsx
[fonte-12]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/CompletedAppointmentsPage.tsx
[fonte-13]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/auto-finalization.spec.ts
[fonte-14]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/communications/campaigns/CampaignSenderPage.tsx
[fonte-15]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/communications/campaigns.integration.test.tsx
[fonte-16]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/PatientModal.tsx
[fonte-17]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/patient-change-reason.integration.test.tsx
[fonte-18]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/PatientImportModal.tsx
[fonte-19]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/patient-import-incomplete.integration.test.tsx
[fonte-20]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/PatientExportModal.tsx
[fonte-21]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/patients-header-actions.integration.test.tsx
[fonte-22]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/guided-client-registration.integration.test.tsx
[fonte-23]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/LeadActivityModal.tsx
[fonte-24]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/extended-workflows.integration.test.tsx
[fonte-25]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/lead-contact-channel.integration.test.tsx
[fonte-26]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/LeadDetailsModal.tsx
[fonte-27]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/kanban-stage-moves.integration.test.tsx
[fonte-28]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/LeadLostModal.tsx
[fonte-29]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/lead-lost-reason.integration.test.tsx
[fonte-30]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/LeadImportModal.tsx
[fonte-31]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/lead-import.integration.test.tsx
[fonte-32]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/groups/GroupsPage.tsx
[fonte-33]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/groups.spec.ts
[fonte-34]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/groups/group-enrollment-cancel.integration.test.tsx
[fonte-35]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/groups/GroupSessionModal.tsx
[fonte-36]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/groups/GroupOperationsPanel.tsx
[fonte-37]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/groups/replacement-booking.integration.test.tsx
[fonte-38]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/waitlist/WaitlistEntryModal.tsx
[fonte-39]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/waitlist/waitlist-page.integration.test.tsx
[fonte-40]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/waitlist/WaitlistPage.tsx
[fonte-41]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/waitlist/WaitlistManageModal.tsx
[fonte-42]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/waitlist/waitlist-enroll.integration.test.tsx
[fonte-43]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/plans/SessionMovementsModal.tsx
[fonte-44]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/plans/plan-cancel-refund.integration.test.tsx
[fonte-45]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/plans/PlansPage.tsx
[fonte-46]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/plans-finance.spec.ts
[fonte-47]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/plans/PlanPauseModal.tsx
[fonte-48]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/plans/plan-pause.integration.test.tsx
[fonte-49]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/plans/PlanCancelModal.tsx
[fonte-50]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/plans/PlanModal.tsx
[fonte-51]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/plans/plan-payment-recurrence.integration.test.tsx
[fonte-52]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/ReceivableAdjustModal.tsx
[fonte-53]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/receivables-actions.spec.ts
[fonte-54]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/SettleModal.tsx
[fonte-55]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/split-settlement.integration.test.tsx
[fonte-56]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/payment-proofs.integration.test.tsx
[fonte-57]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/ReceiptModal.tsx
[fonte-58]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/receipt-signature-send.integration.test.tsx
[fonte-59]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/PayableModal.tsx
[fonte-60]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/payable-modal.integration.test.tsx
[fonte-61]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/RecurringPayableModal.tsx
[fonte-62]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/new-expense-modal.integration.test.tsx
[fonte-63]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/SupplierModal.tsx
[fonte-64]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/supplier-modal-flows.integration.test.tsx
[fonte-65]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/FinancePage.tsx
[fonte-66]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/workspace-flows.integration.test.tsx
[fonte-67]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/sales/ProductModal.tsx
[fonte-68]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/sales/inventory-tab.integration.test.tsx
[fonte-69]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/sales/NewSaleSection.tsx
[fonte-70]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/sales/sales-page.integration.test.tsx
[fonte-71]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/sales/SalesHistorySection.tsx
[fonte-72]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/sales-history-cards.spec.ts
[fonte-73]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/sales/InventorySection.tsx
[fonte-74]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/sales/SaleDetailsModal.tsx
[fonte-75]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/communications/campaigns/TemplateEditorModal.tsx
[fonte-76]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/communications/auto-campaigns/AutoCampaignEditorModal.tsx
[fonte-77]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/communications/auto-campaigns.integration.test.tsx
[fonte-78]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/relationship/ContactActivityModal.tsx
[fonte-79]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/relationship/grouped-suggestions.integration.test.tsx
[fonte-80]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/events/EventModal.tsx
[fonte-81]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/events.spec.ts
[fonte-82]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/events/EventParticipantModal.tsx
[fonte-83]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/events/event-participants.integration.test.tsx
[fonte-84]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/events/EventImportModal.tsx
[fonte-85]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/events/EventDetailPage.tsx
[fonte-86]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/events/event-export.integration.test.tsx
[fonte-87]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/events/EventConvertModal.tsx
[fonte-88]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/events/event-convert.integration.test.tsx
[fonte-89]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/contracts/DocumentsPage.tsx
[fonte-90]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/contracts.spec.ts
[fonte-91]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/contracts/SendForSignatureModal.tsx
[fonte-92]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/contracts/signature-link.integration.test.tsx
[fonte-93]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/contracts/PublicSignaturePage.tsx
[fonte-94]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/PublicReceiptSignaturePage.tsx
[fonte-95]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/public-signature.spec.ts
[fonte-96]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/contracts/CancelDocumentModal.tsx
[fonte-97]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/clinical/ClinicalChart.tsx
[fonte-98]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/clinical/workspace-flows.integration.test.tsx
[fonte-99]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/clinical/ClinicalAttachmentModal.tsx
[fonte-100]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/client-workspace.spec.ts
[fonte-101]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/clinical/AssessmentTemplateModal.tsx
[fonte-102]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/clinical/assessment-forms.integration.test.tsx
[fonte-103]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/clinical/ClinicalAssessmentModal.tsx
[fonte-104]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/reports/ReportsPage.tsx
[fonte-105]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/reports.spec.ts
[fonte-106]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/reports/FinancialLedger.tsx
[fonte-107]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/reports/financial-report.integration.test.tsx
[fonte-108]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/history/HistoryDetailsModal.tsx
[fonte-109]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/history/history-page.integration.test.tsx
[fonte-110]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/UserFormModal.tsx
[fonte-111]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/users-and-permissions.integration.test.tsx
[fonte-112]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/BranchModal.tsx
[fonte-113]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/branches.integration.test.tsx
[fonte-114]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/AdministrativeRegistrySection.tsx
[fonte-115]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/settings.spec.ts
[fonte-116]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/PlanTemplateModal.tsx
[fonte-117]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/single-plan-template.integration.test.tsx
[fonte-118]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/HolidaysContent.tsx
[fonte-119]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/PaymentMethodsContent.tsx
[fonte-120]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/NavTabLabelsContent.tsx
[fonte-121]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/nav-tab-labels.integration.test.tsx
[fonte-122]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/profile/ProfilePage.tsx
[fonte-123]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/profile/profile.integration.test.tsx
[fonte-124]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/docs/permissoes.md
[fonte-125]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/model.ts
[fonte-126]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/PatientsPage.tsx
[fonte-127]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/PatientDetailPage.tsx
[fonte-128]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/patients.spec.ts
[fonte-129]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/communications/campaigns/NewCampaignModal.tsx
[fonte-130]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/communications/auto-campaigns/AutoCampaignQueuePanel.tsx
[fonte-131]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/contracts/PublicSignatureLayout.tsx
[fonte-132]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/receipt-signature-tracking.integration.test.tsx
[fonte-133]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/payroll.integration.test.tsx
[fonte-134]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/IntegrationKeysContent.tsx
[fonte-135]: https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/settings/integration-keys.integration.test.tsx


