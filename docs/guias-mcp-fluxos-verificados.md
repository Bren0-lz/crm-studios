# Passo a passo de uso do CRM Organiza Studios

Revisão das fontes: `5e03ad9c1da1279154229546e583d82ae8104a40`

Os percursos abaixo foram exercitados na interface de `crm.organizastudios.com` em 24/11/2026, no Chromium, com uma conta de teste e registros fictícios. O menu também foi testado em tamanho de celular. Na Agenda, foram concluídos um agendamento experimental, uma remarcação e um agendamento com plano ativo. A revisão identifica o código usado para conferir as instruções. Cada guia indica as condições que mudam os passos.

As rodadas seguintes acrescentaram percursos executados no site com registros fictícios e testes locais para etapas que dependiam de cadastros antigos ou de um bot. Consulte o [relatório de validação](relatorio-validacao-mcp-2026-11-24.md) para ver as falhas observadas e o que foi confirmado em cada ambiente.

## AC01 · Entrar no CRM

1. Abra o [CRM Organiza Studios](https://crm.organizastudios.com/).
2. Se aparecer a tela de entrada, digite o endereço da sua conta em **E-mail**.
3. Digite a sua **Senha**.
4. Clique em **Entrar**.

Deu certo quando a tela de entrada dá lugar ao painel do CRM. Se o CRM já abrir no painel, a sessão está ativa. Se a tela de entrada continuar aberta com um aviso, confira o e-mail e digite a senha novamente.

**Perguntas:** Como entrar no CRM? | Como faço login? | Como acessar o sistema? | Onde entro no Organiza Studios? | Como faço para entrar no sistema?

**Fontes:**
- [Tela de entrada](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/auth/LoginPage.tsx)

## AC03 · Abrir o menu no celular e encontrar uma tela

1. Abra o CRM.
2. No celular, toque no ícone **Abrir menu** no alto da tela. No computador, use o menu lateral.
3. Toque no nome da tela que você quer abrir. Por exemplo, toque em **Clientes** para abrir a lista de clientes.
4. Confira o título da tela que abriu.

Se não encontrar um nome, confirme com o administrador se sua conta tem acesso ao módulo e qual nome ele usa no menu da clínica.

**Perguntas:** Como abrir o menu no celular? | Onde fica o menu no celular? | Como achar os módulos do CRM no celular? | Como encontrar o menu lateral? | O menu sumiu no celular?

**Fontes:**
- [Menu lateral e botão Abrir menu](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/app/Shell.tsx)

## AG02 · Agendar um atendimento individual

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda).
2. Clique em **Novo atendimento**.
3. Em **Cliente**, digite o nome e selecione o cadastro na lista.
4. Em **Tipo**, escolha a opção adequada. Para uma aula experimental, escolha **Experimental**.
5. Escolha o **Profissional**, a **Sala** e o **Serviço**. Se o tipo **Atendimento** pedir um **Plano**, escolha o plano que cobre o serviço. Se **Serviço** ficar bloqueado e aparecer o aviso de que o cliente está sem plano ativo, resolva a contratação antes de seguir. Quando sua conta tiver acesso, o aviso pode indicar **Vender plano avulso…**.
6. Clique em **Data** e selecione o dia no calendário.
7. Preencha **Horário** e confira a disponibilidade. Se o calendário continuar aberto, clique em **Fechar calendário**.
8. Clique em **Confirmar atendimento**.
9. Na Agenda, abra os detalhes do cartão e confira se ele aparece como **Agendado**, no dia e horário escolhidos.

**Perguntas:** Como agendar um atendimento? | Como marcar um horário para um cliente? | Como agendar uma aula experimental? | Como marcar atendimento na agenda? | Como faço para marcar um atendimento individual? | Por que o serviço está bloqueado no atendimento?

**Fontes:**
- [Abertura do formulário pela Agenda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaPage.tsx)
- [Tipo, plano, recursos, data e confirmação do agendamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentForm.tsx)
- [Teste do agendamento com plano e da remarcação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/e2e/agenda.spec.ts)

## AG05 · Consultar os detalhes de um atendimento na Agenda

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda).
2. Encontre o cartão do atendimento na data em que ele está marcado.
3. Clique no cartão do atendimento para abrir os detalhes.
4. Em **Detalhes do atendimento**, confira a situação e o horário. Se a seção **Dados do cliente** estiver disponível, use-a para conferir o cadastro vinculado.

Os dados do cliente disponíveis na janela dependem das permissões da sua conta.

**Perguntas:** Como ver os detalhes de um atendimento? | Onde confiro o horário de um atendimento? | Como saber se uma sessão está agendada? | Como abrir detalhes de um compromisso na agenda?

**Fontes:**
- [Cartão do atendimento na Agenda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaCard.tsx)
- [Detalhes do atendimento e dados do cliente](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentDetailsModal.tsx)

## AG07 · Remarcar um atendimento

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda).
2. Encontre o atendimento no dia em que ele está agendado e clique no cartão.
3. No painel **Detalhes do atendimento**, clique em **Remarcar atendimento**.
4. Na janela **Reagendar atendimento**, clique em **Data** e escolha o novo dia. Se só o horário mudar, mantenha a data.
5. Preencha o novo **Horário**. Se o calendário estiver aberto, clique em **Fechar calendário**.
6. Clique em **Confirmar reagendamento**. Se o sistema indicar um conflito, escolha outro horário disponível.
7. Confira na Agenda se o atendimento está no novo horário e se deixou de aparecer no horário antigo.

Esse caminho vale quando o botão **Remarcar atendimento** estiver disponível nos detalhes. O caso verificado manteve o mesmo atendimento com o horário atualizado.

**Perguntas:** Como remarcar um atendimento? | Como reagendar uma consulta? | Como trocar o horário de um atendimento? | Como mudar a data de um agendamento? | Como remarcar uma aula experimental já marcada? | Como mudar o horário de uma sessão?

**Fontes:**
- [Cartão que abre os detalhes na Agenda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaCard.tsx)
- [Ação Remarcar atendimento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentDetailsModal.tsx)
- [Formulário de reagendamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentRescheduleModal.tsx)
- [Teste da preservação do atendimento na remarcação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/e2e/agenda.spec.ts)

## CL01 · Localizar um cliente cadastrado

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes) no menu lateral.
2. No campo **Buscar por nome, CPF ou telefone**, digite o nome, o apelido, o CPF ou o telefone do cliente.
3. Clique em **Buscar**.
4. Confira o nome do cliente no resultado.

Se a lista estiver vazia, tente outro dado no mesmo campo. Se houver filtros ativos, abra **Filtros** e confira se a situação ou a etiqueta escolhida pode estar deixando o cadastro de fora.

**Perguntas:** Como localizar um cliente? | Como buscar um cliente cadastrado? | Como encontrar uma aluna sem mexer em nada? | Onde busco um cliente pelo CPF? | Como pesquisar um cliente pelo telefone? | Como localizar uma aluna sem mexer em nada? | Como encontro o cadastro de um aluno?

**Fontes:**
- [Busca e filtros de Clientes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientsPage.tsx)

## CL04 · Abrir a ficha de um cliente

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes).
2. Use **Buscar por nome, CPF ou telefone** para localizar a pessoa.
3. Clique no nome do cliente na lista.
4. Na ficha, escolha a aba que contém a informação. A conta pode ter acesso a **Agenda**, **Planos**, **Financeiro**, **Contratos**, **Prontuário** ou **Histórico**.

O nome do cliente aparece no topo da ficha. As abas disponíveis dependem das permissões da sua conta.

**Perguntas:** Como abro a ficha do cliente? | Como abrir o perfil de um cliente? | Onde fica a ficha de um aluno? | Como ver as abas da ficha do cliente? | Como abrir ficha cliente?

**Fontes:**
- [Entrada da ficha na lista de Clientes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientsPage.tsx)
- [Abas da ficha](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientRecordTabs.tsx)

## CL05 · Editar o cadastro de um cliente

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes) e localize o cliente.
2. Clique em **Editar** ao lado do cadastro. Na ficha, o botão é **Editar cadastro**.
3. Altere o campo desejado na janela **Editar cliente**.
4. Clique em **Salvar alterações**.
5. Abra o cadastro novamente e confira se a alteração foi guardada.

Se o formulário apontar campos obrigatórios, complete os campos indicados antes de salvar. A disponibilidade de **Editar** depende das permissões da sua conta.

**Perguntas:** Como editar um cliente? | Como mudar dados do cadastro do cliente? | Como trocar o apelido de um aluno? | Como corrigir os dados de um cliente? | Como alterar o telefone do cliente? | Como editar um cadastro existente?

**Fontes:**
- [Ação de edição na lista de Clientes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientsPage.tsx)
- [Ação de edição na ficha](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientDetailPage.tsx)
- [Formulário de edição e salvamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientModal.tsx)

## CL13 · Inativar ou reativar um cadastro de cliente

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes).
2. Localize a pessoa e clique no nome para abrir a ficha.
3. Para inativar, clique em **Inativar cliente** na ficha. A situação muda ao clicar.
4. Confira o aviso de inativação. O botão muda para **Reativar cliente**.

Para reativar, abra a ficha do cliente inativo e clique em **Reativar cliente**. Se precisar encontrar a ficha na lista, abra **Filtros** e selecione **Inativos** na seção **Situação**. Na ficha reativada, volta a aparecer **Inativar cliente**. A opção de inativar ou reativar depende de acesso à edição de clientes.

**Perguntas:** Como inativar um cliente? | Como reativar um cliente? | Como deixar um cadastro inativo? | Como voltar um cadastro para ativo? | Onde desativo o cadastro de um aluno?

**Fontes:**
- [Ações e resultado da mudança de situação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientDetailPage.tsx)
- [Filtro de clientes inativos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientsPage.tsx)

## EV01 · Localizar um evento e abrir a sua lista de participantes

1. Abra [**Eventos**](https://crm.organizastudios.com/eventos).
2. Procure o nome em **Eventos cadastrados**. Se estiver usando o filtro **Serviço**, escolha **Todos os serviços** para ver novamente a lista completa.
3. Na linha do evento, clique em **Participantes**.
4. Confira o nome do evento no topo da tela e a seção **Participantes**.

**Perguntas:** Como abrir um evento? | Como localizar um evento já cadastrado? | Onde vejo os participantes de um evento? | Como abrir a lista de participantes do evento? | Como filtrar eventos por serviço?

**Fontes:**
- [Lista, filtro por Serviço e atalho Participantes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventsPage.tsx)
- [Tela de detalhes do evento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventDetailPage.tsx)

## EV02 · Cadastrar um evento

1. Abra [**Eventos**](https://crm.organizastudios.com/eventos).
2. Clique em **Novo evento**.
3. Preencha **Nome do evento**.
4. Preencha **Data e horário** no fuso que aparece no formulário.
5. Confira **Unidade**. Escolha uma unidade ou mantenha **Toda a rede**, conforme o alcance do evento.
6. Se necessário, preencha **Serviço**, **Local ou cidade**, **Público estimado** e **Observações**.
7. Clique em **Salvar evento**.
8. Confira se o cartão com o nome do evento aparece na lista.

**Perguntas:** Como cadastrar um evento? | Como criar um evento comercial? | Como adicionar um novo evento? | Onde cadastro um evento? | Como faço para registrar um evento?

**Fontes:**
- [Lista e ação Novo evento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventsPage.tsx)
- [Campos e salvamento do evento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventModal.tsx)

## EV03 · Editar um evento já cadastrado

1. Abra [**Eventos**](https://crm.organizastudios.com/eventos).
2. Em **Eventos cadastrados**, localize o evento.
3. Clique em **Editar** ao lado do evento.
4. Na janela **Editar evento**, altere os dados desejados, como **Local ou cidade**.
5. Clique em **Salvar evento**.
6. Confira os novos dados na lista.

A disponibilidade de **Editar** depende das permissões da sua conta.

**Perguntas:** Como editar um evento? | Como mudar o local de um evento? | Como alterar a data de um evento? | Como corrigir os dados de um evento já cadastrado?

**Fontes:**
- [Ação Editar na lista de eventos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventsPage.tsx)
- [Preenchimento e salvamento na edição](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventModal.tsx)

## EV05 · Adicionar um participante a um evento existente

1. Abra [**Eventos**](https://crm.organizastudios.com/eventos).
2. Na linha do evento, clique em **Participantes**.
3. Na tela do evento, clique em **Adicionar participante**.
4. Informe o **Nome completo** e os dados de contato que tiver à disposição. O formulário informa que todos os campos são opcionais.
5. Na janela, clique em **Adicionar participante**.
6. Confira se a pessoa aparece na lista do evento.

A janela informa a origem com que o participante entra no CRM comercial. Contatos já cadastrados também podem participar.

**Perguntas:** Como adicionar um participante ao evento? | Como colocar uma pessoa em um evento já criado? | Onde incluo alguém na lista do evento? | Como cadastrar um participante de evento?

**Fontes:**
- [Ação de inclusão na tela do evento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventDetailPage.tsx)
- [Formulário de participante](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventParticipantModal.tsx)

## EV06 · Buscar um participante dentro de um evento

1. Abra [**Eventos**](https://crm.organizastudios.com/eventos).
2. Clique em **Participantes** no evento desejado.
3. Na lista, digite o nome, telefone ou e-mail no campo **Buscar por nome, telefone ou e-mail**.
4. Confira o resultado enquanto digita. Se precisar, refine por **Status**.
5. Se aparecer **Nenhum participante encontrado**, limpe a busca e confira se **Status** está em **Todos**.

O campo de busca aparece quando o evento já tem participantes.

**Perguntas:** Como buscar um participante de evento? | Como encontrar uma pessoa na lista de participantes? | Onde pesquiso o nome de alguém inscrito no evento? | Como filtrar participantes do evento?

**Fontes:**
- [Busca, filtro de status e mensagem sem resultados](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventDetailPage.tsx)

## FI11 · Criar uma conta a receber manual

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro).
2. Clique em **Lançamentos**.
3. Clique em **Nova conta a receber**.
4. Em **Cliente**, digite o nome e selecione o cadastro.
5. Preencha **Descrição** e **Valor (R$)**.
6. Confira **Vencimento** e **Competência**. A competência é o mês ao qual a receita pertence.
7. Se precisar classificar o lançamento, escolha **Categoria** e **Centro de custo**.
8. Clique em **Salvar lançamento**.
9. Abra **Contas a receber** e confira se aparece a descrição que você cadastrou.

O lançamento registra o valor a receber. Quando o dinheiro entrar, use **Dar baixa** para registrar o recebimento.

**Perguntas:** Como criar uma conta a receber? | Como lançar uma receita manual? | Como cadastrar uma cobrança manual? | Como faço um lançamento a receber? | Como adicionar uma conta a receber no financeiro?

**Fontes:**
- [Abas de Financeiro](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinancePage.tsx)
- [Formulário de lançamento manual](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinanceClassificationPanel.tsx)

## FI06 · Estornar a baixa de uma parcela paga

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro).
2. Clique em **Contas a receber**.
3. Localize a parcela paga e confira cliente, descrição e valor.
4. Na linha da parcela, clique em **Mais**.
5. Clique em **Estornar**.
6. Na janela **Estornar pagamento**, confira o valor e a forma de pagamento exibidos.
7. Preencha **Motivo**.
8. Clique em **Estornar pagamento**.

A parcela volta a ficar em aberto, o recebimento sai do caixa e o botão **Dar baixa** volta a aparecer. A janela informa que a ação não pode ser desfeita. Se **Estornar** estiver ausente, confira se a parcela está paga e se sua conta tem a permissão para estornar recebimentos.

**Perguntas:** Como estornar o recebimento de uma parcela? | Como estornar um pagamento de cliente? | Como desfazer a baixa de uma parcela? | Como cancelar uma baixa no contas a receber? | Como reabrir uma parcela que marquei como paga? | Como estornar parcela paga?

**Fontes:**
- [Ações da parcela em Contas a receber](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReceivablesList.tsx)
- [Confirmação, motivo obrigatório e efeito do estorno](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReversePaymentModal.tsx)

## GR04 · Matricular um cliente em uma turma com vaga

1. Abra [**Turmas**](https://crm.organizastudios.com/turmas).
2. Clique em **Matricular cliente**.
3. Na janela **Nova matrícula**, selecione em **Turma** a turma que tem vaga.
4. Em **Cliente**, digite o nome e selecione o cadastro correto.
5. Confira ou ajuste **Início da matrícula**.
6. Clique em **Matricular**.
7. No cartão da turma, clique em **Abrir turma** e confira se o nome aparece como **Matriculado**.

Se a escolha mostrar **turma cheia (lista de espera)** ou o botão mudar para **Colocar na lista de espera**, essa turma está sem vaga. Volte à seleção para escolher outra turma com vaga ou siga o fluxo de espera se for o que deseja.

**Perguntas:** Como matricular um aluno quando tem vaga? | Como matricular um cliente? | Como colocar um aluno em uma turma com vaga? | Como faço uma matrícula em turma? | Como incluir cliente em turma com vagas livres? | Como matricular um cliente numa turma?

**Fontes:**
- [Seleção da turma, do cliente e confirmação da matrícula](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupsPage.tsx)
- [Situação da matrícula nos detalhes da turma](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupDetailsModal.tsx)

## PL04 · Contratar uma sessão avulsa pela ficha do cliente

Este caminho vale para um cliente existente e um plano avulso já disponível no catálogo.

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes).
2. Localize o cliente e clique no nome para abrir a ficha.
3. Abra a aba **Planos**.
4. Clique em **Plano avulso**.
5. Na janela **Novo plano avulso**, escolha a opção em **Plano cadastrado**.
6. Confira o serviço, o número de sessões e o **Valor total**.
7. Confira **Início**, **Fim da validade**, a forma de pagamento e o **Primeiro vencimento**.
8. Clique em **Criar plano e parcelas**.
9. Confira o novo cartão na aba **Planos** e a cobrança na aba **Financeiro**.

Se a lista **Plano cadastrado** estiver vazia, confira com quem administra o catálogo se há um plano avulso disponível. A contratação cria o saldo e as contas a receber.

**Perguntas:** Como vender uma sessão avulsa para um cliente? | Como fazer um plano avulso na ficha? | Como contratar um plano avulso para um cliente existente? | Como vender atendimento avulso?

**Fontes:**
- [Ação Plano avulso na ficha](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientRecordTabs.tsx)
- [Janela e registro da contratação avulsa](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientPlanModal.tsx)
- [Campos e ação de criar plano e parcelas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlanForm.tsx)

## PL11 · Consultar planos e parcelas na ficha do cliente

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes).
2. Localize o cliente e clique no nome para abrir a ficha.
3. Abra **Planos** para ver as contratações. Para consultar os movimentos de um plano, use **Extrato** no cartão.
4. Abra **Financeiro** para ver as parcelas do mesmo cliente. Confira descrição, vencimento, valor e situação.
5. Se precisar abrir a tela completa, use **Abrir em Planos** ou **Abrir no Financeiro** na aba correspondente.

A exibição das duas abas depende das permissões da sua conta. A ficha mostra uma mensagem quando o cliente ainda não tem plano ou parcela.

**Perguntas:** Como ver os planos e pagamentos do cliente? | Onde vejo as parcelas na ficha do cliente? | Como consultar as contratações de um aluno? | Onde vejo os planos contratados na ficha? | Como ver as cobranças desse cliente?

**Fontes:**
- [Planos e parcelas na ficha do cliente](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientRecordTabs.tsx)

## RL01 · Escolher o período e consultar a visão geral dos relatórios

1. Abra [**Relatórios**](https://crm.organizastudios.com/relatorios).
2. Em **Período de análise**, escolha um atalho como **Este mês** ou **Mês passado**. O atalho aplica o período na hora.
3. Para escolher datas específicas, preencha **De** e **Até**, depois clique em **Atualizar**.
4. Abra a aba **Visão geral**.
5. Confira o intervalo exibido abaixo de **Período de análise** e leia os quadros da seção.

Se **Atualizar** estiver desativado, confira se as duas datas estão preenchidas e se **De** é igual ou anterior a **Até**. As seções disponíveis dependem das permissões da conta.

**Perguntas:** Como consultar relatórios por período? | Como vejo os números do mês? | Como mudar o período nos relatórios? | Como consultar o resumo do mês passado? | Como escolher o intervalo do relatório? | Como ver a visão geral dos relatórios?

**Fontes:**
- [Atalhos, datas e seções de relatórios](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ReportsPage.tsx)
- [Navegação entre seções](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ReportTabs.tsx)

## AC02 · Sair do CRM e encerrar sessões em outros dispositivos

1. No rodapé do menu lateral, clique no menu com o seu nome.
2. Clique em **Sair** para encerrar a sessão deste navegador.
3. Para encerrar todos os acessos da sua conta, use **Sair de todos os dispositivos** no rodapé do menu.
4. Leia a confirmação e clique em **Encerrar acessos**.

A tela de entrada volta a aparecer. **Encerrar acessos** também encerra sua sessão atual. No celular, abra primeiro o menu lateral.

**Perguntas:** Como sair do CRM? | Como desconectar do sistema? | Como sair de todos os dispositivos? | Como encerrar as sessões da minha conta?

**Fontes:**
- [Menu de usuário e ação Sair](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/app/Shell.tsx)
- [Confirmação para encerrar todas as sessões](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/shared/auth/RevokeSessionsButton.tsx)

## AC04 · Selecionar a filial de trabalho

1. No cabeçalho do CRM, abra o seletor **Filial ativa**.
2. Clique no nome da filial em que vai trabalhar.
3. Confira o nome selecionado no cabeçalho após a tela atualizar.
4. Para consultar o conjunto de filiais disponíveis, escolha **Todas as filiais**.

O seletor aparece quando sua conta tem acesso a pelo menos duas filiais ativas. Confira a filial antes de salvar registros como agendamentos ou lançamentos financeiros.

**Perguntas:** Como trocar de filial? | Onde seleciono a filial ativa? | Como voltar para Todas as filiais?

**Fontes:**
- [Seletor e condições de exibição](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/app/BranchSelector.tsx)
- [Atualização da tela na troca de filial](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/app/Shell.tsx)

## AC05 · Abrir a tela de origem de uma notificação

1. No alto do CRM, clique no sino **Notificações**.
2. Leia os grupos de pendências e o número ao lado de cada um.
3. Clique no grupo que quer consultar.

Deu certo quando abre a tela relacionada ao aviso. Por exemplo, **Tarefas comerciais vencidas** abre **CRM comercial**. Os grupos do cabeçalho também funcionam como atalhos quando estiverem em destaque.

**Perguntas:** Como abrir uma pendência pelo sino? | Onde vejo as notificações do CRM? | Como abrir uma tarefa comercial vencida pelo sino?

**Fontes:**
- [Sino e atalhos de pendências](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/app/Shell.tsx)
- [Grupos de notificações e destinos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/app/notification-center.tsx)

## AC06 · Alterar as preferências de notificações

1. No alto do CRM, abra **Notificações** pelo sino.
2. Clique em **Configurar**.
3. Use **Mostrar** para escolher quais grupos aparecem no sino.
4. Use **Destacar** para escolher quais grupos podem aparecer no cabeçalho.
5. Ajuste os avisos na tela, o som e o intervalo de verificação conforme preferir.
6. Clique em **Salvar preferências**.

A alteração vale para a sua conta. Para conferir, abra **Configurar** novamente e veja se as opções ficaram como você escolheu.

**Perguntas:** Como configurar as notificações? | Como desligar o som das notificações? | Como escolher o que aparece no sino?

**Fontes:**
- [Configuração e salvamento das preferências](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/app/NotificationSettingsModal.tsx)

## AC07 · Usar o SOS e consultar os serviços de atendimento

1. No cabeçalho do CRM, clique em **SOS**.
2. Para consultar um contato de emergência, digite o nome do cliente no campo **Cliente**.
3. Selecione o cadastro que corresponde à pessoa.
4. Leia a seção **Contato de emergência**. Para encontrar os números de atendimento público, consulte **Serviços de atendimento** na mesma janela.

Quando o cadastro tem contato de emergência, o SOS mostra o nome e os canais disponíveis.

**Perguntas:** Onde fica o SOS? | Como procurar um cliente no SOS? | Onde estão os serviços de atendimento no SOS?

**Fontes:**
- [Busca de clientes e serviços no SOS](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/shared/components/EmergencyButton.tsx)

## VG01 · Consultar o resumo do dia e abrir a Agenda

1. Abra [**Visão geral**](https://crm.organizastudios.com/) no menu lateral.
2. Selecione a aba **Resumo do dia**.
3. Veja os compromissos no bloco **Agenda de hoje**.
4. Clique em **Ver agenda** para abrir a Agenda completa.

A tela **Agenda** abre no dia atual. O painel pode mostrar atendimentos individuais e encontros de turma.

**Perguntas:** Onde vejo os horários de hoje? | Como vejo a agenda de hoje pelo painel? | Como abrir a agenda do dia pela Visão geral?

**Fontes:**
- [Resumo e atalho para a Agenda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/dashboard/DashboardPage.tsx)

## VG02 · Abrir uma pendência pelo painel inicial

1. Abra [**Visão geral**](https://crm.organizastudios.com/).
2. Leia os grupos de pendências em destaque no alto da tela.
3. Clique no grupo que deseja tratar, como **Parcelas vencidas**.
4. Confira o grupo ou o filtro que abriu na tela de destino.

Para **Parcelas vencidas**, confira se o **Financeiro** abriu em **Contas a receber**, com **Vencidas** selecionado. Os grupos exibidos dependem das pendências e das preferências da sua conta.

**Perguntas:** Como tratar as pendências do painel? | Onde vejo parcelas vencidas na Visão geral? | Como abrir um alerta do painel inicial?

**Fontes:**
- [Alertas do cabeçalho e suas ações](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/app/NotificationAlerts.tsx)
- [Destino do alerta de parcelas vencidas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/app/notification-center.tsx)

## VG03 · Iniciar um atendimento pela Visão geral

1. Abra [**Visão geral**](https://crm.organizastudios.com/).
2. Clique em **Novo atendimento** no alto do painel.
3. Na janela **Novo atendimento**, selecione o cliente e o tipo de atendimento.
4. Continue o preenchimento de profissional, sala, serviço, data e horário na Agenda.

O atalho abre o formulário de agendamento. Para concluir o cadastro, siga o guia **Agendar um atendimento individual**.

**Perguntas:** Como iniciar um atendimento pelo painel? | Onde fica Novo atendimento na Visão geral? | Como abrir o agendamento a partir da tela inicial?

**Fontes:**
- [Atalho do painel](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/dashboard/DashboardPage.tsx)
- [Abertura do formulário de agendamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaPage.tsx)

## VG04 · Ver clientes sem retorno e aniversariantes no painel

1. Abra [**Visão geral**](https://crm.organizastudios.com/).
2. Na aba **Resumo do dia**, procure **Clientes sem retorno**.
3. Consulte o bloco **Aniversariantes** para ver os aniversários do dia.
4. Para ver mais opções de contato, clique em **Ver contatos sugeridos**.

O atalho abre **Contatos sugeridos**. A lista depende dos clientes e das datas que o sistema encontrou.

**Perguntas:** Onde vejo aniversariantes no painel? | Como encontro clientes sem retorno na Visão geral? | Como abrir Contatos sugeridos a partir do painel?

**Fontes:**
- [Bloco de clientes sem retorno](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/dashboard/DashboardPage.tsx)
- [Bloco de aniversariantes e atalho](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/dashboard/BirthdayDashboardCard.tsx)

## VG05 · Consultar pendências de campanhas automáticas pelo painel

1. Abra [**Visão geral**](https://crm.organizastudios.com/).
2. Selecione a aba **Campanhas automáticas**.
3. Veja o total do dia no bloco **Mensagens para enviar**.
4. Clique em **Atualizar** para conferir a fila novamente.
5. Use **Configurar campanhas** se precisar abrir a configuração das campanhas em **Comunicações**.

Quando o painel mostra **0 pendentes hoje**, a fila do dia está vazia.

**Perguntas:** Onde vejo as mensagens automáticas pendentes hoje? | Como abro a fila de campanhas automáticas no início? | Como atualizar as pendências de campanhas no painel?

**Fontes:**
- [Aba de campanhas no painel](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/dashboard/DashboardPage.tsx)

## AG01 · Navegar e filtrar a Agenda

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda).
2. Selecione **Dia**, **Semana** ou **Mês**. Em **Dia**, use **Grade** ou **Lista**.
3. Use as setas ao lado da data para avançar ou voltar. Clique em **Hoje** para retornar à data atual.
4. Use **Profissional** para escolher quem aparece na agenda.
5. Marque **Mostrar cancelados** se quiser ver esses atendimentos. Use **Mostrar notas** para controlar a exibição das notas.

Confira o período exibido no alto da agenda. No celular, abra **Filtros** para ver as opções recolhidas.

**Perguntas:** Como navegar na agenda? | Como filtrar a agenda por profissional? | Como mostrar as notas na agenda? | Como trocar a agenda para semana ou mês?

**Fontes:**
- [Navegação, visualizações e filtros da Agenda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaPage.tsx)
- [Teste da apresentação dos filtros no celular](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/e2e/agenda-mobile-filters.spec.ts)

## AG03 · Agendar uma série de atendimentos

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda) e clique em **Novo atendimento**.
2. Escolha **Cliente** e um **Tipo** que permita repetição.
3. Marque **Repetir este atendimento** e preencha **Número de ocorrências** e **Intervalo**.
4. Escolha profissional, sala e serviço. Informe plano se o atendimento pedir.
5. Selecione a primeira **Data** e o **Horário**. Revise os avisos de disponibilidade.
6. Clique em **Confirmar atendimento**.

Confira o cartão na primeira data e nas datas seguintes. A opção de repetição fica indisponível para o tipo **Experimental**.

**Perguntas:** Como agendar atendimentos recorrentes? | Como marcar o mesmo atendimento em várias semanas?

**Fontes:**
- [Campos de repetição e confirmação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentForm.tsx)
- [Visualização das ocorrências na Agenda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaPage.tsx)

## AG04 · Cadastrar um cliente durante um agendamento

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda) e clique em **Novo atendimento**.
2. Clique no campo **Cliente** e use **Adicionar cliente**, abaixo das sugestões.
3. Em **Novo cliente**, preencha os campos obrigatórios e clique em **Salvar cliente**.
4. Confira o nome que ficou selecionado em **Cliente** e continue o agendamento.

O formulário da Agenda permanece aberto com o novo cliente selecionado.

**Perguntas:** Como cadastrar um cliente sem sair do agendamento? | Onde fica Adicionar cliente na Agenda?

**Fontes:**
- [Campo Cliente do agendamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentForm.tsx)
- [Janela de cadastro e retorno à Agenda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentPatientCreateModal.tsx)

## AG06 · Editar os dados de um atendimento na Agenda

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda).
2. Clique no cartão do atendimento agendado ou confirmado.
3. Em **Detalhes do atendimento**, clique em **Editar**.
4. Ajuste **Serviço**, **Sala** ou **Observação**, conforme o que o formulário permite.
5. Clique em **Salvar alterações**.

Abra os detalhes para conferir o que ficou salvo. Para mudar data, horário ou profissional, use **Remarcar atendimento**. Se o aviso disser que só atendimentos agendados ou confirmados podem ser editados, recarregue a Agenda e confira a situação atual.

**Perguntas:** Como editar um atendimento? | Como alterar a observação de um atendimento? | Como mudar o serviço ou a sala de um atendimento?

**Fontes:**
- [Ação de edição em Detalhes do atendimento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentDetailsModal.tsx)
- [Campos, confirmação e validação da edição](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentEditModal.tsx)

## AG09 · Confirmar presença em um atendimento

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda).
2. Localize o atendimento com situação **Agendado**.
3. Clique no cartão para abrir **Detalhes do atendimento**.
4. Clique em **Confirmar presença**.

O cartão passa a mostrar **Confirmado**. Se precisar conferir, abra os detalhes novamente depois que a janela se fechar.

**Perguntas:** Como confirmar a presença de um cliente? | Como marcar o atendimento como confirmado? | Onde confirmo a sessão na Agenda?

**Fontes:**
- [Ação Confirmar presença e condições](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentDetailsModal.tsx)

## AG10 · Registrar falta em um atendimento

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda) e localize o atendimento.
2. Clique no cartão para abrir **Detalhes do atendimento**.
3. Quando a ação estiver disponível, clique em **Marcar falta**.
4. Preencha **Motivo (opcional)** se precisar.
5. Clique em **Registrar falta**.

O atendimento passa para **Não compareceu**. A tela informa que a falta não consome sessão do plano. Se o botão estiver desativado, confira o horário de liberação indicado nos detalhes.

**Perguntas:** Como registrar falta na agenda? | Como marcar que o cliente não compareceu? | Onde marco falta em um atendimento?

**Fontes:**
- [Ação e confirmação da ausência](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentDetailsModal.tsx)

## AG11 · Finalizar um atendimento individual

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda) e selecione o cartão do atendimento.
2. Em **Detalhes do atendimento**, confira a situação e o horário.
3. Quando a ação estiver disponível, clique em **Marcar como realizado**.

O cartão passa a indicar **Finalizado**. Se a ação estiver desativada, confira a informação de horário nos detalhes.

**Perguntas:** Como finalizar atendimento individual? | Onde marco um atendimento como realizado?

**Fontes:**
- [Detalhes e ação de finalizar](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentDetailsModal.tsx)

## AG12 · Agendar reposição a partir de uma falta

1. Em **Agenda**, abra o dia do atendimento original e clique no cartão do cliente marcado como **Faltou**.
2. Nos **Detalhes do atendimento**, clique em **Remarcar ausência**.
3. Em **Reagendar atendimento**, confirme o profissional e a sala, escolha a **Data** e um **Horário** disponível.
4. Clique em **Confirmar reagendamento**. Abra o dia de destino na Agenda e confira o novo atendimento.

O atendimento original continua com a falta registrada. Cada falta pode ter uma remarcação ativa vinculada. Se a falta for de uma experimental e o cliente já tiver plano do mesmo serviço, o CRM recusa a reposição como experimental.

**Perguntas:** Como remarcar uma falta na agenda? | Onde agendo reposição para uma falta individual?

**Fontes:**
- [Detalhes e ações do atendimento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentDetailsModal.tsx)
- [Formulário de reagendamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentRescheduleModal.tsx)

## AG13 · Bloquear um horário de um profissional ou de uma sala

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda).
2. Clique em **Bloquear horário**. No celular, procure a opção em **Mais**.
3. Em **Tipo**, escolha **Profissional** ou **Sala**.
4. Em **Recurso**, selecione quem ou o que ficará indisponível.
5. Preencha **Início**, **Término** e **Motivo**.
6. Clique em **Criar bloqueio**.

Confira o aviso **Bloqueio criado.** Para localizar o bloqueio pelo motivo, vá ao dia correspondente e escolha **Lista**. Se precisar, recarregue a página e volte ao mesmo dia.

**Perguntas:** Como bloquear um horário na agenda? | Como bloquear a agenda de um profissional? | Como reservar um período indisponível em uma sala?

**Fontes:**
- [Criação do bloqueio e aviso](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaPage.tsx)
- [Campos do bloqueio](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/ScheduleBlockModal.tsx)

## AG14 · Cancelar um bloqueio de horário

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda) e vá ao dia do bloqueio.
2. Selecione **Dia** e **Lista**.
3. Localize o bloqueio pelo motivo e pelo horário.
4. Na linha do bloqueio, clique em **Cancelar bloqueio**.
5. Confira o período da confirmação e clique em **Confirmar**.

O bloqueio deixa de aparecer na agenda e o período volta a ficar disponível para novos agendamentos.

**Perguntas:** Como cancelar um bloqueio na agenda? | Como liberar um horário que bloqueei? | Onde desfaço um bloqueio de sala?

**Fontes:**
- [Ação no cartão do bloqueio](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/ScheduleBlockCard.tsx)
- [Confirmação e efeito do cancelamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/CancelBlockModal.tsx)

## AG15 · Criar uma nota na Agenda

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda).
2. Clique em **Nova nota**. No celular, procure a opção em **Mais**.
3. Preencha **Descrição**, **Data**, **Hora inicial** e **Hora final**.
4. Escolha **Cor do fundo** e, em **Para quem mostrar**, indique quem pode ver a nota. Se escolher **Profissional atual**, confira o campo **Profissional**.
5. Clique em **Salvar nota**.

A nota aparece no dia e no horário escolhidos, com **Mostrar notas** ativo. Ela registra um lembrete na Agenda.

**Perguntas:** Como criar uma nota na agenda? | Como colocar uma anotação na agenda? | Como adicionar um lembrete simples na agenda?

**Fontes:**
- [Formulário de nota na Agenda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaNoteModal.tsx)
- [Teste de criação e exibição da nota](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/e2e/agenda-notes.spec.ts)

## AG16 · Criar uma nota recorrente na Agenda

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda) e clique em **Nova nota**.
2. Preencha a descrição, a data inicial, os horários e a visibilidade da nota.
3. Marque **Repetir nota**.
4. Em **Repetir até**, informe a última data do período.
5. Em **Dias da semana**, marque os dias em que a nota deve aparecer.
6. Clique em **Salvar nota**.

Confira a nota no dia inicial e em outra data da série, com **Mostrar notas** ativo. O formulário aceita até 120 ocorrências, incluindo a primeira nota.

**Perguntas:** Como repetir uma nota na agenda? | Como criar uma nota recorrente? | Como colocar a mesma nota em várias semanas?

**Fontes:**
- [Campos da repetição e limite de ocorrências](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaNoteModal.tsx)

## AG17 · Editar uma nota ou uma série de notas da Agenda

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda) no dia da nota, com **Mostrar notas** ativo.
2. Clique no cartão da nota.
3. Na janela de detalhes, clique em **Editar**.
4. Altere os campos que precisar.
5. Em uma nota recorrente, escolha em **Aplicar a** se a alteração vale para **Só esta** ou **Esta e as próximas**.
6. Clique em **Salvar nota**.

Confira a nota alterada na Agenda. Se aplicou às próximas ocorrências, confira também uma das datas seguintes.

**Perguntas:** Como editar uma nota da agenda? | Como alterar as próximas notas recorrentes? | Como editar só uma ocorrência de uma nota?

**Fontes:**
- [Ação Editar no detalhe da nota](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaNoteDetailsModal.tsx)
- [Edição e escolha das ocorrências](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaNoteModal.tsx)

## AG18 · Excluir uma nota ou suas repetições da Agenda

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda) no dia da nota, com **Mostrar notas** ativo.
2. Clique no cartão da nota e depois em **Excluir**.
3. Se a nota for recorrente, escolha **Só esta** ou **Esta e as próximas** em **Aplicar a**.
4. Clique em **Confirmar exclusão**.

Confira se a nota saiu do dia. Se excluiu as próximas ocorrências, abra uma data seguinte da série para confirmar.

**Perguntas:** Como excluir uma nota da agenda? | Como apagar as repetições de uma nota? | Como apagar só uma ocorrência da nota?

**Fontes:**
- [Exclusão e escolha das ocorrências](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaNoteDetailsModal.tsx)

## AG19 · Consultar o histórico de remarcações

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda) e localize o atendimento.
2. Para ver as ações na programação diária, use **Dia → Lista**.
3. Abra **Mais ações** no cartão e clique em **Histórico**.
4. Na janela **Histórico de reagendamentos**, confira as datas e os horários registrados.

O histórico permite identificar a mudança sem editar o atendimento.

**Perguntas:** Onde vejo o histórico de remarcações? | Como descubro o horário antigo de um atendimento remarcado?

**Fontes:**
- [Ações do cartão na Agenda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaCard.tsx)
- [Janela de histórico](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentRescheduleHistoryModal.tsx)

## AG20 · Filtrar e finalizar atendimentos pendentes

1. Na [**Agenda**](https://crm.organizastudios.com/agenda), abra o aviso **Atendimentos a finalizar** quando ele aparecer.
2. Na lista, ajuste **Profissional**, **Serviço**, **Situação** ou o intervalo de datas.
3. Confira o nome e horário. Marque a caixa do atendimento correto.
4. Clique em **Marcar como realizados** ou em **Marcar falta**, conforme o que ocorreu.
5. Confira a confirmação e conclua o registro.

O atendimento sai da lista de pendências. Você pode abrir **Ver concluídos** para consultar o registro correspondente.

**Perguntas:** Como finalizar os atendimentos pendentes? | Onde filtro a lista A finalizar?

**Fontes:**
- [Destino do aviso](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/app/notification-center.tsx)
- [Filtros, seleção e finalização](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/PendingFinalizationPage.tsx)

## AG21 · Consultar atendimentos concluídos na Agenda

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda).
2. No alto da página, clique em **Concluídos**.
3. Selecione um atalho em **Período**, como **Hoje** ou **7 dias**. Em **Personalizado**, informe **De** e **Até**.
4. Use **Profissional**, **Serviço** ou **Origem** para refinar os resultados.
5. Selecione o atendimento para consultar os detalhes disponíveis.

Confira se o atendimento aparece em **Atendimentos concluídos** no período escolhido.

**Perguntas:** Onde vejo os atendimentos concluídos? | Como consultar atendimentos finalizados hoje? | Como filtrar a lista de atendimentos concluídos?

**Fontes:**
- [Atalho Concluídos na Agenda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaPage.tsx)
- [Seleção de período e filtros](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/CompletedAppointmentsPage.tsx)

## AG22 · Preparar o compartilhamento da Agenda pelo WhatsApp

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda) e clique em **Compartilhar agenda**.
2. Selecione o **Profissional**.
3. Preencha o período em **De** e **Até**.
4. Confira o **WhatsApp do profissional**. Se estiver vazio, informe o número com DDD.
5. Leia a prévia em **Mensagem**.
6. Clique em **Enviar pelo WhatsApp** e revise a conversa aberta antes de enviar.

A Agenda prepara uma mensagem com a programação do profissional no período escolhido.

**Perguntas:** Como compartilhar a agenda? | Como mandar a agenda do profissional por WhatsApp? | Onde preparo uma mensagem com os horários da agenda?

**Fontes:**
- [Janela, prévia e link de WhatsApp](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/ShareAgendaModal.tsx)

## AG23 · Abrir uma aula de turma pela Agenda

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda) e vá ao dia da aula.
2. Selecione **Dia** e **Lista**.
3. Em **Programação do dia**, encontre o cartão **Aula em grupo** e confira a turma e o horário.
4. Clique em **Abrir encontro**.

O CRM abre **Turmas** com o encontro selecionado. A ação depende de acesso ao módulo **Turmas**.

**Perguntas:** Como abrir uma aula pela agenda? | Onde fica Abrir encontro na agenda? | Como ir da Agenda para os detalhes da aula de turma?

**Fontes:**
- [Cartão de aula e atalho Abrir encontro](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/GroupSessionCard.tsx)
- [Abertura do encontro indicado pela Agenda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupsPage.tsx)

## AG24 · Registrar uma pesquisa de satisfação no atendimento

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda) e selecione o atendimento realizado.
2. Em **Detalhes do atendimento**, clique em **Registrar satisfação**.
3. Escolha uma **Nota** de 0 a 10 e preencha **Comentário (opcional)** se precisar.
4. Clique em **Salvar avaliação**.

O CRM fecha a pesquisa depois de registrar a avaliação para aquele cliente e atendimento.

**Perguntas:** Como registrar satisfação em um atendimento? | Onde lanço a nota de NPS da sessão?

**Fontes:**
- [Entrada nos detalhes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentDetailsModal.tsx)
- [Nota, comentário e salvamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/SatisfactionSurveyModal.tsx)

## AG25 · Conferir feriados e compromissos de um dia na Agenda

1. Abra [**Agenda**](https://crm.organizastudios.com/agenda).
2. Clique em **Mês** para ver as marcações no calendário.
3. Clique no número do dia que quer consultar.
4. Na janela do dia, leia o aviso **Feriado** e a lista de compromissos daquele dia, quando houver.
5. Clique em **Abrir dia na agenda** para continuar na programação diária.

O nome do feriado aparece no calendário e no detalhe do dia. Confira a data no título antes de usar os atalhos dos compromissos.

**Perguntas:** Onde vejo se um dia é feriado na Agenda? | Como conferir os compromissos de um dia no mês? | Como abrir os eventos de um dia na Agenda?

**Fontes:**
- [Calendário mensal e abertura do dia](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaPage.tsx)
- [Feriado e programação na janela do dia](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/DayEventsModal.tsx)

## CL03 · Consultar o cadastro de um cliente com acesso somente leitura

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes).
2. Localize o cadastro pelo nome, CPF ou telefone.
3. Na linha do cliente, clique em **Ver**.
4. Na janela **Consultar cliente**, leia os campos do cadastro. Se precisar, expanda **Mais informações**.

Os campos aparecem disponíveis para leitura. Feche a janela em **Fechar** quando terminar.

**Perguntas:** Como consultar cliente sem editar? | Como abrir o cadastro com acesso somente leitura? | Por que aparece Ver no lugar de Editar cliente?

**Fontes:**
- [Ação de consulta na lista de clientes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientsPage.tsx)
- [Modo Consultar cliente no formulário](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientModal.tsx)

## CL06 · Cadastrar um cliente e agendar aula experimental no mesmo fluxo

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes) e clique em **Novo cliente**.
2. Preencha os dados obrigatórios do cliente.
3. Em **O que o cliente vai fazer?**, clique em **Agendar aula experimental**.
4. Confira **Serviço**, **Profissional** e **Sala** e preencha **Data e horário**.
5. Clique em **Salvar e agendar aula experimental**.

Abra a ficha do novo cliente e confira a aula nos próximos atendimentos da aba **Agenda**.

**Perguntas:** Como cadastrar cliente e agendar uma experimental junto? | Onde marco a aula experimental no cadastro de cliente?

**Fontes:**
- [Cadastro e ações de agendamento guiado](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientModal.tsx)

## CL07 · Cadastrar um cliente e contratar um plano junto

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes), clique em **Novo cliente** e preencha os campos obrigatórios.
2. Clique em **Adicionar plano**.
3. Selecione **Plano cadastrado**. Confira os serviços, as sessões e o valor.
4. Escolha a **Turma**, se exigida, e confira as datas e o pagamento.
5. Clique em **Salvar e criar plano**.

Abra a ficha do novo cliente e confira a contratação em **Planos**. Se o fluxo oferecer lista de espera para uma turma cheia, confira o resultado mostrado pelo CRM.

**Perguntas:** Como cadastrar um cliente já com um plano? | Onde contrato plano junto com cadastro de cliente?

**Fontes:**
- [Contratação integrada ao cadastro de cliente](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientModal.tsx)
- [Aba Planos na ficha do cliente](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientRecordTabs.tsx)

## CL08 · Cadastrar um cliente e vender um serviço avulso junto

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes), clique em **Novo cliente** e preencha os dados obrigatórios.
2. Clique em **Adicionar serviço avulso**.
3. Escolha o **Plano cadastrado** que representa o serviço avulso e confira o valor.
4. Revise os campos de pagamento e clique em **Salvar e criar serviço avulso**.

Confira a contratação na aba **Planos** da ficha do novo cliente.

**Perguntas:** Como cadastrar um cliente já com serviço avulso? | Onde incluo a sessão avulsa no cadastro?

**Fontes:**
- [Fluxo de cadastro e serviço avulso](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientModal.tsx)

## CL09 · Cadastrar um cliente e incluir uma venda de produto

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes), clique em **Novo cliente** e preencha o cadastro.
2. Clique em **Adicionar produto**.
3. Escolha **Produto**, confira **Quantidade** e **Preço unitário**.
4. Revise **Pagamento** e clique em **Salvar e registrar venda**.

Confira o cadastro em **Clientes** e a venda correspondente em **Vendas realizadas**.

**Perguntas:** Como cadastrar cliente e vender produto na mesma tela? | Onde adiciono um produto no cadastro de cliente?

**Fontes:**
- [Cadastro e ação de venda guiada](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientModal.tsx)

## CL10 · Importar clientes de uma planilha

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes).
2. Clique em **Mais** e depois em **Importar**.
3. Clique em **Planilha de clientes** e escolha o arquivo. Use **Baixar modelo CSV** se precisar de um exemplo.
4. Associe as colunas aos campos e confira a prévia.
5. Clique em **Importar … clientes**.

Confira o resumo da importação e procure os novos cadastros em **Clientes**. Use os títulos das colunas na primeira linha da planilha.

**Perguntas:** Como importar clientes? | Como enviar uma planilha de clientes? | Onde subo o CSV de clientes?

**Fontes:**
- [Atalho Mais e ação Importar](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientsPage.tsx)
- [Formulário e prévia da planilha](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientImportModal.tsx)

## CL11 · Exportar a lista de clientes

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes).
2. Clique em **Mais** e depois em **Exportar**.
3. Em **Exportar clientes**, marque os campos que deseja levar para a planilha.
4. Clique em **Exportar**.

Abra o arquivo CSV que o navegador baixou. Confira se foram incluídas as colunas que você marcou.

**Perguntas:** Como exportar clientes? | Como baixar lista de clientes? | Onde baixo a planilha de clientes?

**Fontes:**
- [Atalho Mais e ação Exportar](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientsPage.tsx)
- [Seleção dos campos e download](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientExportModal.tsx)

## CL14 · Inativar clientes em lote

1. Entre como administrador e abra [**Clientes**](https://crm.organizastudios.com/clientes). Clique em **Mais** e escolha **Inativar em lote**.
2. Em **Meses sem atividade**, informe o período, de 3 a 120 meses. Clique em **Ver prévia**.
3. Em **Clientes elegíveis**, marque os cadastros que deseja inativar. Se mudar o período, gere a prévia novamente.
4. Confira a quantidade selecionada e clique em **Confirmar inativação**.
5. Leia os totais de clientes inativados e ignorados. Para localizar os cadastros inativados, abra **Filtros** e escolha **Inativos** em **Situação**.

A prévia considera clientes ativos da rede com cadastros antigos o suficiente para o período escolhido. Atendimento individual no período ou agendado, frequência de turma no período, plano ativo e vigente ou matrícula ativa com aula futura impedem a seleção. Se um cliente perder a elegibilidade entre a prévia e a confirmação, o CRM conta esse cadastro como ignorado.

**Perguntas:** Como inativar clientes em lote? | Onde desativo vários clientes sem atividade? | Por que um cliente foi ignorado na inativação em lote?

**Fontes:**
- [Ação, resultado e filtro em Clientes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientsPage.tsx)
- [Período, prévia e seleção](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientInactivationModal.tsx)
- [Critérios de elegibilidade e revalidação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/api/src/storage/mysql/patient-management.ts)

## CL15 · Consultar o contato de emergência de um cliente

1. No cabeçalho do CRM, clique em **SOS**.
2. No campo **Cliente**, digite o nome da pessoa.
3. Na lista **Clientes encontrados**, selecione o cadastro correto.
4. Confira o nome e os contatos na seção **Contato de emergência**.

Se aparecer um telefone ou WhatsApp, use o canal conforme a necessidade. Se o contato estiver incompleto, revise o cadastro do cliente com quem tem acesso para editá-lo.

**Perguntas:** Onde encontro o contato de emergência de um cliente? | Como ver o telefone de emergência do cliente? | Como consultar o responsável de emergência pelo SOS?

**Fontes:**
- [Consulta, dados e ações do SOS](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/shared/components/EmergencyButton.tsx)

## CL16 · Aplicar desconto em uma compra durante o cadastro

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes) e inicie **Novo cliente**.
2. Adicione o item da compra. Para descontar um produto, abra **Configurar desconto** junto ao item.
3. Preencha **Porcentagem de desconto (%)** e clique em **Aplicar desconto**.
4. Confira o total e use o botão de salvamento da compra.

Depois de salvar, abra a venda para conferir o valor final e o desconto registrado.

**Perguntas:** Como dar desconto no cadastro com compra? | Onde aplico desconto a um produto durante o cadastro?

**Fontes:**
- [Fluxo de venda e configuração do desconto](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientModal.tsx)

## CL17 · Consultar o histórico de um cliente

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes) e localize o cadastro.
2. Clique no cartão do cliente para abrir a ficha.
3. Confira o nome no topo da ficha.
4. Clique em **Histórico** e leia os registros apresentados.

A aba reúne o histórico daquele cadastro. Sua exibição depende da permissão **Ver histórico do cliente**.

**Perguntas:** Como consultar o histórico de um cliente? | Onde vejo as alterações na ficha do cliente? | Por que a aba Histórico não aparece na ficha?

**Fontes:**
- [Entrada da ficha na lista](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientsPage.tsx)
- [Aba Histórico e permissão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientRecordTabs.tsx)

## CL18 · Concluir os passos após uma contratação guiada

1. Ao salvar a contratação ou compra, leia a janela de confirmação.
2. Se aparecer **Link de assinatura**, confira o documento e use **Copiar link** ou **Abrir WhatsApp** para preparar o envio. Depois clique em **Concluir**.
3. Quando o CRM perguntar se o cliente já pagou, use **Não** para deixar em aberto. Se já recebeu, clique em **Sim, já pagou**.
4. Confira os dados da baixa e clique em **Confirmar baixa**.
5. Use **Enviar recibo pelo WhatsApp** para preparar o envio quando o link aparecer e clique em **Concluir** para voltar à lista.

Confira o plano e a situação do recebimento. Cada etapa depende dos dados preenchidos na contratação.

**Perguntas:** Como concluir a venda guiada após contratar um plano? | Onde registro pagamento ou preparo o recibo depois da contratação?

**Fontes:**
- [Etapas posteriores à contratação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlansPage.tsx)
- [Baixa da parcela](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/SettleModal.tsx)

## CM01 · Encontrar uma pessoa interessada no funil

1. Abra [**CRM comercial**](https://crm.organizastudios.com/comercial).
2. Procure pelos cartões nas colunas do funil.
3. Para reduzir a lista, clique em **Filtros**.
4. Escolha **Filtrar etapa**, **Filtrar responsável**, **Filtrar origem** ou outro critério.
5. Clique em **Aplicar filtros** e procure o cartão da pessoa.

Se estiver procurando uma oportunidade perdida, confira **Ocultar perdidos** e o filtro de etapa.

**Perguntas:** Como localizar um lead no funil? | Onde encontro uma pessoa interessada? | Como filtrar os leads por etapa ou responsável?

**Fontes:**
- [Funil, atalhos e abertura dos filtros](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/CommercialPage.tsx)
- [Campos e aplicação dos filtros](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/LeadFiltersModal.tsx)

## CM03 · Consultar os detalhes, atividades e análise do funil

1. Abra [**CRM comercial**](https://crm.organizastudios.com/comercial) e localize o cartão do lead.
2. Clique no nome do lead para abrir a aba **Detalhes**.
3. Clique em **Movimentações** para ver as mudanças de etapa registradas.
4. Volte ao cartão e abra **Atividades** para consultar **Tarefas** e **Contatos**.
5. Para consultar indicadores do funil, clique em **Análise** acima das colunas.

Em **Análise do funil**, consulte quadros como **Conversão por origem**, **Conversão por forma de contato** e **Motivos de perda**.

**Perguntas:** Como consultar os detalhes de um lead? | Onde vejo as movimentações de um lead? | Como abrir a análise do funil comercial?

**Fontes:**
- [Entrada de análise e ações dos cartões](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/CommercialPage.tsx)
- [Abas do detalhe](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/LeadDetailsModal.tsx)
- [Quadros de análise](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/LeadAnalysisModal.tsx)

## CM04 · Editar o cadastro de um lead

1. Abra [**CRM comercial**](https://crm.organizastudios.com/comercial).
2. Localize a pessoa no funil.
3. No cartão dela, clique em **Editar cadastro**.
4. Na janela **Editar lead**, altere os campos necessários.
5. Clique em **Salvar cadastro**.

Confira as informações atualizadas no cartão ou abra os detalhes para revisar campos adicionais.

**Perguntas:** Como editar um lead? | Como alterar o nome de um lead no funil? | Onde atualizo o cadastro de um interessado?

**Fontes:**
- [Ação de edição no funil](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/CommercialPage.tsx)
- [Campos e salvamento do lead](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/LeadModal.tsx)

## CM05 · Mover um lead para outra etapa do funil

1. Abra [**CRM comercial**](https://crm.organizastudios.com/comercial).
2. Encontre o cartão do lead.
3. Abra o seletor de **Etapa** no cartão dele.
4. Escolha a etapa de destino.

O cartão passa para a coluna da etapa escolhida. Abra os detalhes para conferir a nova etapa. Se escolher **Perdidos**, o CRM pede o motivo da perda.

**Perguntas:** Como mover um lead de etapa? | Como trocar a coluna de um lead no funil? | Como passar um lead para Em contato?

**Fontes:**
- [Seletor de etapa no funil](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/CommercialPage.tsx)

## CM06 · Marcar um lead como perdido

1. Abra [**CRM comercial**](https://crm.organizastudios.com/comercial).
2. Localize o cartão da pessoa.
3. No seletor de **Etapa**, escolha **Perdidos**.
4. Preencha **Motivo da perda**.
5. Clique em **Confirmar**.

O lead sai das oportunidades abertas. Para encontrá-lo, confira se **Ocultar perdidos** está desativado e procure na coluna **Perdidos**.

**Perguntas:** Como marcar um lead como perdido? | Onde registro o motivo de perda de um interessado? | Como mover um lead para Perdidos?

**Fontes:**
- [Seleção da etapa e exibição de perdidos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/CommercialPage.tsx)
- [Motivo obrigatório e confirmação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/LeadLostModal.tsx)

## CM07 · Criar, editar ou reordenar uma etapa do funil

1. Abra [**CRM comercial**](https://crm.organizastudios.com/comercial).
2. Clique em **Adicionar etapa** para criar uma coluna. Para alterar uma existente, use **Editar etapa** no cabeçalho dela.
3. Preencha **Nome da etapa**, escolha **Posição no funil** e confira a cor.
4. Clique em **Adicionar etapa** ou **Salvar etapa**, conforme a janela.

Confira a nova posição no funil. No computador, a interface também oferece o arraste pelo cabeçalho da coluna.

**Perguntas:** Como criar uma etapa no funil? | Como mudar a ordem das etapas do CRM comercial? | Onde renomeio uma coluna do funil?

**Fontes:**
- [Funil e ações do cabeçalho](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/CommercialPage.tsx)
- [Campos da etapa e posição](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/LeadStageModal.tsx)

## CM08 · Criar uma tarefa de acompanhamento para um lead

1. Abra [**CRM comercial**](https://crm.organizastudios.com/comercial) e encontre o lead.
2. No cartão, clique em **Atividades**.
3. Abra **Tarefas**.
4. Preencha **Tarefa** e confira o **Vencimento**.
5. Se precisar, preencha **Observações**.
6. Clique em **Adicionar tarefa**.

A nova tarefa aparece na lista do lead com o vencimento escolhido.

**Perguntas:** Como criar uma tarefa para um lead? | Como agendar um retorno no funil? | Onde cadastro uma tarefa comercial de acompanhamento?

**Fontes:**
- [Entrada de Atividades no funil](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/CommercialPage.tsx)
- [Formulário e lista de tarefas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/LeadActivityModal.tsx)

## CM09 · Concluir ou cancelar uma tarefa de um lead

1. Abra [**CRM comercial**](https://crm.organizastudios.com/comercial) e localize o lead.
2. No cartão, clique em **Atividades**.
3. Abra **Tarefas**.
4. Localize a tarefa pelo nome e pelo vencimento.
5. Clique em **Concluir** se a tarefa foi feita. Para cancelar uma tarefa em aberto, clique em **Cancelar** na linha da tarefa.

Confira a nova situação na mesma lista.

**Perguntas:** Como concluir uma tarefa do lead? | Como marcar uma tarefa comercial como concluída? | Como cancelar uma tarefa de acompanhamento?

**Fontes:**
- [Ações e estados de tarefas comerciais](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/LeadActivityModal.tsx)

## CM10 · Registrar um contato com um lead

1. Abra [**CRM comercial**](https://crm.organizastudios.com/comercial) e localize o lead.
2. No cartão, clique em **Atividades**.
3. Abra **Contatos**.
4. Escolha **Canal**, **Direção** e **Conseguiu falar?**.
5. Confira **Data e hora** e preencha **Registro do contato**.
6. Clique em **Registrar contato**.

O registro aparece no histórico do lead, inclusive quando você informa que a tentativa ficou sem resposta.

**Perguntas:** Como registrar contato com um lead? | Como anotar uma ligação para um lead? | Onde registro uma tentativa de contato comercial?

**Fontes:**
- [Campos e histórico de contato](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/LeadActivityModal.tsx)

## CM11 · Agendar aula experimental para um lead

1. Abra [**CRM comercial**](https://crm.organizastudios.com/comercial) e localize o lead.
2. No cartão, clique em **Agendar experimental**.
3. Confira **Serviço**, **Profissional** e **Sala**.
4. Selecione **Data** e preencha **Horário**. Se precisar, informe **Observação**.
5. Clique em **Confirmar agendamento**.

A aula aparece na Agenda vinculada ao lead. O cadastro de cliente pode ser feito depois, na conversão.

**Perguntas:** Como marcar uma aula experimental para um lead? | Onde agendo atendimento para um interessado do funil?

**Fontes:**
- [Ação no funil](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/CommercialPage.tsx)
- [Formulário do agendamento de lead](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/LeadAppointmentModal.tsx)

## CM13 · Importar leads de uma planilha

1. Abra [**CRM comercial**](https://crm.organizastudios.com/comercial).
2. Clique em **Importar leads**.
3. Clique em **Planilha de leads** para escolher o arquivo. Se precisar, use **Baixar modelo CSV**.
4. Confira o mapeamento das colunas e a prévia. Ajuste **Origem** e **Etapa do funil** conforme o cadastro.
5. Clique em **Importar … leads**.

Leia o resultado da importação e procure as pessoas na etapa selecionada. Se não encontrar os cartões, confira os filtros do funil.

**Perguntas:** Como importar leads? | Como colocar uma planilha de interessados no funil? | Onde baixo o modelo CSV para importar leads?

**Fontes:**
- [Abertura da importação no funil](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/CommercialPage.tsx)
- [Escolha do arquivo e destino no funil](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/commercial/LeadImportModal.tsx)

## GR01 · Localizar turmas e consultar aulas e indicadores

1. Abra [**Turmas**](https://crm.organizastudios.com/turmas).
2. Na aba **Turmas**, localize a turma e clique em **Abrir turma**.
3. Use **Dados da turma** para consultar os horários fixos e os participantes.
4. Clique em **Frequência e reposições** e escolha um dia com aula no calendário.
5. Para ver os indicadores do módulo, feche a janela da turma e abra **Visão geral**.

Confira o nome da turma e o horário do encontro selecionado. A aba **Visão geral** depende da permissão de resumo de turmas.

**Perguntas:** Onde vejo as aulas de uma turma? | Como localizar uma turma e sua aula no calendário? | Onde vejo o resumo das turmas?

**Fontes:**
- [Lista de turmas e aba de indicadores](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupsPage.tsx)
- [Abas e calendário da turma](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupDetailsModal.tsx)

## GR03 · Editar dados ou renomear uma turma

1. Abra [**Turmas**](https://crm.organizastudios.com/turmas) e localize a turma.
2. Clique em **Abrir turma**.
3. Em **Dados da turma**, altere **Nome da turma** e clique em **Salvar nome**.
4. Para ajustar horários ou vagas, abra novamente **Dados da turma**, revise **Capacidade e horários** e clique em **Salvar alterações**.

Confira o nome na lista e os horários ou vagas nos detalhes da turma.

**Perguntas:** Como renomear uma turma? | Como editar os dados de uma turma? | Onde mudo o nome da turma no CRM?

**Fontes:**
- [Abertura da turma](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupsPage.tsx)
- [Edição de nome, capacidade e horários](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupDetailsModal.tsx)

## GR07 · Registrar a frequência de uma aula de turma

1. Abra [**Turmas**](https://crm.organizastudios.com/turmas), localize a turma e clique em **Abrir turma**.
2. Em **Frequência e reposições**, abra a aula na data correta.
3. Localize o aluno. No campo **Frequência**, escolha **Presente**, **Falta** ou **Falta justificada**, conforme o que aconteceu.

Confira a situação ao lado do nome. A opção **Marcar todos presentes** fica disponível a partir do horário indicado na janela.

**Perguntas:** Como marcar frequência em uma aula de turma? | Onde registro falta ou presença de um aluno da turma?

**Fontes:**
- [Calendário de frequência](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupDetailsModal.tsx)
- [Ações individuais e presença coletiva](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupSessionModal.tsx)

## GR08 · Concluir um encontro de turma

1. Abra [**Turmas**](https://crm.organizastudios.com/turmas), localize a turma e clique em **Abrir turma**.
2. Em **Frequência e reposições**, abra o encontro e confira a data e os participantes.
3. Registre a frequência que for necessária e clique em **Concluir encontro**.

O botão de concluir deixa de aparecer naquele encontro. Consulte a situação do encontro no calendário da turma.

**Perguntas:** Como concluir uma aula de turma? | Onde finalizo o encontro após a chamada?

**Fontes:**
- [Abertura de encontros](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupDetailsModal.tsx)
- [Ação Concluir encontro](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupSessionModal.tsx)

## GR09 · Reservar uma aula de reposição para um aluno

1. Abra [**Turmas**](https://crm.organizastudios.com/turmas) e clique em **Abrir turma**.
2. Em **Frequência e reposições**, selecione o **Crédito de reposição** do aluno.
3. Em **Encontro de reposição**, escolha um horário elegível com vaga.
4. Clique em **Reservar reposição**.

Abra o encontro de destino e confira o aluno na lista de reposições. A tela informa que faltas justificadas podem gerar crédito.

**Perguntas:** Como reservar reposição de aula de turma? | Onde escolho o encontro para usar um crédito de reposição?

**Fontes:**
- [Crédito, elegibilidade e gravação da reserva](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupOperationsPanel.tsx)

## GR10 · Registrar presença de um aluno na reposição

1. Abra [**Turmas**](https://crm.organizastudios.com/turmas) e clique em **Abrir turma** na turma do encontro de reposição.
2. Em **Frequência e reposições**, abra o encontro reservado.
3. Localize a linha do aluno identificada como **Reposição**.
4. No seletor da reposição, escolha **Presente**.

Confira a situação **Presente** na linha de reposição. Registre a situação na reposição em que ele participou.

**Perguntas:** Como registrar presença na reposição da turma? | Onde marco que o aluno compareceu à aula de reposição?

**Fontes:**
- [Linha de reposição e estados de presença](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupSessionModal.tsx)

## GR11 · Cancelar a matrícula de um aluno na turma

1. Abra [**Turmas**](https://crm.organizastudios.com/turmas) e clique em **Abrir turma** na turma correta.
2. Em **Dados da turma**, localize o aluno em **Participantes**.
3. Clique em **Cancelar matrícula** na linha dele.
4. Confira o nome na confirmação e clique em **Cancelar matrícula**.

Confira a lista de participantes depois de salvar. A vaga passa a poder ser oferecida a outro aluno conforme a capacidade da turma.

**Perguntas:** Como cancelar a matrícula de um aluno? | Como tirar um cliente de uma turma?

**Fontes:**
- [Participantes e ação de cancelar matrícula](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupDetailsModal.tsx)
- [Confirmação da matrícula](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupsPage.tsx)

## GR12 · Alterar o profissional de um encontro da turma

1. Abra [**Turmas**](https://crm.organizastudios.com/turmas) e clique em **Abrir turma**.
2. Em **Frequência e reposições**, escolha a aula e confira a data e o horário.
3. Em **Profissional deste encontro**, selecione o profissional que vai atender.
4. Aguarde a atualização e confira o nome selecionado.

A mudança pode ser conferida ao reabrir aquele encontro. O seletor mostra os profissionais elegíveis para o serviço.

**Perguntas:** Como trocar o profissional de uma aula específica? | Onde altero o responsável só pelo encontro da turma?

**Fontes:**
- [Edição do profissional do encontro](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/groups/GroupSessionModal.tsx)

## LE01 · Consultar a procura e filtrar a lista de espera

1. Abra [**Lista de espera**](https://crm.organizastudios.com/lista-de-espera).
2. Consulte **Maior procura** para ver serviços e produtos com fila.
3. Clique em **Ver fila** no item que deseja consultar.
4. Em **Clientes na lista**, use **Item** e **Situação** para ajustar os resultados.
5. Clique em **Limpar filtros** para voltar à lista geral.

A lista mostra as entradas compatíveis com o item e a situação escolhidos.

**Perguntas:** Como filtrar a lista de espera? | Onde vejo os produtos com maior procura? | Como ver a fila de um serviço específico?

**Fontes:**
- [Indicadores, atalhos e filtros da fila](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/waitlist/WaitlistPage.tsx)

## LE03 · Colocar um cliente na espera por um produto

1. Abra [**Lista de espera**](https://crm.organizastudios.com/lista-de-espera) e clique em **Adicionar à lista**.
2. No campo **Cliente**, digite o nome e selecione o cadastro.
3. Clique em **Reposição de produto**.
4. Escolha o **Produto** e preencha **Observações** se precisar.
5. Clique em **Adicionar à lista**.

Procure o cliente em **Clientes na lista**. Use **Item** para filtrar pelo produto escolhido.

**Perguntas:** Como colocar um cliente na fila de um produto? | Como adicionar alguém na espera por reposição de estoque? | Onde cadastro uma espera por produto?

**Fontes:**
- [Formulário da fila por produto](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/waitlist/WaitlistEntryModal.tsx)
- [Lista e filtros de espera](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/waitlist/WaitlistPage.tsx)

## LE04 · Preparar um aviso de vaga ou reposição pela lista de espera

1. Abra [**Lista de espera**](https://crm.organizastudios.com/lista-de-espera).
2. Localize o item e clique em **Atualizar** na linha do cliente.
3. Confira a posição na fila e o tipo de espera.
4. Se houver um número para contato, clique em **Avisar por WhatsApp** e revise a mensagem antes de enviá-la.
5. Depois do contato, volte à entrada, escolha **Avisado** em **Situação** e clique em **Salvar**.

A fila mostra a situação **Avisado** depois que você salva a mudança. O texto preparado varia entre oferta de vaga e reposição de produto.

**Perguntas:** Como avisar alguém da lista de espera? | Como avisar que chegou o produto? | Onde preparo o WhatsApp para oferecer uma vaga?

**Fontes:**
- [Aviso, canal e atualização de situação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/waitlist/WaitlistManageModal.tsx)

## LE05 · Matricular um cliente pela lista de espera

1. Abra **Lista de espera**, localize a entrada do cliente e clique em **Abrir entrada**.
2. Em **Matricular em turma**, selecione uma **Turma com vaga** do serviço aguardado e confira horário, profissional e vagas.
3. Clique em **Matricular e configurar pagamento**. Revise os dados do cliente, da turma e o plano. No formulário de plano recorrente, preencha o pagamento e clique em **Criar plano e parcelas**.
4. Confira a saída da entrada da fila. Em **Turmas**, clique em **Abrir turma** na turma escolhida e confira o cliente em **Matriculados**.

O CRM oferece turmas ativas do serviço escolhido com vagas disponíveis.

**Perguntas:** Como confirmar matrícula pela lista de espera? | Como matricular na turma um cliente que está na fila?

**Fontes:**
- [Entrada da fila](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/waitlist/WaitlistPage.tsx)
- [Seleção de turma e contratação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/waitlist/WaitlistEnrollSection.tsx)

## LE06 · Atualizar a situação de um cliente na lista de espera

1. Abra [**Lista de espera**](https://crm.organizastudios.com/lista-de-espera).
2. Localize a entrada do cliente pelo nome e pelo item.
3. Na linha certa, clique em **Atualizar**.
4. Em **Situação**, escolha **Aguardando**, **Avisado**, **Atendido** ou **Desistiu**.
5. Ajuste **Observações** se precisar e clique em **Salvar**.

Confira a situação na lista. Se a entrada sumir, revise o filtro **Situação**.

**Perguntas:** Como mudar a situação na lista de espera? | Como marcar um cliente como avisado na fila? | Onde marco uma espera como atendida?

**Fontes:**
- [Abertura da entrada na fila](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/waitlist/WaitlistPage.tsx)
- [Situações e salvamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/waitlist/WaitlistManageModal.tsx)

## LE07 · Remover um cliente da lista de espera

1. Abra [**Lista de espera**](https://crm.organizastudios.com/lista-de-espera).
2. Localize o cliente e confira o item da fila.
3. Na linha da entrada, clique em **Atualizar**.
4. Na janela do cliente, clique em **Remover da lista**.
5. Leia a confirmação e clique em **Remover da lista**.

A entrada desaparece da fila. Para guardar o histórico de alguém que já saiu da espera, escolha **Atendido** ou **Desistiu** em **Situação**.

**Perguntas:** Como remover um cliente da lista de espera? | Como excluir uma entrada da fila? | Onde apago uma espera por produto?

**Fontes:**
- [Ação de remoção e confirmação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/waitlist/WaitlistManageModal.tsx)

## PL01 · Localizar um plano por cliente e situação

1. Abra [**Planos e sessões**](https://crm.organizastudios.com/planos).
2. Vá à seção **Planos dos clientes**.
3. Selecione a situação do plano, como **Ativo**, **Pausado**, **Esgotado** ou **Vencendo**. Use **Todos** para consultar todas as situações.
4. Localize o cliente e confira o nome e as datas do plano no cartão.

A lista mostra os planos da situação selecionada. Se houver mais de um cartão do cliente, confira o plano antes de usar as ações.

**Perguntas:** Como localizar um plano de um cliente? | Como ver somente os planos ativos? | Onde filtro os planos que estão vencendo?

**Fontes:**
- [Cartões e filtros por situação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlansPage.tsx)

## PL02 · Consultar saldo, validade e extrato de sessões

1. Abra [**Planos e sessões**](https://crm.organizastudios.com/planos).
2. Localize o cliente em **Planos dos clientes**.
3. No cartão do plano certo, confira o saldo e as datas mostradas.
4. Clique em **Extrato**.
5. Leia a quantidade de sessões disponíveis e as movimentações apresentadas.

O extrato indica a quantidade disponível no momento e detalha o saldo por serviço quando houver mais de um.

**Perguntas:** Como ver o saldo de sessões de um cliente? | Onde consulto o extrato de sessões? | Como conferir se um plano ainda tem validade e sessões?

**Fontes:**
- [Cartões e abertura do extrato](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlansPage.tsx)

## PL05 · Contratar um plano com matrícula e documento

1. Abra [**Planos e sessões**](https://crm.organizastudios.com/planos) e clique em **Novo plano**.
2. Selecione **Cliente** e **Plano cadastrado**.
3. Em **Turma**, escolha uma turma com vaga e confira as datas e o pagamento.
4. Em **Documento para o cliente assinar**, escolha um modelo.
5. Clique em **Criar plano e parcelas**. Na confirmação, confira o link de assinatura.
6. Use **Copiar link** ou **Abrir WhatsApp** se precisar preparar o envio e clique em **Concluir** para continuar.

Confira o cartão do plano. A turma mostra o participante e o documento emitido pode ser acompanhado em **Contratos**.

**Perguntas:** Como contratar um plano com matrícula e documento para assinatura? | Onde escolho a turma e o documento durante a contratação?

**Fontes:**
- [Turma e seleção do documento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlanModal.tsx)
- [Confirmações após criar o plano](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlansPage.tsx)

## PL06 · Dividir a compra de um plano entre formas de pagamento

1. Abra [**Planos e sessões**](https://crm.organizastudios.com/planos) e clique em **Novo plano**.
2. Selecione o **Cliente** e o **Plano cadastrado**. Quando necessário, escolha a **Turma** e confira as datas.
3. Clique em **Adicionar forma de pagamento**.
4. Escolha as formas e preencha o valor de cada uma.
5. Se o plano pedir **Cobrança da forma**, escolha **Só na primeira vez** ou **Recorrente (segue nas renovações)** para cada forma.
6. Confira se a **Soma das formas** corresponde ao total e revise **Primeiro vencimento**.
7. Clique em **Criar plano e parcelas**.

O plano aparece em **Planos dos clientes**. As formas marcadas como recorrentes entram nas próximas renovações nos planos que usam essa configuração.

**Perguntas:** Como dividir a compra de um plano? | Como contratar um plano com duas formas de pagamento? | Como separar um valor recorrente e outro só na primeira cobrança?

**Fontes:**
- [Formulário de contratação e criação de parcelas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlanModal.tsx)
- [Teste da contratação e baixa financeira](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/e2e/plans-finance.spec.ts)

## PL07 · Renovar manualmente um plano

1. Abra [**Planos e sessões**](https://crm.organizastudios.com/planos) e localize o cliente.
2. No cartão do plano correto, clique em **Renovar**.
3. Em **Renovar plano**, confira as sessões, o **Valor total**, o **Início** e o **Fim da validade**.
4. Revise as formas de pagamento e **Primeiro vencimento**.
5. Clique em **Renovar plano e gerar parcelas**.

Um novo cartão de plano aparece para o cliente. Confira nele a validade da renovação e consulte as parcelas no Financeiro.

**Perguntas:** Como renovar um plano manualmente? | Onde renovo o plano de um cliente? | Como gerar as parcelas da renovação de um plano?

**Fontes:**
- [Ação Renovar no plano do cliente](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlansPage.tsx)
- [Campos e confirmação da renovação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlanModal.tsx)

## PL08 · Pausar e reativar um plano

1. Abra [**Planos e sessões**](https://crm.organizastudios.com/planos) e localize o cartão do plano.
2. Clique em **Pausar**.
3. Preencha **Motivo (opcional)** e **Previsão de retorno (opcional)** se precisar.
4. Clique em **Pausar plano**.
5. Para reativar, selecione **Pausado**, encontre o plano e clique em **Ativar**.

O plano passa a aparecer em **Pausado** depois da pausa. Após ativá-lo, confira o cartão em **Ativo**.

**Perguntas:** Como pausar um plano? | Como reativar um plano pausado? | Onde registro a previsão de retorno de um plano?

**Fontes:**
- [Situações e ações Pausar e Ativar](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlansPage.tsx)
- [Campos opcionais e confirmação da pausa](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlanPauseModal.tsx)

## PL09 · Cancelar um plano com ou sem estorno ao cliente

1. Abra **Planos e sessões**, localize o plano do cliente e clique em **Cancelar** no cartão correspondente.
2. Confira o cliente, o plano e o efeito do cancelamento. Para cancelar sem devolução, mantenha **Houve estorno de valor ao cliente** desmarcado.
3. Se houver devolução, marque **Houve estorno de valor ao cliente** e preencha **Valor estornado ao cliente (R$)** e **Forma de pagamento do estorno**. A observação é opcional.
4. Clique em **Confirmar**. Use o filtro **Cancelado** para conferir o plano e o registro do cancelamento. Com devolução, confira também a saída em **Financeiro › Contas a pagar**.

As parcelas em aberto são canceladas e as sessões que restavam ficam indisponíveis. A devolução registrada aparece como uma conta paga na categoria **Estornos a clientes**.

**Perguntas:** Como cancelar um plano e devolver o valor ao cliente? | Como cancelar um plano sem estorno?

**Fontes:**
- [Lista e ações dos planos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlansPage.tsx)
- [Cancelamento e registro de estorno](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlanCancelModal.tsx)

## PL10 · Configurar a renovação automática de um plano

1. Abra [**Planos e sessões**](https://crm.organizastudios.com/planos) e localize o cartão do plano.
2. Confira se aparece **Renovar automaticamente**.
3. Marque a opção para ligar a renovação. Desmarque para desligar.
4. Aguarde o cartão refletir a mudança e confira se a opção ficou como você escolheu.

O controle aparece nos planos que admitem renovação automática. Na contratação desses planos, a opção também pode aparecer como **Renovar automaticamente ao fim da validade, com as mesmas condições**.

**Perguntas:** Como ligar a renovação automática de um plano? | Como desligar a renovação automática? | Onde vejo se o plano está com renovação automática?

**Fontes:**
- [Opção de renovação no cartão e atualização](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlansPage.tsx)
- [Opção durante a contratação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/plans/PlanModal.tsx)

## PR01 · Localizar um cliente e abrir seu prontuário

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios).
2. Na aba **Prontuários**, localize o nome do cliente na lista.
3. Clique no nome da pessoa.
4. Confira o nome no alto da ficha antes de consultar as abas clínicas.

O prontuário abre com as áreas clínicas disponíveis para a sua conta, como **Linha do tempo**, **Avaliações** e **Arquivos**.

**Perguntas:** Como abrir um prontuário? | Como localizar um paciente em Prontuários? | Onde abro a ficha clínica de um cliente?

**Fontes:**
- [Lista e seleção de clientes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalRecordsPage.tsx)
- [Cabeçalho e abas do prontuário](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalWorkspacePanel.tsx)

## PR02 · Consultar a linha do tempo do prontuário

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios) e selecione o cliente.
2. Clique em **Linha do tempo**.
3. Escolha **Tudo**, **Avaliações**, **Medições** ou **Arquivos**, conforme os filtros disponíveis.
4. Confira o tipo, a descrição, a data e o autor de cada registro.

Os filtros mudam os itens mostrados. Quando houver uma medição, a linha apresenta o valor registrado e a unidade.

**Perguntas:** Como ver o histórico clínico? | Onde vejo a linha do tempo do prontuário? | Como filtrar medições e anexos no histórico clínico?

**Fontes:**
- [Linha do tempo e filtros no prontuário](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalChart.tsx)

## PR06 · Anexar um arquivo ao prontuário

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios) e selecione o cliente.
2. Na ficha, abra **Arquivos**.
3. Clique em **Anexar arquivo**.
4. Use **Arquivo** para selecionar o documento no seu dispositivo.
5. Preencha **Observações**, se precisar.
6. Clique em **Anexar arquivo**.

O arquivo aparece na aba **Arquivos**. O formulário indica os formatos aceitos e o limite de tamanho. Para PDF, Word ou imagens, o limite informado é 5 MB.

**Perguntas:** Como anexar um arquivo ao prontuário? | Onde adiciono uma foto ao prontuário? | Como colocar um PDF na ficha clínica?

**Fontes:**
- [Aba de arquivos e abertura da janela](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ChartFilesTab.tsx)
- [Envio e limites de anexos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalAttachmentModal.tsx)

## PR07 · Consultar ou baixar um anexo do prontuário

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios) e selecione o cliente.
2. Clique em **Arquivos**.
3. Clique no arquivo que deseja consultar para abrir a visualização.
4. Clique em **Baixar** para guardar uma cópia.

Confira o nome do arquivo na janela antes de baixar. Se houver outros anexos na lista, use **Anterior** e **Próxima** para navegar entre eles.

**Perguntas:** Como abrir um anexo do prontuário? | Onde baixo um arquivo da ficha clínica? | Como ver os documentos anexados ao prontuário?

**Fontes:**
- [Lista, visualização e download dos anexos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ChartFilesTab.tsx)

## PR08 · Criar ou remover um alerta clínico

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios) e selecione o cliente.
2. No alto da ficha, clique em **Alerta**.
3. Escolha a **Gravidade** e preencha **Alerta**.
4. Clique em **Fixar alerta**.
5. Para retirar um alerta, use **Remover alerta** no alerta correspondente e confirme em **Remover alerta**.

O alerta ativo aparece no topo do prontuário. Ao remover, ele sai do topo e o histórico mantém o registro.

**Perguntas:** Como criar um alerta clínico? | Como fixar um aviso no prontuário? | Como retirar um alerta do prontuário?

**Fontes:**
- [Ações de alerta no prontuário](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalWorkspacePanel.tsx)
- [Campos e gravação do alerta](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalAlertModal.tsx)

## PR09 · Montar e publicar um modelo de avaliação

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios) e clique em **Criar modelo**.
2. Preencha **Nome do modelo** e confira **Especialidade**.
3. Para cada campo, informe **Pergunta ou título**, selecione **Tipo** e marque **Obrigatório** se for preciso.
4. Clique em **Adicionar campo** para incluir outras perguntas.
5. Use **Prévia do formulário** para conferir o resultado.
6. Clique em **Publicar modelo** quando terminar. Se precisar continuar depois, use **Salvar rascunho**.

O modelo aparece em **Modelos de avaliação**. Os modelos publicados ficam disponíveis para registrar uma avaliação.

**Perguntas:** Como criar um formulário de avaliação? | Como publicar um modelo de prontuário? | Onde vejo a prévia do modelo de avaliação?

**Fontes:**
- [Abas e publicação de modelos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/AssessmentTemplatesTabs.tsx)
- [Campos, prévia e botões](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/AssessmentTemplateFields.tsx)

## PR10 · Editar um modelo de avaliação publicado

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios) e vá à aba **Modelos de avaliação**.
2. Encontre o modelo e clique em **Editar**.
3. Atualize o nome, a especialidade ou as perguntas necessárias.
4. Use **Prévia do formulário** para conferir.
5. Clique em **Publicar modelo**. Se precisar trabalhar nele depois, escolha **Salvar rascunho**.

Confira o modelo na lista. Para alterar a disponibilidade de um modelo, use a ação **Arquivar** no item correspondente.

**Perguntas:** Como editar um modelo de avaliação? | Como alterar um formulário de avaliação publicado? | Onde arquivo um modelo de prontuário?

**Fontes:**
- [Lista e ações dos modelos de avaliação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/AssessmentTemplatesTabs.tsx)
- [Formulário de edição e publicação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/AssessmentTemplateModal.tsx)

## PR11 · Registrar uma avaliação usando um formulário

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios) e selecione o cliente.
2. Clique em **Registrar avaliação**.
3. Em **Formulário**, escolha o modelo publicado que quer usar.
4. Clique em **Preencher formulário**.
5. Preencha as respostas e as observações necessárias.
6. Clique em **Registrar avaliação**.

Encontre o registro na aba **Avaliações** do prontuário do cliente.

**Perguntas:** Como preencher um formulário de avaliação? | Como registrar uma avaliação usando modelo? | Onde registro a avaliação de um paciente?

**Fontes:**
- [Abertura da avaliação no prontuário](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalWorkspacePanel.tsx)
- [Seleção de formulário, respostas e registro](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalAssessmentModal.tsx)

## PR12 · Criar e acompanhar um objetivo terapêutico

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios) e selecione o cliente.
2. Na aba **Plano e medições**, clique em **Novo objetivo**.
3. Preencha **Objetivo** e, se precisar, **Descrição**.
4. Informe **Valor inicial**, **Valor-alvo**, **Unidade** e **Data-alvo** quando se aplicarem.
5. Clique em **Salvar objetivo**.
6. Volte a **Plano e medições** para acompanhar o objetivo. Quando a meta for atingida, clique em **Marcar alcançado**.

O objetivo aparece na ficha. Depois da mudança, ele fica identificado como **Alcançado**.

**Perguntas:** Como criar um objetivo terapêutico? | Onde acompanho as metas do paciente? | Como marcar um objetivo como alcançado?

**Fontes:**
- [Campos e salvamento do objetivo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/TherapeuticGoalModal.tsx)
- [Exibição do plano e ações de objetivos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ChartTabs.tsx)

## PR13 · Registrar e comparar medições no prontuário

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios) e selecione o cliente.
2. Na aba **Plano e medições**, clique em **Nova medição**.
3. Preencha **Medida**, **Valor** e **Unidade**. Confira **Data e hora**.
4. Se a medida fizer parte de uma meta, escolha o **Objetivo relacionado**.
5. Clique em **Registrar medição**.
6. Repita o registro usando a mesma medida e unidade quando fizer uma nova observação.

Consulte **Evolução das medições** para comparar as medições registradas ao longo do tempo.

**Perguntas:** Como registrar uma medição no prontuário? | Onde comparo as medições clínicas de um cliente? | Como acompanhar a evolução de uma medida?

**Fontes:**
- [Campos da medição clínica](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalMeasurementModal.tsx)
- [Evolução dos valores](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/MeasurementChart.tsx)

## PR14 · Registrar alta ou encerramento do tratamento

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios) e selecione o cliente.
2. Clique em **Mais ações** e em **Encerrar tratamento**.
3. Escolha **Motivo**, como **Alta**, **Encaminhamento** ou **Abandono**.
4. Preencha **Resumo clínico** e inclua **Recomendações**, se necessário.
5. Clique em **Registrar encerramento**.

Confira a situação e a data na ficha. O registro também aparece na história clínica.

**Perguntas:** Como registrar alta no prontuário? | Onde registro o encerramento de tratamento de um paciente?

**Fontes:**
- [Ação e situação no prontuário](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalChart.tsx)
- [Campos do encerramento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/TreatmentClosureModal.tsx)

## PR15 · Consultar quem acessou um prontuário

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios) e selecione o cliente.
2. No alto da ficha, clique em **Mais ações**.
3. Escolha **Histórico de acessos**.
4. Confira os registros apresentados na janela.

O histórico é referente ao prontuário aberto. Se a ação estiver indisponível, confira se sua conta tem acesso ao histórico clínico.

**Perguntas:** Como ver quem acessou um prontuário? | Onde fica o histórico de acessos do prontuário? | Como vejo o registro de acesso à ficha clínica?

**Fontes:**
- [Ação no cabeçalho da ficha](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalWorkspacePanel.tsx)
- [Janela de histórico de acessos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalAccessHistoryModal.tsx)

## PR16 · Exportar ou imprimir um prontuário

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios) e selecione o cliente.
2. Confira o nome no alto da ficha.
3. Para baixar os dados, clique em **Exportar**.
4. Para imprimir, clique em **Imprimir** e escolha a opção de impressão no navegador.

A exportação gera um arquivo JSON com os dados do prontuário. Para guardar uma versão para leitura em PDF, use a opção de salvar como PDF na janela de impressão.

**Perguntas:** Como exportar um prontuário? | Como imprimir a ficha clínica? | Onde baixo os dados do prontuário do cliente?

**Fontes:**
- [Ações de exportação e impressão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalWorkspacePanel.tsx)

## PR17 · Criar um treino no prontuário do cliente

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios), escolha o cliente e abra **Treinos e documentos**.
2. Expanda **Treinos, relatórios e prescrições**.
3. Em **Seção**, escolha **Treinos** e clique em **Novo registro**.
4. Preencha **Nome**, confira o **Profissional** e informe as datas ou o limite de execuções quando aplicável.
5. Em **Adicionar exercício**, escolha um exercício e revise os detalhes do treino.
6. Clique em **Salvar**.

Confira o treino pelo nome na lista. Para incluir um exercício que ainda não está disponível, cadastre-o na seção **Exercícios e procedimentos**.

**Perguntas:** Como montar um treino no prontuário? | Onde cadastro um exercício para usar no treino do cliente?

**Fontes:**
- [Seções e lista de registros clínicos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalResourcesPanel.tsx)
- [Campos de exercícios e treinos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalResourceEditor.tsx)

## PR18 · Copiar, editar, finalizar ou imprimir registros clínicos

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios), escolha o cliente e entre em **Treinos e documentos**.
2. Expanda **Treinos, relatórios e prescrições** e escolha a **Seção**.
3. Num treino, use **Copiar treino**, revise os dados da cópia e clique em **Salvar**. Para alterar um registro que admite edição, use **Editar**.
4. Em **Relatórios e prescrições**, use **Finalizar** no registro e confirme em **Confirmar finalização**.
5. Para imprimir os registros do período, ajuste as datas e clique em **Imprimir período**.

Confira o nome da cópia ou a situação **Finalizado**, conforme a ação. As opções dependem do tipo e da situação do registro.

**Perguntas:** Como copiar treino ou finalizar relatório clínico? | Onde imprimo treinos e documentos de um período?

**Fontes:**
- [Ações e impressão no prontuário](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalResourcesPanel.tsx)
- [Edição e cópia de registros](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalResourceEditor.tsx)

## PR19 · Gravar e ouvir um áudio no prontuário

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios), escolha o cliente e entre em **Arquivos**.
2. Clique em **Anexar arquivo** e depois em **Gravar áudio**.
3. Autorize o microfone se o navegador perguntar. Aguarde o contador de gravação.
4. Clique em **Concluir gravação**, preencha **Observações** se precisar e clique em **Anexar arquivo**.
5. Na aba **Arquivos**, clique em **Reproduzir áudio** e use o controle do player para ouvir.

O áudio fica na lista de anexos. A janela informa os limites de 15 minutos e 16 MB.

**Perguntas:** Como gravar áudio no prontuário? | Onde consigo ouvir um áudio salvo na ficha clínica?

**Fontes:**
- [Gravação no formulário do anexo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalAttachmentModal.tsx)
- [Carregamento e reprodução](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalAudioPlayer.tsx)

## PR20 · Registrar a execução de um treino

1. Abra [**Prontuários**](https://crm.organizastudios.com/prontuarios), selecione o cliente e abra **Treinos e documentos**.
2. Expanda **Treinos, relatórios e prescrições**.
3. Em **Seção**, selecione **Treinos executados**.
4. Clique em **Novo registro** e selecione o **Treino**.
5. Preencha **Observações** e marque **Execução concluída** quando for o caso.
6. Clique em **Salvar**.

Confira o novo registro na lista de treinos executados e clique em **Visualizar** para rever o que foi gravado.

**Perguntas:** Como registrar que o cliente executou um treino? | Onde lanço uma execução de treino no prontuário?

**Fontes:**
- [Entrada da seção de treinos executados](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalResourcesPanel.tsx)
- [Campos da execução](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/clinical/ClinicalResourceEditor.tsx)

## EV04 · Excluir um evento

1. Abra [**Eventos**](https://crm.organizastudios.com/eventos).
2. Localize o evento pelo nome e confira a data.
3. No cartão dele, clique em **Excluir**.
4. Leia os efeitos da exclusão na janela **Excluir evento**.
5. Clique em **Excluir evento** para confirmar.

O evento desaparece da lista. Os participantes que já estavam no funil comercial continuam como leads sem o vínculo com esse evento.

**Perguntas:** Como excluir um evento? | Como apagar um evento cadastrado? | O que acontece com os participantes quando excluo um evento?

**Fontes:**
- [Ação e efeitos da exclusão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventsPage.tsx)

## EV07 · Importar participantes de um evento

1. Abra [**Eventos**](https://crm.organizastudios.com/eventos).
2. No evento certo, abra **Participantes**.
3. Clique em **Importar participantes**.
4. Clique em **Planilha de participantes** e escolha o arquivo. Se precisar de um exemplo, clique em **Baixar modelo CSV**.
5. Confira o que cada coluna representa e revise a prévia.
6. Clique em **Importar … participantes**.

A janela informa quantas pessoas entraram e quantas linhas foram ignoradas. Use um arquivo CSV ou XLSX de até 2 MB, com os títulos na primeira linha. Depois de fechar a janela, confira a lista do evento.

**Perguntas:** Como importar participantes de um evento? | Como trago os inscritos de uma planilha? | Onde subo o CSV de participantes do evento?

**Fontes:**
- [Ação de importação no evento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventDetailPage.tsx)
- [Planilha, prévia e resumo da importação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventImportModal.tsx)

## EV08 · Exportar a lista de participantes de um evento

1. Abra [**Eventos**](https://crm.organizastudios.com/eventos).
2. No cartão do evento certo, clique em **Participantes**.
3. No alto da página do evento, clique em **Exportar participantes**.
4. Abra o arquivo que o navegador baixou.

A planilha XLSX traz o nome do evento no nome do arquivo.

**Perguntas:** Como exportar participantes de um evento? | Como baixar a lista de inscritos do evento? | Onde baixo a planilha de participantes?

**Fontes:**
- [Botão e geração da planilha](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventDetailPage.tsx)

## EV09 · Converter um participante do evento em cliente

1. Abra [**Eventos**](https://crm.organizastudios.com/eventos) e entre em **Participantes** no evento correto.
2. Na linha da pessoa, clique em **Se tornou cliente**.
3. Se aparecer uma solicitação de dados, confira o que falta e clique em **Preencher cadastro**.
4. Preencha os dados obrigatórios e clique em **Cadastrar cliente**.

O participante aparece com o estado **Cliente** na lista do evento.

**Perguntas:** Como transformar um participante do evento em cliente? | Onde completo o cadastro de cliente de um inscrito?

**Fontes:**
- [Ação na lista de participantes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventDetailPage.tsx)
- [Solicitação de dados e conversão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventConvertModal.tsx)

## EV10 · Registrar contato com um participante de evento

1. Abra [**Eventos**](https://crm.organizastudios.com/eventos) e clique em **Participantes** no evento certo.
2. Localize a pessoa e clique em **Registrar contato**.
3. Em **Contato feito?**, escolha se a pessoa respondeu ou se foi uma tentativa sem resposta.
4. Escolha o **Canal** e revise **Data e hora**.
5. Preencha **Observação** com o que aconteceu.
6. Clique em **Salvar contato**.

O registro é salvo para o participante. Volte à lista do evento para conferir a situação dele.

**Perguntas:** Como registrar contato com um participante? | Como anotar um telefonema para um inscrito do evento? | Onde registro uma tentativa de falar com um participante?

**Fontes:**
- [Ação na lista do evento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventDetailPage.tsx)
- [Campos e salvamento do contato](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventContactModal.tsx)

## EV11 · Remover um participante de um evento

1. Abra [**Eventos**](https://crm.organizastudios.com/eventos) e clique em **Participantes** no evento correto.
2. Localize a pessoa na lista.
3. Na linha dela, clique em **Remover**.
4. Confira o nome da pessoa e do evento na janela de confirmação.
5. Clique em **Remover participante**.

O participante sai da lista desse evento. Se estiver no funil comercial como lead, o cadastro e os contatos registrados permanecem lá.

**Perguntas:** Como remover um participante de um evento? | Como tirar alguém da lista de participantes? | O que acontece com o lead se removo o participante?

**Fontes:**
- [Ação e confirmação de remoção](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/events/EventDetailPage.tsx)

## RE01 · Consultar sugestões de contato e seus motivos

1. Abra [**Contatos sugeridos**](https://crm.organizastudios.com/relacionamento).
2. Na seção **Quem contatar**, veja os cartões dos clientes e o motivo de cada sugestão.
3. Use **Todas** para ver a lista inteira ou clique em um motivo, como **Pagamento atrasado**.
4. Clique no cartão para ler a seção **Situações**.

A janela mostra o motivo que trouxe aquele cliente à lista e os detalhes disponíveis da pendência.

**Perguntas:** Por que um cliente aparece em Contatos sugeridos? | Como ver os motivos de contato sugerido? | Onde filtro os contatos sugeridos por atraso?

**Fontes:**
- [Filtros e cartões de contatos sugeridos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/relationship/RelationshipPage.tsx)
- [Motivos e situações no cartão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/relationship/ClientPendingModal.tsx)

## RE02 · Abrir as pendências de um cliente sugerido

1. Abra [**Contatos sugeridos**](https://crm.organizastudios.com/relacionamento).
2. Em **Quem contatar**, clique no cartão do cliente.
3. Na janela **Pendências de…**, veja **Situações**, **Parcelas em aberto**, **Planos com saldo** e **Contratos em rascunho**, conforme as informações disponíveis.
4. Use **Abrir no Financeiro**, **Abrir em Planos**, **Abrir em Contratos** ou **Abrir ficha do cliente** para seguir no cadastro certo.

Confira o nome do cliente na janela antes de seguir para outra tela.

**Perguntas:** Como abrir as pendências de um contato sugerido? | Onde vejo o que está pendente para um cliente sugerido? | Como abrir a ficha a partir de Contatos sugeridos?

**Fontes:**
- [Abertura das pendências pelo cartão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/relationship/RelationshipPage.tsx)
- [Seções e atalhos da janela de pendências](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/relationship/ClientPendingModal.tsx)

## RE03 · Registrar contato com um cliente sugerido

1. Abra [**Contatos sugeridos**](https://crm.organizastudios.com/relacionamento) e clique no cartão do cliente.
2. Na janela de pendências, clique em **Registrar contato**.
3. Escolha **Resultado** e preencha **Observação**, se necessário.
4. Clique em **Salvar contato**.

A interface confirma o contato registrado para o cliente.

**Perguntas:** Como registrar contato em Contatos sugeridos? | Onde registro o resultado de um contato sugerido?

**Fontes:**
- [Ação no cartão de pendências](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/relationship/ClientPendingModal.tsx)
- [Campos e salvamento do contato](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/relationship/ContactActivityModal.tsx)

## RE04 · Consultar aniversariantes e preparar o contato

1. Abra [**Contatos sugeridos**](https://crm.organizastudios.com/relacionamento).
2. Clique em **Aniversários do mês**.
3. Em **Mês**, selecione o mês que deseja consultar.
4. Localize a pessoa na lista de **Aniversariantes**.
5. Se o cartão mostrar **Dar parabéns**, use o atalho para abrir a mensagem e revise o texto.
6. Quando enviar, volte ao CRM e use **Marcar como enviado** para registrar o contato.

O cartão mostra quem faz aniversário no mês escolhido. As ações de contato dependem dos dados cadastrados para a pessoa.

**Perguntas:** Como consultar aniversariantes do mês? | Onde abro a mensagem de aniversário de um cliente? | Como dar parabéns em Contatos sugeridos?

**Fontes:**
- [Mês, cartões e ações de aniversário](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/relationship/BirthdaysMonthPanel.tsx)

## CO01 · Encontrar uma campanha manual em Comunicações

1. Abra [**Comunicações**](https://crm.organizastudios.com/comunicacoes) e entre em **Campanhas**.
2. Procure o título em **Em andamento** ou **Concluídas**.
3. Clique em **Continuar** para abrir uma campanha em andamento, ou em **Ver** para consultar uma concluída.

As campanhas manuais aparecem agrupadas por situação. Os filtros de destinatário ficam dentro de cada campanha.

**Perguntas:** Onde vejo as campanhas em andamento? | Como localizar uma campanha manual concluída?

**Fontes:**
- [Listagem por situação e ações das campanhas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/communications/campaigns/CampaignsTab.tsx)

## CO02 · Preparar uma campanha manual e conferir os destinatários

1. Abra [**Comunicações**](https://crm.organizastudios.com/comunicacoes) e entre em **Campanhas**.
2. Clique em **Nova campanha**, escolha a mensagem e clique em **Continuar**.
3. Em **Clientes**, selecione as pessoas. Se quiser montar a lista por critérios, use **Por filtros**.
4. Clique em **Conferir quem recebe**.
5. Revise o **Nome da campanha**, os destinatários e a mensagem preparada.
6. Clique em **Criar e começar a enviar** para abrir a fila.

A fila mostra os destinatários pendentes. Cada conversa é aberta individualmente na etapa de envio.

**Perguntas:** Como preparar uma campanha manual de WhatsApp? | Onde vejo quem vai receber uma campanha antes de criar?

**Fontes:**
- [Entrada e fluxo de campanhas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/communications/CommunicationsPage.tsx)

## CO03 · Trabalhar na fila de uma campanha com filtro ativo

1. Abra [**Comunicações**](https://crm.organizastudios.com/comunicacoes), entre em **Campanhas** e clique em **Continuar** na campanha correta.
2. Na fila **Clientes**, escolha **Pendentes**, **Enviadas**, **Puladas** ou **Todas**.
3. Clique no destinatário correto para conferir a mensagem e as ações disponíveis.
4. Depois de registrar o resultado, abra o filtro correspondente para localizar a pessoa novamente.

A pessoa aparece no filtro da nova situação. Confira o nome da campanha e do destinatário ao mudar o filtro.

**Perguntas:** Como filtrar a fila de uma campanha? | Onde vejo os destinatários enviados ou pulados?

**Fontes:**
- [Acesso às campanhas e fila de destinatários](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/communications/CommunicationsPage.tsx)

## CO04 · Abrir o WhatsApp e registrar a situação de uma mensagem manual

1. Abra **Comunicações** e entre na fila da campanha manual que você quer executar.
2. Selecione um destinatário pendente. Confira o telefone e a mensagem. Use **Abrir conversa no WhatsApp** para abrir o canal com o texto ou **Copiar texto** para usar o conteúdo na conversa.
3. Depois de fazer o envio no WhatsApp, volte ao CRM e clique em **Marcar como enviada** ou confirme o envio se a tela perguntar.
4. Se a mensagem ficar sem envio e você quiser seguir para o próximo contato, use **Pular**. Confira a pessoa no filtro **Puladas**. O filtro **Enviadas** mostra as que você confirmou.

Uma mensagem com campos de atendimento exige que o destinatário tenha o atendimento necessário. A fila registra a confirmação feita pela equipe para cada destinatário.

**Perguntas:** Como marcar uma campanha manual como enviada no WhatsApp? | Como pular um destinatário que não recebeu a campanha?

**Fontes:**
- [Ações e filtros da fila](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/communications/campaigns/CampaignSenderPage.tsx)
- [Seleção de campanha e destinatários](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/communications/campaigns/NewCampaignModal.tsx)

## CO05 · Criar uma mensagem padrão e conferir a prévia

1. Abra [**Comunicações**](https://crm.organizastudios.com/comunicacoes) e clique em **Mensagens padrão**.
2. Clique em **Nova mensagem**.
3. Preencha **Título (só a equipe vê)** e **Mensagem**.
4. Use um dos botões **Inserir** para colocar dados que mudam por cliente ou atendimento, se precisar.
5. Confira como a mensagem aparece na prévia.
6. Clique em **Salvar mensagem**.

A mensagem aparece entre as **Ativas**. A prévia usa dados de exemplo para demonstrar como os campos serão preenchidos.

**Perguntas:** Como criar uma mensagem padrão? | Onde vejo uma prévia da mensagem padrão? | Como colocar o nome do cliente em uma mensagem pronta?

**Fontes:**
- [Lista e entrada de nova mensagem](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/communications/CommunicationsPage.tsx)
- [Editor e prévia de mensagem](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/communications/campaigns/TemplateEditorModal.tsx)

## CO06 · Editar, usar em campanha ou arquivar uma mensagem padrão

1. Abra [**Comunicações**](https://crm.organizastudios.com/comunicacoes) e clique em **Mensagens padrão**.
2. Em **Ativas**, encontre a mensagem pelo título.
3. Para modificá-la, abra **Mais ações**, clique em **Editar** e depois em **Salvar mensagem**.
4. Para reaproveitar o texto em uma campanha, clique em **Usar em campanha** no cartão.
5. Para retirar a mensagem da lista de ativas, abra **Mais ações** e clique em **Arquivar**.

Confira as mudanças no cartão. As mensagens arquivadas ficam em **Arquivadas**. Você pode usar **Duplicar** em **Mais ações** para partir de uma cópia.

**Perguntas:** Como editar uma mensagem padrão? | Como arquivar uma mensagem padrão? | Onde reutilizo uma mensagem pronta em uma campanha?

**Fontes:**
- [Cartões, ações e filtros de mensagens](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/communications/CommunicationsPage.tsx)
- [Conteúdo e salvamento da edição](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/communications/campaigns/TemplateEditorModal.tsx)

## CO07 · Criar e programar os momentos de uma campanha automática

1. Abra [**Comunicações**](https://crm.organizastudios.com/comunicacoes) e clique em **Campanhas automáticas**.
2. Clique em **Nova campanha automática**.
3. Preencha **Nome da campanha**, escolha **Evento** e confira **Campanha ativa**.
4. Informe o momento e o texto de **Mensagem 1**. Use **Adicionar mensagem** para criar outro momento.
5. Confira os textos e dias e clique em **Salvar campanha**.

O cartão mostra a campanha e a quantidade de mensagens. Quando houver destinatários elegíveis, as pendências aparecem em **Visão geral → Campanhas automáticas**.

**Perguntas:** Como criar uma campanha automática? | Como programar duas mensagens para um mesmo evento?

**Fontes:**
- [Lista e entrada do editor](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/communications/auto-campaigns/AutoCampaignsTab.tsx)
- [Eventos, mensagem e dias de envio](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/communications/auto-campaigns/AutoCampaignEditorModal.tsx)

## CO08 · Tratar uma pendência de campanha automática

1. Abra [**Visão geral**](https://crm.organizastudios.com/) e entre em **Campanhas automáticas**.
2. Em **Pendentes**, confira a campanha, o destinatário e a mensagem do cartão.
3. Depois do envio pelo canal escolhido, clique em **Enviada**.
4. Se não quiser enviar, clique em **Não enviar**, preencha **Observação (opcional)** se necessário e clique em **Registrar**.

Use **Enviadas** ou **Não enviadas** para conferir o novo estado do cartão.

**Perguntas:** Como registrar que uma mensagem automática não foi enviada? | Onde trato as mensagens pendentes de campanha automática?

**Fontes:**
- [Aba de campanhas no painel inicial](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/dashboard/DashboardPage.tsx)

## CO09 · Registrar manualmente uma resposta de NPS recebida por mensagem

1. Se a resposta veio de uma campanha manual, confira o nome do destinatário na fila da campanha em [**Comunicações**](https://crm.organizastudios.com/comunicacoes).
2. Vá à [**Agenda**](https://crm.organizastudios.com/agenda) e abra os **Detalhes do atendimento** realizado que corresponde à resposta do cliente.
3. Clique em **Registrar satisfação**, escolha a nota de **0 a 10** informada pelo cliente e preencha **Comentário (opcional)** se ele tiver enviado um comentário.
4. Clique em **Salvar avaliação** e confira **Satisfação registrada** com a nota nos detalhes do atendimento.

O registro fica no atendimento. A fila da campanha registra o status do envio e não oferece um campo para lançar ou associar a resposta à campanha. Se o atendimento já tem uma avaliação, os detalhes exibem a nota registrada.

**Perguntas:** Como registrar manualmente uma resposta de NPS de uma campanha? | Onde lanço uma nota de NPS que o cliente respondeu pelo WhatsApp? | A fila da campanha permite registrar resposta de NPS?

**Fontes:**
- [Ações de acompanhamento na fila da campanha](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/communications/campaigns/CampaignSenderPage.tsx)
- [Disponibilidade e nota registrada no atendimento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AppointmentDetailsModal.tsx)
- [Formulário de nota e comentário](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/SatisfactionSurveyModal.tsx)

## CO10 · Preparar lembrete de uma sessão pelo WhatsApp

1. Abra [**Visão geral**](https://crm.organizastudios.com/) e clique em **Campanhas automáticas**.
2. Em **Pendentes**, localize o lembrete do cliente e confira o serviço, a data e o horário.
3. Revise a mensagem do cartão. Se o endereço estiver presente, confira a unidade.
4. Use **WhatsApp** para abrir a conversa com o texto preparado, ou **Copiar mensagem** para copiar o texto.

Revise a conversa antes de enviar. Registre o resultado no CRM depois de tratar o lembrete.

**Perguntas:** Como preparar o WhatsApp de lembrete de sessão? | Onde vejo um lembrete de atendimento que está pendente?

**Fontes:**
- [Aba do painel que exibe os lembretes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/dashboard/DashboardPage.tsx)
- [Escolha do evento e dados do atendimento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/communications/auto-campaigns/AutoCampaignEditorModal.tsx)

## CO11 · Editar preferências de contato do cliente

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes) e abra a ficha do cliente correto.
2. Localize as opções de comunicação na ficha.
3. Marque ou desmarque **WhatsApp** e **E-mail** conforme a preferência informada pelo cliente.
4. Aguarde a mudança na ficha e abra o cadastro novamente para conferir.

A seleção permanece gravada na ficha. Confira o destinatário e os canais respeitados quando preparar campanhas.

**Perguntas:** Como mudar as preferências de contato do cliente? | Onde desligo e-mail ou WhatsApp para um cliente?

**Fontes:**
- [Preferências de comunicação na ficha](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientDetailPage.tsx)

## CT01 · Localizar um documento e consultar os seus detalhes

1. Abra [**Contratos**](https://crm.organizastudios.com/contratos).
2. Na aba **Documentos**, vá a **Emissões e rascunhos**.
3. Em **Situação** ou **Modelo**, selecione a opção que quer consultar.
4. Localize o documento pelo título e cliente.
5. Clique em **Ver detalhes**.

Confira o título, o cliente e a situação na janela. As ações variam conforme o documento esteja em rascunho, emitido, assinado ou cancelado.

**Perguntas:** Como encontrar um contrato no CRM? | Como filtrar os documentos por situação? | Onde vejo os detalhes de um documento?

**Fontes:**
- [Filtros e abertura dos detalhes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentsPage.tsx)
- [Dados e ações por situação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentDetailsModal.tsx)

## CT02 · Criar um modelo de documento

1. Abra [**Contratos**](https://crm.organizastudios.com/contratos).
2. Clique na aba **Criar modelo**.
3. Preencha **Nome do modelo** e confira o **Tipo**.
4. Revise **Conteúdo**. Se precisar começar sem texto, clique em **Começar em branco**.
5. Confira a **Prévia do documento final**. Use **Ampliar prévia** para examinar o texto.
6. Clique em **Criar modelo**.

Abra **Modelos** e confira o nome em **Modelos cadastrados**.

**Perguntas:** Como criar um modelo de contrato? | Onde cadastro um modelo de documento? | Como conferir a prévia de um modelo de contrato?

**Fontes:**
- [Criação e listagem de modelos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentsPage.tsx)
- [Editor de conteúdo do modelo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/TemplateBodyEditor.tsx)

## CT03 · Criar uma versão ou restaurar um modelo de documento

1. Abra [**Contratos**](https://crm.organizastudios.com/contratos) e clique em **Modelos**.
2. Na linha do modelo correto, clique em **Nova versão**.
3. Altere **Conteúdo**, confira a **Prévia do documento final** e clique em **Criar versão**.
4. Para consultar versões, abra **Histórico** na linha do modelo.
5. Selecione uma versão anterior e revise o conteúdo.
6. Clique em **Restaurar versão** com o número da versão escolhida.

Confira no **Histórico** a versão marcada como **Em uso**. Ao restaurar, o sistema cria uma nova versão a partir do conteúdo escolhido e registra de qual versão ele veio.

**Perguntas:** Como editar um modelo de contrato já cadastrado? | Onde crio uma nova versão de um modelo? | Como restaurar a versão antiga de um modelo de documento?

**Fontes:**
- [Ações de versões em Modelos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentsPage.tsx)
- [Edição e criação da versão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/TemplateVersionModal.tsx)
- [Histórico e restauração](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/TemplateHistoryModal.tsx)

## CT04 · Excluir um modelo de documento

1. Abra [**Contratos**](https://crm.organizastudios.com/contratos) e clique em **Modelos**.
2. Localize o modelo em **Modelos cadastrados**.
3. Na linha do modelo certo, clique em **Excluir**.
4. Na janela **Excluir modelo**, confira o nome e confirme em **Excluir modelo**.

O modelo sai da lista. Confira pelo nome antes de fechar a tela.

**Perguntas:** Como excluir um modelo de contrato? | Como apagar um modelo de documento? | Onde retiro um modelo cadastrado em Contratos?

**Fontes:**
- [Ação, confirmação e resultado da exclusão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentsPage.tsx)

## CT05 · Montar um rascunho de contrato e conferir o PDF

1. Abra [**Contratos**](https://crm.organizastudios.com/contratos) e clique em **Novo documento**.
2. Em **Dados**, selecione um **Modelo ativo** e o **Cliente**. Revise **Título** e escolha os vínculos que precisar.
3. Clique em **Preparar conteúdo**.
4. Na etapa **Conteúdo**, revise o texto e clique em **Conferir PDF**.
5. Na etapa **Revisão**, examine o documento. Use **Abrir PDF** se a prévia não aparecer na janela.
6. Clique em **Criar rascunho**.

O documento aparece em **Emissões e rascunhos**. O contrato continua como rascunho até ser emitido.

**Perguntas:** Como criar um rascunho de contrato? | Como ver a prévia do PDF antes de emitir? | Onde reviso o conteúdo de um documento novo?

**Fontes:**
- [Entrada de novo documento em Contratos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentsPage.tsx)
- [Etapas, prévia e criação do rascunho](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentWizard.tsx)

## CT06 · Editar um rascunho e emitir o contrato

1. Abra [**Contratos**](https://crm.organizastudios.com/contratos).
2. Em **Emissões e rascunhos**, encontre o contrato e clique em **Ver detalhes**.
3. Clique em **Revisar rascunho** e volte à etapa **Conteúdo** se precisar alterar o texto. Revise **Conteúdo** e confira a prévia do PDF.
4. Quando o documento estiver pronto, clique em **Emitir**.
5. Na confirmação, confira o cliente e o PDF e clique em **Emitir contrato**.

O documento aparece como emitido. Confira a situação antes de preparar o envio da assinatura.

**Perguntas:** Como emitir um contrato em rascunho? | Como editar um rascunho de contrato? | Onde finalizo a emissão de um documento?

**Fontes:**
- [Ações de detalhe do contrato](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentDetailsModal.tsx)
- [Revisão e emissão do rascunho](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentWizard.tsx)

## CT07 · Baixar ou imprimir um contrato emitido

1. Abra [**Contratos**](https://crm.organizastudios.com/contratos) e entre na aba **Documentos**.
2. Encontre o contrato emitido e clique em **Ver detalhes**.
3. Clique em **Salvar PDF** para baixar uma cópia.
4. Para imprimir, clique em **Imprimir** e revise as opções do navegador.

O arquivo é baixado como PDF com o título do contrato. Confira a cópia antes de compartilhar ou imprimir.

**Perguntas:** Como baixar um contrato em PDF? | Como imprimir um contrato emitido? | Onde fica Salvar PDF em Contratos?

**Fontes:**
- [Botões de download e impressão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentDetailsModal.tsx)
- [Geração do arquivo e impressão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentsPage.tsx)

## CT08 · Gerar e compartilhar um link de assinatura de contrato

1. Abra [**Contratos**](https://crm.organizastudios.com/contratos).
2. Na aba **Documentos**, localize o contrato emitido e clique em **Ver detalhes**.
3. Clique em **Enviar pelo WhatsApp** para abrir **Enviar para assinatura**.
4. Confira **Link de assinatura**, a mensagem e o prazo de validade.
5. Use **Copiar link** para compartilhar pelo canal escolhido ou **Abrir WhatsApp** para revisar a mensagem na conversa.

O link abre o contrato em uma página de assinatura. Se usar o WhatsApp, confirme o destinatário antes de enviar.

**Perguntas:** Como gerar link de assinatura de contrato? | Como mandar um contrato para assinar por WhatsApp? | Onde copio o link de um contrato?

**Fontes:**
- [Ação de envio do contrato emitido](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentDetailsModal.tsx)
- [Geração, prazo e compartilhamento do link](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/SignatureRequest.tsx)

## CT09 · Registrar a assinatura presencial de um contrato

1. Abra [**Contratos**](https://crm.organizastudios.com/contratos) e clique em **Ver detalhes** na linha do contrato emitido.
2. Clique em **Registrar assinatura manual**.
3. Confira **Data da assinatura** e **Responsável pela obtenção**.
4. Em **Cópia do documento assinado**, selecione o arquivo.
5. Clique em **Registrar assinatura**.

A seção **Assinatura** passa a oferecer **Baixar cópia assinada**.

**Perguntas:** Como lançar uma assinatura presencial de contrato? | Onde anexo o contrato assinado à mão? | Como registrar assinatura manual em Contratos?

**Fontes:**
- [Formulário de registro manual e acesso à cópia](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentSignatureActions.tsx)

## CT10 · Acompanhar a assinatura e abrir o contrato assinado

1. Abra [**Contratos**](https://crm.organizastudios.com/contratos).
2. Em **Documentos**, encontre o contrato e clique em **Ver detalhes**.
3. Na seção **Assinatura**, confira a situação e os registros disponíveis.
4. Quando aparecer **Assinado**, clique em **Ver contrato assinado**.
5. Se precisar ver as informações registradas, clique em **Ver registro**.

A seção identifica quem assinou e quando. O contrato assinado pode ser aberto para conferência.

**Perguntas:** Como saber se um contrato foi assinado? | Onde vejo o contrato assinado pelo cliente? | Como acompanhar a assinatura de um documento?

**Fontes:**
- [Dados e ações da assinatura](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentSignatureActions.tsx)
- [Registro do link e da assinatura](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/SignatureLinkRecord.tsx)

## CT11 · Cancelar um documento

1. Abra [**Contratos**](https://crm.organizastudios.com/contratos) e vá à aba **Documentos**.
2. Na linha do documento correto, clique em **Ver detalhes**.
3. Clique em **Cancelar documento**.
4. Na confirmação, preencha **Motivo**.
5. Clique em **Cancelar documento** para confirmar.

O detalhe passa a mostrar **Cancelado**. Use o filtro **Situação** na lista para encontrar o documento depois.

**Perguntas:** Como cancelar um documento? | Como cancelar um contrato emitido? | Onde coloco o motivo do cancelamento de um contrato?

**Fontes:**
- [Opção de cancelamento nos detalhes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentDetailsModal.tsx)
- [Confirmação e atualização da lista](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/DocumentsPage.tsx)

## CT12 · Consultar os documentos enviados para um fornecedor

1. Em **Vendas de produtos**, abra **Fornecedores**, localize o fornecedor e clique em **Editar**.
2. Abra **Documentos** e confira a seção **Documentos enviados**. Cada entrada traz o título do documento e os dados da assinatura disponíveis.
3. Use **Ver registro** quando ele estiver disponível. Se precisar reenviar um documento ainda pendente de assinatura e o botão estiver disponível, use **WhatsApp** na entrada correspondente.

Se a lista estiver vazia, o CRM mostra **Nenhum documento enviado para assinatura**. Para emitir pelo cadastro do fornecedor, confira o **E-mail** em **Dados**, selecione um modelo em **Documentos** e use **Salvar e enviar pelo WhatsApp**.

**Perguntas:** Onde vejo os documentos de um fornecedor? | Como abrir o registro de um documento enviado ao fornecedor?

**Fontes:**
- [Cadastro do fornecedor](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/SupplierModal.tsx)
- [Documentos e ações de assinatura](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/SupplierDocuments.tsx)

## AS01 · Ler e assinar um contrato recebido por link

1. Abra o link de assinatura que você recebeu da clínica.
2. Leia o contrato e confira os dados.
3. Na seção **Assinatura**, confira **Nome completo** e preencha **CPF de quem assina**.
4. Desenhe sua assinatura na **Área de assinatura**. Use **Limpar assinatura** se quiser refazer.
5. Marque **Li o documento e concordo com os seus termos.**
6. Clique em **Assinar documento**.

A página confirma a assinatura. Consulte a cópia assinada ou use a opção de impressão da página se precisar guardar o documento.

**Perguntas:** Como assinar um contrato recebido por link? | Como assino um contrato pelo celular? | Onde desenho minha assinatura no contrato?

**Fontes:**
- [Página pública e confirmação da assinatura](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/PublicSignaturePage.tsx)
- [Campos do formulário público](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/contracts/PublicSignatureLayout.tsx)

## AS02 · Ler e assinar um recibo recebido por link

1. Abra o link de assinatura do recibo que você recebeu.
2. Confira no **Recibo de pagamento** o nome, o valor e a descrição do pagamento.
3. Na seção **Assinatura**, confira **Nome completo** e preencha **CPF de quem assina**.
4. Desenhe sua assinatura na **Área de assinatura**.
5. Marque **Conferi o recibo e confirmo o pagamento descrito.**
6. Clique em **Assinar recibo**.

A página informa que o recibo foi assinado e mostra a assinatura registrada. Use **Imprimir ou salvar PDF** se precisar guardar uma cópia.

**Perguntas:** Como assinar um recibo que recebi por link? | Como assino um recibo pelo celular? | Como assinar um recibo pelo celular? | Onde coloco meu CPF para assinar o recibo?

**Fontes:**
- [Página pública e confirmação do recibo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PublicReceiptSignaturePage.tsx)
- [Teste de assinatura em tela de celular](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/e2e/public-signature.spec.ts)

## VE01 · Registrar uma venda de produto

1. Abra [**Vendas de produtos**](https://crm.organizastudios.com/vendas) e vá à aba **Nova venda**.
2. Em **Cliente**, procure o nome e selecione o cadastro.
3. Em **Produto 1**, escolha o produto. Confira **Quantidade** e **Preço unitário**.
4. Use **Adicionar produto** para incluir outros itens.
5. Em **Pagamento**, escolha **Pago agora** ou **A receber**. Se o valor já entrou, selecione a **Forma de pagamento**.
6. Revise o total e clique em **Registrar venda**.

Confira a venda em **Vendas realizadas** pelo nome do cliente e pelo valor.

**Perguntas:** Como vender um produto? | Como registrar uma venda de produto? | Onde lanço uma nova venda no estoque?

**Fontes:**
- [Formulário de venda, pagamento e total](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/NewSaleSection.tsx)

## VE02 · Dividir o pagamento de uma venda de produto

1. Abra [**Vendas de produtos**](https://crm.organizastudios.com/vendas) e preencha **Nova venda** com o cliente e os produtos.
2. Selecione **Pago agora** em **Pagamento**.
3. Clique em **Adicionar forma de pagamento**.
4. Escolha cada **Forma de pagamento** e preencha o valor de cada uma.
5. Confira a soma e o total da venda.
6. Clique em **Registrar venda**.

A venda aparece em **Vendas realizadas**. Abra **Ver** para conferir os dados do registro.

**Perguntas:** Como dividir o pagamento de uma venda? | Como vender um produto com Pix e cartão? | Como adicionar duas formas de pagamento em Vendas?

**Fontes:**
- [Formas de pagamento no formulário da venda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/NewSaleSection.tsx)

## VE03 · Consultar o histórico, detalhes e resumo de vendas

1. Abra [**Vendas de produtos**](https://crm.organizastudios.com/vendas) e clique em **Vendas realizadas**.
2. Confira **De** e **Até** e refine a lista por **Vendedor**, **Produto**, **Situação** ou valor.
3. Na linha da venda, clique em **Ver** para abrir os detalhes.
4. Para conferir os totais do módulo, abra **Resumo** e ajuste **Período**.

Em **Vendas realizadas**, confira a venda individual. Em **Resumo**, veja os produtos mais vendidos e use os filtros disponíveis.

**Perguntas:** Como consultar o histórico de vendas de produtos? | Onde vejo os detalhes de uma venda? | Como ver o resumo de vendas de produtos?

**Fontes:**
- [Histórico, filtros e detalhes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/SalesHistorySection.tsx)
- [Período e indicadores do resumo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/SalesSummarySection.tsx)

## VE04 · Cancelar uma venda que ainda está a receber

1. Abra [**Vendas de produtos**](https://crm.organizastudios.com/vendas) e clique em **Vendas realizadas**.
2. Em **Situação**, selecione **A receber**.
3. Abra **Ver** na linha da venda correta.
4. Clique em **Cancelar venda** e informe **Motivo do cancelamento**.
5. Confirme em **Cancelar venda**.

Mude o filtro para **Cancelada** ou volte à lista geral para localizar o registro. Confira a situação e o motivo nos detalhes.

**Perguntas:** Como cancelar uma venda a receber? | Onde cancelo uma venda de produto ainda não paga?

**Fontes:**
- [Histórico e filtro de situação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/SalesHistorySection.tsx)
- [Motivo e confirmação do cancelamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/SaleDetailsModal.tsx)

## VE05 · Estornar o pagamento e cancelar uma venda paga

1. Abra [**Vendas de produtos**](https://crm.organizastudios.com/vendas) e entre em **Vendas realizadas**.
2. Abra **Ver** na linha da venda paga e confirme o cliente e o total.
3. Clique em **Cancelar venda**.
4. Informe **Motivo do cancelamento** e marque **Estornar o pagamento** com o valor exibido.
5. Clique em **Estornar e cancelar**.

O histórico mostra a venda como **Cancelada**. Confira o recebimento no **Financeiro** e a quantidade do produto em **Estoque**.

**Perguntas:** Como estornar e cancelar uma venda paga? | Onde devolvo o pagamento de uma venda de produto?

**Fontes:**
- [Venda paga e confirmação do estorno e cancelamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/SaleDetailsModal.tsx)
- [Histórico da venda após o cancelamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/SalesHistorySection.tsx)

## VE06 · Consultar estoque e iniciar uma venda pelo estoque

1. Abra [**Vendas de produtos**](https://crm.organizastudios.com/vendas).
2. Clique em **Estoque**.
3. Em **Produtos**, localize o item e confira a quantidade disponível. Para acompanhar as movimentações, consulte **Histórico de estoque**.
4. Para iniciar uma venda, clique em **Registrar venda** no alto da área de estoque.

A aba **Nova venda** abre para escolher o cliente e os itens.

**Perguntas:** Onde consulto o estoque de produtos? | Como iniciar uma venda pelo estoque? | Onde vejo as movimentações dos produtos?

**Fontes:**
- [Lista, movimentações e atalho de venda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/InventorySection.tsx)

## VE07 · Cadastrar um produto com preço e estoque inicial

1. Abra [**Vendas de produtos**](https://crm.organizastudios.com/vendas).
2. Clique em **Estoque** e depois em **Novo produto**.
3. Preencha **Nome** e confira **Unidade**.
4. Informe **Custo (R$)**, **Preço de venda (R$)** e **Estoque inicial**.
5. Escolha **Categoria** ou **Marca** se precisar.
6. Clique em **Salvar produto**.

Confira o produto na lista **Produtos**, com preço e quantidade disponíveis.

**Perguntas:** Como cadastrar um produto? | Como cadastrar produto com estoque inicial? | Onde informo o preço de venda do produto?

**Fontes:**
- [Estoque e entrada do cadastro](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/InventorySection.tsx)
- [Campos e salvamento do produto](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/ProductModal.tsx)

## VE08 · Editar um produto cadastrado

1. Abra [**Vendas de produtos**](https://crm.organizastudios.com/vendas) e clique em **Estoque**.
2. Na lista **Produtos**, encontre o item pelo nome.
3. Na linha do produto, clique em **Editar**.
4. Atualize os dados que precisar, como nome, preço, categoria ou marca.
5. Clique em **Salvar produto**.

Confira as informações atualizadas na lista. Para corrigir somente a quantidade, use **Ajustar estoque**.

**Perguntas:** Como editar um produto? | Como mudar o preço de um produto cadastrado? | Onde altero o nome de um item do estoque?

**Fontes:**
- [Ação de edição no estoque](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/InventorySection.tsx)
- [Formulário do produto](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/ProductModal.tsx)

## VE09 · Ajustar o estoque de um produto

1. Abra [**Vendas de produtos**](https://crm.organizastudios.com/vendas) e clique em **Estoque**.
2. Clique em **Ajustar estoque**.
3. Escolha o **Produto** e o **Tipo** de ajuste.
4. Preencha a **Quantidade** e o **Motivo**.
5. Clique em **Salvar ajuste**.

Confira a quantidade atual do produto e a nova movimentação em **Histórico de estoque**.

**Perguntas:** Como ajustar o estoque de um produto? | Como corrigir a quantidade em estoque? | Onde registro uma entrada ou saída de estoque?

**Fontes:**
- [Entrada do ajuste e histórico de estoque](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/InventorySection.tsx)

## VE10 · Cadastrar categorias e marcas de produtos

1. Abra [**Vendas de produtos**](https://crm.organizastudios.com/vendas) e clique em **Categorias e marcas**.
2. Em **Categorias de produtos** ou **Marcas**, clique em **Adicionar**.
3. Preencha **Nome** e confira a opção **Ativo**.
4. Para uma categoria que usa numeração ou tamanhos, marque **Os itens desta categoria têm tamanhos**.
5. Clique em **Salvar**.

Confira o cadastro no quadro em que o criou. As categorias e marcas ativas ficam disponíveis no cadastro de produtos.

**Perguntas:** Como cadastrar uma categoria de produto? | Como adicionar uma marca de produto? | Onde gerencio as categorias e marcas em Vendas?

**Fontes:**
- [Quadros e formulário de categorias e marcas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/ProductCatalogsSection.tsx)

## VE11 · Cadastrar ou editar um fornecedor em Vendas

1. Abra [**Vendas de produtos**](https://crm.organizastudios.com/vendas) e clique em **Fornecedores**.
2. Para cadastrar, clique em **Novo fornecedor**. Para modificar um fornecedor, encontre o nome e clique em **Editar**.
3. Em **Dados**, preencha **Nome**, escolha **Tipo** e revise os dados de contato.
4. Confira a opção **Ativo**.
5. Clique em **Salvar fornecedor**.

O nome aparece na lista de **Fornecedores**. Use **Pedidos** na linha correspondente para consultar os pedidos daquele fornecedor.

**Perguntas:** Como cadastrar fornecedor em Vendas? | Onde edito um fornecedor de produtos? | Como abrir os pedidos de um fornecedor em Vendas?

**Fontes:**
- [Aba Fornecedores em Vendas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/SalesSuppliersSection.tsx)

## FI01 · Localizar e filtrar parcelas em Contas a receber

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro).
2. Clique em **Contas a receber**.
3. Em **Buscar por cliente**, informe o nome para reduzir a lista.
4. Selecione **Todas**, **Em aberto**, **Vencidas**, **Pagas** ou **Canceladas** acima da lista.
5. Para combinar filtros, clique em **Filtrar lançamentos**.
6. Escolha a **Data considerada** e preencha **De** e **Até** se precisar. Use as opções de plano, serviço ou pagamento para refinar a lista.
7. Clique em **Salvar filtros**.
8. Confira o cliente, a descrição, o vencimento e o valor. Na linha correspondente, clique em **Mais** para abrir as ações da parcela.

As ações disponíveis variam conforme a situação da parcela. Se a lista estiver vazia, confira a filial selecionada, o filtro de situação e as datas.

**Perguntas:** Como localizar uma parcela no Financeiro? | Como filtrar parcelas vencidas? | Onde ficam as opções de uma parcela em Contas a receber?

**Fontes:**
- [Lista de parcelas e ações por situação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReceivablesList.tsx)
- [Datas e filtros de classificação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinanceEntryFilters.tsx)

## FI03 · Registrar um recebimento parcial

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Contas a receber**.
2. Localize a parcela e clique em **Dar baixa**.
3. Confirme a **Forma de pagamento recebida**.
4. Em **Valor recebido**, digite o valor que realmente entrou.
5. Confira o aviso **Pagamento parcial** e o saldo que ficará em aberto.
6. Clique em **Confirmar baixa**.

A parcela original aparece paga pelo valor recebido. O restante aparece como outra parcela em aberto, com **· saldo** na descrição.

**Perguntas:** Como registrar um recebimento parcial? | Como dar baixa só em parte da parcela? | Onde informo o valor recebido quando o cliente pagou uma parte?

**Fontes:**
- [Valor recebido, conferência e baixa parcial](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/SettleModal.tsx)
- [Exibição das parcelas após a baixa](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReceivablesList.tsx)

## FI04 · Registrar um recebimento dividido entre formas de pagamento

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Contas a receber**.
2. Na parcela correta, clique em **Dar baixa**.
3. Clique em **Adicionar forma de pagamento**.
4. Escolha as formas que recebeu e preencha o **Valor** de cada uma. Se aplicável, ajuste o **Parcelamento**.
5. Confira se **Soma das formas** corresponde ao **Valor final**.
6. Clique em **Confirmar baixa**.

A parcela aparece em **Pagas**. O **Recibo** mostra as formas e os valores registrados.

**Perguntas:** Como dividir uma baixa em Pix e cartão? | Como dar baixa com duas formas de pagamento? | Como registrar um recebimento dividido?

**Fontes:**
- [Formas, valores e confirmação da baixa](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/SettleModal.tsx)
- [Apresentação do pagamento no recibo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReceiptModal.tsx)

## FI05 · Ajustar o valor de uma parcela em aberto

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Contas a receber**.
2. Localize a parcela em aberto e confira o cliente e o valor.
3. Abra **Mais** na linha da parcela e clique em **Ajustar**.
4. Preencha **Novo valor (R$)** e **Justificativa**.
5. Clique em **Confirmar**.

Confira o valor atualizado. A justificativa fica registrada no histórico.

**Perguntas:** Como ajustar uma parcela em aberto? | Onde corrijo o valor de uma parcela antes da baixa?

**Fontes:**
- [Ações da parcela](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReceivablesList.tsx)
- [Valor e justificativa](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReceivableAdjustModal.tsx)

## FI07 · Anexar, baixar ou excluir um comprovante de pagamento

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Contas a receber**.
2. Durante a baixa, use **Adicionar comprovantes (opcional)** para escolher os arquivos.
3. Para revisar depois, na linha da parcela paga abra **Mais** e escolha **Comprovantes**.
4. Em **Anexados**, use **Baixar** ao lado do arquivo que quer consultar. Use **Arquivos** para anexar outro comprovante.
5. Para retirar um arquivo, clique em **Excluir** no item certo, preencha **Motivo** e clique em **Excluir comprovante**.

Confira os arquivos em **Anexados**. O formulário da baixa aceita PDF, PNG ou JPEG de até 5 MB por arquivo.

**Perguntas:** Como anexar comprovante de pagamento? | Onde baixo um comprovante da parcela? | Como remover um comprovante da baixa?

**Fontes:**
- [Anexo no formulário de baixa](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/SettleModal.tsx)
- [Lista, download e exclusão com motivo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PaymentProofs.tsx)

## FI08 · Consultar, imprimir ou acompanhar um recibo

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Contas a receber**.
2. Selecione **Pagas** para localizar a parcela quitada.
3. Na linha certa, clique em **Recibo**.
4. Confira a descrição, o valor e as formas de pagamento.
5. Em **Assinatura do recibo**, veja os campos **Enviado em**, **Visualizado em** e **Assinado em**.
6. Clique em **Imprimir recibo** para abrir a impressão do navegador.

O número do recibo aparece no topo da janela. Use a opção de impressão do navegador para imprimir ou salvar em PDF.

**Perguntas:** Como ver o recibo de uma parcela? | Como imprimir um recibo de pagamento? | Onde acompanho a assinatura do recibo?

**Fontes:**
- [Ação Recibo na parcela paga](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReceivablesList.tsx)
- [Detalhes, impressão e acompanhamento do recibo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReceiptModal.tsx)

## FI09 · Preparar o envio do link de assinatura de um recibo

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Contas a receber**.
2. Selecione **Pagas** e localize a parcela pelo cliente, descrição e valor.
3. Clique em **Recibo** na linha correta.
4. Confira os dados e clique em **Enviar recibo pelo WhatsApp**.
5. Confira a conversa e a mensagem com o link de assinatura antes de enviar.

O cliente abre o link para conferir e assinar o recibo. Volte à seção **Assinatura do recibo** para ver a situação registrada no CRM.

**Perguntas:** Como enviar recibo para assinatura pelo WhatsApp? | Onde fica o link para o cliente assinar o recibo? | Como compartilhar a assinatura de um recibo?

**Fontes:**
- [Link e acompanhamento no recibo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReceiptModal.tsx)

## FI10 · Preparar um contato sobre uma parcela

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Contas a receber**.
2. Localize a parcela e confira cliente, descrição, valor e vencimento.
3. Em **Mais**, clique em **Entrar em contato**.
4. Revise **Mensagem** e escolha **Ligar** ou **Enviar pelo WhatsApp**, conforme o que estiver disponível.

Confira o destinatário e o conteúdo no canal antes de enviar. A mensagem preparada inclui os dados da parcela.

**Perguntas:** Como contatar um cliente sobre uma parcela? | Onde preparo um lembrete de parcela pelo WhatsApp?

**Fontes:**
- [Menu da parcela](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReceivablesList.tsx)
- [Mensagem e canais da parcela](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReceivableContactModal.tsx)

## FI12 · Renegociar parcelas a receber

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Contas a receber**.
2. Marque as parcelas abertas do cliente e clique em **Renegociar**.
3. Revise **Novo valor total (R$)**, **Número de parcelas** e **Primeiro vencimento**.
4. Preencha **Motivo da renegociação** e clique em **Confirmar**.

As parcelas antigas ficam canceladas e as novas aparecem com o valor dividido e vencimentos mensais.

**Perguntas:** Como renegociar parcelas de um cliente? | Onde divido um saldo em novas parcelas no Financeiro?

**Fontes:**
- [Seleção e ação na lista](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReceivablesList.tsx)
- [Execução da renegociação no Financeiro](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinancePage.tsx)

## FI13 · Corrigir datas ou classificar um lançamento

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e entre em **Lançamentos**.
2. Localize a linha pela descrição e pelo valor.
3. Para classificar, abra **Classificar**, ajuste os campos disponíveis e clique em **Salvar lançamento**.
4. Para corrigir datas, abra **Datas financeiras** e ajuste a data correspondente.
5. Preencha **Motivo do ajuste** e clique em **Salvar datas**.

Abra a linha novamente para conferir a classificação e as datas corrigidas.

**Perguntas:** Como corrigir a data de um lançamento? | Onde altero a categoria ou centro de custo de um lançamento?

**Fontes:**
- [Seleção e ações dos lançamentos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinanceClassificationPanel.tsx)
- [Fluxo dos lançamentos financeiros](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinancePage.tsx)

## FI14 · Localizar e filtrar contas a pagar

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Contas a pagar**.
2. Em **Contas**, clique em **Filtrar lançamentos**.
3. Use **Pesquisar lançamento** para localizar pela descrição.
4. Escolha, se precisar, **Data considerada**, o intervalo, **Situação do lançamento**, categoria ou fornecedor.
5. Clique em **Salvar filtros**.

Confira o resultado nos grupos da lista, como **A vencer**. Use **Limpar campos** na janela se precisar descartar os filtros.

**Perguntas:** Como filtrar contas a pagar? | Onde localizo uma despesa no Financeiro? | Como buscar um lançamento em Contas a pagar?

**Fontes:**
- [Contas a pagar e acesso à lista](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinancePage.tsx)
- [Pesquisa e filtros dos lançamentos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinanceEntryFilters.tsx)

## FI15 · Registrar uma despesa pontual

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Nova despesa**.
2. Em **Tipo de despesa**, escolha **Pontual (uma vez)**.
3. Preencha **Descrição** e selecione a **Categoria**. Informe o **Fornecedor** e o **Centro de custo** se precisar.
4. Preencha **Valor** e revise a data. Confira se a data informada representa **Vencimento** ou **Lançamento**.
5. Clique em **Cadastrar despesa**.

Abra **Contas a pagar** e confira a despesa com a data e o valor informados.

**Perguntas:** Como registrar uma despesa pontual? | Como cadastrar uma conta a pagar de uma vez? | Onde lanço uma despesa avulsa?

**Fontes:**
- [Entrada e lista de contas a pagar](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinancePage.tsx)
- [Campos e salvamento da despesa](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/NewExpenseModal.tsx)

## FI16 · Cadastrar uma despesa recorrente

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Nova despesa**.
2. Em **Tipo de despesa**, marque **Fixa (todo mês)**.
3. Preencha **Descrição** e confira a **Categoria**.
4. Escolha **Tipo de valor** e preencha o valor mensal, quando já estiver definido.
5. Informe **Mês inicial**, **Dia do vencimento** e **Mês final (opcional)**, se houver.
6. Se precisar de lembrete, confira **Avisar antes do vencimento**.
7. Clique em **Cadastrar despesa fixa**.

A recorrência aparece em **Contas a pagar → Despesas fixas**. Cada mês do período pode gerar uma conta em **Contas**.

**Perguntas:** Como cadastrar uma despesa recorrente? | Como lançar a mesma conta todos os meses? | Onde cadastro uma despesa fixa?

**Fontes:**
- [Opções e salvamento da despesa fixa](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/NewExpenseModal.tsx)
- [Lista de despesas fixas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/RecurringPayablesSection.tsx)

## FI17 · Editar ou encerrar uma despesa recorrente

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e vá a **Contas a pagar → Despesas fixas**.
2. Localize a despesa pelo nome.
3. Para corrigir os dados, clique em **Editar**, faça os ajustes e clique em **Salvar alterações**.
4. Para encerrar a recorrência, na linha dela abra **Mais ações** e clique em **Encerrar**.
5. Confira **Último mês** e clique em **Encerrar despesa fixa**.

Confira a situação na lista. A partir do mês seguinte ao último mês escolhido, a recorrência deixa de gerar novas contas.

**Perguntas:** Como editar uma despesa fixa? | Como encerrar uma recorrência no Financeiro? | Onde paro de gerar uma conta todo mês?

**Fontes:**
- [Lista de recorrências e ações](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/RecurringPayablesSection.tsx)
- [Formulário de edição](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/RecurringPayableModal.tsx)
- [Último mês e confirmação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/RecurringPayableEndModal.tsx)

## FI18 · Registrar o pagamento de uma conta a pagar

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Contas a pagar**.
2. Localize a conta pelo nome, pelo valor e pelo vencimento.
3. Clique em **Pagar** na linha correspondente.
4. Em **Forma de pagamento usada**, selecione como a conta foi paga.
5. Se o pagamento foi feito em outra data, marque **Pagamento antigo?** e informe a data e a hora.
6. Clique em **Confirmar pagamento**.

Confira a conta entre os pagamentos registrados. Para corrigir um pagamento registrado por engano, use o estorno da despesa.

**Perguntas:** Como pagar uma conta a pagar no CRM? | Como registrar pagamento de despesa? | Onde confirmo o pagamento de uma conta?

**Fontes:**
- [Ação Pagar na lista](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PayablesList.tsx)
- [Datas, forma e confirmação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PayableModal.tsx)

## FI19 · Informar o valor de uma conta a pagar variável

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Contas a pagar**.
2. Em **Contas**, procure a conta aberta que aparece com valor a informar.
3. Na linha dela, clique em **Informar valor**.
4. Preencha **Valor do mês** e clique em **Salvar valor**.

Confira o valor e a ação **Pagar** na linha. **Informar valor** aparece nas contas com valor pendente.

**Perguntas:** Como ajustar uma conta a pagar de valor variável? | Onde informo o valor do mês de uma despesa fixa variável?

**Fontes:**
- [Condição da ação Informar valor](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PayablesList.tsx)
- [Valor mensal e confirmação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PayableAmountModal.tsx)

## FI20 · Estornar o pagamento de uma despesa

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Contas a pagar**.
2. Localize a despesa que teve o pagamento registrado.
3. Na linha correspondente, clique em **Estornar**.
4. Em **Estornar pagamento**, preencha **Motivo**.
5. Clique em **Estornar pagamento**.

A conta volta a ficar em aberto. A ação **Pagar** fica disponível novamente.

**Perguntas:** Como estornar o pagamento de uma despesa? | Como desfazer um pagamento em Contas a pagar? | Onde registro por que estou estornando uma despesa?

**Fontes:**
- [Ação na linha da despesa paga](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PayablesList.tsx)
- [Motivo e confirmação do estorno](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReversePaymentModal.tsx)

## FI21 · Cadastrar uma categoria ou um centro de custo

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro).
2. Clique em **Nova categoria** para criar uma classificação ou em **Novo centro de custo** para identificar a área responsável pelo valor.
3. Preencha **Nome**.
4. Clique em **Salvar**.

O cadastro fica disponível nos campos de classificação dos lançamentos. Em **Nova despesa**, também é possível iniciar o cadastro pela opção **+ Nova categoria** ou **+ Novo centro de custo**.

**Perguntas:** Como cadastrar uma categoria de despesa? | Onde crio um centro de custo? | Como criar uma categoria no Financeiro?

**Fontes:**
- [Atalhos e salvamento da classificação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinancePage.tsx)
- [Opções de cadastro na despesa](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/NewExpenseModal.tsx)

## FI22 · Cadastrar ou editar um fornecedor para uma despesa

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Nova despesa**.
2. Em **Fornecedor**, escolha **+ Novo fornecedor**.
3. Preencha **Nome** e os dados do fornecedor e clique em **Salvar fornecedor**.
4. Confira o fornecedor selecionado e conclua a despesa. Para editar um cadastro existente, abra **Vendas de produtos → Fornecedores** e use **Editar**.

O fornecedor fica disponível na lista e aparece associado à despesa salva.

**Perguntas:** Como cadastrar um fornecedor direto no Financeiro? | Onde edito os dados de um fornecedor usado em despesas?

**Fontes:**
- [Cadastro dentro da despesa](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/NewExpenseModal.tsx)
- [Edição e salvamento do fornecedor](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/SupplierModal.tsx)

## FI23 · Consultar ou cadastrar um pedido de fornecedor

1. Abra [**Vendas de produtos**](https://crm.organizastudios.com/vendas) e clique em **Fornecedores**.
2. Na linha do fornecedor, clique em **Pedidos**.
3. Para cadastrar, clique em **Novo pedido**. Informe **Data do pedido**, **Nº do pedido** e **Valor do pedido (R$)**.
4. Adicione os produtos, confira a quantidade e o custo de cada item, e revise a soma.
5. Clique em **Registrar pedido**.

Confira o número do pedido na lista do fornecedor. O formulário pede o valor do pedido mesmo quando a soma dos itens já aparece.

**Perguntas:** Como cadastrar um pedido de fornecedor? | Onde consulto os pedidos de um fornecedor?

**Fontes:**
- [Acesso aos pedidos pelo fornecedor](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/sales/SalesSuppliersSection.tsx)

## FI24 · Consultar comissões e entender a regra aplicada

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e entre em **Comissões**.
2. Localize o profissional e confira a competência na linha.
3. Compare **Base de cálculo**, **Percentual**, **Comissão** e **Situação**.
4. Para revisar o cadastro de quem tem usuário vinculado, consulte **Configurações → Usuários**.

A tela informa que a comissão cadastrada no usuário prevalece sobre a regra do profissional.

**Perguntas:** Onde vejo as comissões no Financeiro? | Como descobrir qual percentual entrou na comissão do profissional?

**Fontes:**
- [Aba de comissões e precedência das regras](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinancePage.tsx)
- [Tabela e situação de cada comissão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/CommissionsList.tsx)

## FI25 · Criar uma regra de comissão e conferir o recálculo

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Comissões**.
2. Clique em **Nova regra**.
3. Selecione **Origem da regra** e escolha o usuário ou profissional.
4. Preencha **Percentual (%)**, **Vale a partir de** e, se necessário, **Vale até**.
5. Clique em **Salvar**. Se houver uma prévia de recálculo, confira os valores antes de usar **Confirmar e recalcular**.

Volte à tabela e confira o percentual e a comissão na linha do profissional. A regra do usuário é prioritária quando existe uma regra vigente no cadastro dele.

**Perguntas:** Como criar uma regra de comissão? | Onde altero o percentual e reviso o recálculo das comissões?

**Fontes:**
- [Regra, vigência e prévia de recálculo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/CommissionRuleModal.tsx)

## FI26 · Gerar comissões do mês

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e entre em **Comissões**.
2. Confira se há uma regra vigente e se o atendimento ou a presença foi registrado.
3. Clique em **Gerar comissões do mês**.
4. Aguarde a atualização e confira profissional, competência e valor na lista.

As comissões elegíveis aparecem com a situação e os valores calculados. A lista indica quando não há comissão gerada.

**Perguntas:** Como gerar comissões do mês? | Onde calculo comissões de atendimentos ou presença em turma?

**Fontes:**
- [Ação de gerar comissões](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinancePage.tsx)
- [Comissões calculadas e seus valores](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/CommissionsList.tsx)

## FI27 · Pagar ou estornar uma comissão pela folha

1. Em **Financeiro › Comissões**, encontre o lançamento na competência desejada.
2. Abra **Folha**, revise a comissão na composição do colaborador e lance a folha.
3. Em **Contas a pagar**, localize a despesa **Folha** do mês e do colaborador. Clique em **Pagar** e registre a baixa com os dados do pagamento efetivo.
4. Se precisar reverter essa baixa, vá à seção **Pagas** em **Contas a pagar**, clique em **Estornar** na mesma despesa, preencha **Motivo** e confirme em **Estornar pagamento**.
5. Confira que a conta voltou a ficar em aberto. Em **Comissões**, a comissão vinculada volta à situação **Na folha**.

O pagamento e o estorno atuam sobre a despesa da folha inteira, que pode incluir salário e outros itens além da comissão.

**Perguntas:** Como pagar ou estornar uma comissão? | Como estornar o pagamento da folha com comissão?

**Fontes:**
- [Comissões e vínculo com a folha](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/CommissionsList.tsx)
- [Pagamentos em Contas a pagar](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PayablesList.tsx)
- [Motivo e confirmação do estorno](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ReversePaymentModal.tsx)

## FI28 · Conciliar ajustes de uma comissão já paga

1. Em **Financeiro › Comissões**, escolha a competência da comissão e localize o lançamento.
2. Abra **Conciliar comissão**. Compare a **Comissão original** e seu pagamento com a **Origem atual**.
3. Se você corrigiu a presença na turma depois do pagamento, confira o registro em **Histórico de ajustes**. A correção pode aparecer como **Conciliação automática: presença na turma alterada**.
4. Confira o valor em **Saldos em aberto por profissional**. Abra **Financeiro › Folha** para revisar a composição da competência antes do próximo pagamento.

A comissão original e seu pagamento continuam registrados. O CRM lança a diferença em um ajuste da folha. Por exemplo, quando a presença que gerou a comissão passa a ser falta, o ajuste desconta a comissão que havia sido paga.

**Perguntas:** Como conciliar ajuste de comissão já paga? | Onde vejo o ajuste de comissão após corrigir a presença na turma?

**Fontes:**
- [Lançamentos de comissão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/CommissionsList.tsx)
- [Revisão da origem e histórico de ajustes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/CommissionReconciliationModal.tsx)

## FI29 · Configurar um colaborador para aparecer na folha

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e entre em **Usuários**.
2. Clique em **Editar** na linha do colaborador.
3. Marque **Recebe salário** e preencha **Salário mensal (R$)**.
4. Clique em **Salvar alterações**.
5. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Folha** para conferir o colaborador e a filial.

O colaborador com salário aparece na folha da competência consultada.

**Perguntas:** Como incluir um colaborador na folha? | Onde defino o salário mensal de um usuário?

**Fontes:**
- [Configuração de salário no usuário](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/UserFormModal.tsx)
- [Lista da folha por filial](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PayrollSection.tsx)

## FI30 · Registrar desconto, recompensa ou vale para um colaborador

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Folha**. Confira a **Competência**.
2. Para desconto ou recompensa, clique em **Ajustar** na linha do colaborador.
3. Escolha **Tipo**, revise **Forma**, preencha o valor e o **Motivo**, e clique em **Adicionar**.
4. Para vale, clique em **Novo vale**, escolha **Colaborador** e informe o valor, o mês do desconto, a data e a forma de pagamento.
5. Clique em **Registrar vale**.

Abra **Detalhes** do colaborador para conferir os ajustes e vales na composição do mês.

**Perguntas:** Como lançar um desconto ou recompensa na folha? | Onde registro um vale de salário?

**Fontes:**
- [Ações e composição da folha](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PayrollSection.tsx)
- [Formulário de ajuste](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PayrollEntryModal.tsx)
- [Formulário de vale](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PayrollAdvanceModal.tsx)

## FI31 · Lançar a folha do mês e desfazer o lançamento

1. Abra **Financeiro** e selecione **Folha**. Escolha a competência e confira os colaboradores incluídos.
2. Abra o detalhe do colaborador e revise a **Composição do mês**. Confira salário, comissões e itens como bônus e vales antes de lançar.
3. Clique em **Lançar folha do mês**. Confira a prévia dos valores, os vencimentos e os colaboradores. Confirme em **Lançar folha**.
4. Veja a situação da folha e a conta criada em **Contas a pagar**.
5. Para desfazer o lançamento que ainda está em aberto, volte ao colaborador em **Folha**, abra o detalhe, clique em **Desfazer lançamento** e confirme.

O lançamento leva o valor à conta a pagar da folha. Ao desfazer, os itens voltam a ficar disponíveis para um novo lançamento.

**Perguntas:** Como lançar a folha de pagamento do mês? | Como desfazer uma folha lançada no financeiro?

**Fontes:**
- [Ações e composição da folha](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PayrollSection.tsx)
- [Prévia e lançamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/PayrollLaunchModal.tsx)

## FI32 · Consultar a previsão financeira e o caixa diário

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro).
2. Para consultar um dia, clique em **Caixa do dia** e escolha a **Data**.
3. Leia as entradas, saídas e totais apresentados para a data.
4. Para consultar valores previstos, clique em **Previsão**.
5. Escolha o **Horizonte** para ajustar o período mostrado.

Revise a data ou o horizonte antes de comparar os valores. A previsão distingue pagamentos confirmados e valores em aberto.

**Perguntas:** Onde vejo o caixa do dia? | Como consultar a previsão financeira? | Como mudar o horizonte da previsão?

**Fontes:**
- [Abas de Caixa do dia e Previsão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinancePage.tsx)
- [Consulta por data](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/DailyCashSection.tsx)
- [Horizonte e totais da previsão](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/FinanceForecastSection.tsx)

## FI33 · Registrar uma operação externa com comprovante

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e entre em **Documentos fiscais**.
2. Clique em **Registrar operação externa**.
3. Escolha **Tipo de registro** e confira **Data da operação externa**.
4. Informe **Emissor ou parceiro** e **Referência do documento ou operação**.
5. Em **Comprovante**, escolha um PDF, PNG ou JPEG de até 5 MB. Se necessário, vincule o cliente ou a conta a receber.
6. Clique em **Salvar registro manual**.

O registro aparece em **Documentos fiscais e operações com parceiros**, com a referência e a opção de baixar o comprovante.

**Perguntas:** Como registrar uma nota emitida fora do CRM? | Onde cadastro uma operação externa com parceiro? | Como lançar um documento fiscal externo com comprovante?

**Fontes:**
- [Formulário, anexos e lista de operações externas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ExternalOperationsPanel.tsx)

## FI34 · Consultar ou baixar o comprovante de uma operação externa

1. Abra [**Financeiro**](https://crm.organizastudios.com/financeiro) e clique em **Documentos fiscais**.
2. Localize a referência em **Documentos fiscais e operações com parceiros**.
3. Confira emissor e data do registro.
4. Clique em **Baixar comprovante** na linha correspondente.

O navegador baixa o arquivo anexado à operação.

**Perguntas:** Onde baixo o comprovante de uma operação externa? | Como consultar comprovante de documento fiscal registrado? | Onde está o anexo da operação com parceiro?

**Fontes:**
- [Listagem e download de comprovante externo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/finance/ExternalOperationsPanel.tsx)

## RL02 · Consultar a retenção de clientes

1. Abra [**Relatórios**](https://crm.organizastudios.com/relatorios).
2. Ajuste o **Período de análise** e clique em **Atualizar** se preencher datas manualmente.
3. Abra **Clientes** e clique em **Retenção**.
4. Leia o quadro **Retenção mês a mês** para comparar os meses apresentados.

Confira o período escolhido antes de comparar os resultados.

**Perguntas:** Onde consulto a retenção de clientes? | Como ver a retenção mês a mês? | Onde fica o relatório de retenção?

**Fontes:**
- [Período e abas de clientes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ReportsPage.tsx)
- [Quadro de retenção](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ClientInsights.tsx)

## RL03 · Consultar o ranking de sessões e as faixas etárias

1. Abra [**Relatórios**](https://crm.organizastudios.com/relatorios).
2. Escolha o **Período de análise**.
3. Abra **Clientes** e clique em **Ranking e faixa etária**.
4. Leia **Mais sessões concluídas** para consultar o ranking.
5. Leia **Faixa etária** para ver o agrupamento de clientes por idade.

Os dois quadros ficam na mesma aba. Confira o período no alto antes de comparar resultados.

**Perguntas:** Onde vejo o ranking de clientes? | Como ver as faixas etárias no relatório? | Onde vejo quem concluiu mais sessões?

**Fontes:**
- [Abas de análise de clientes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ReportsPage.tsx)
- [Ranking e agrupamento por idade](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ClientInsights.tsx)

## RL04 · Analisar clientes sem retorno no relatório

1. Abra [**Relatórios**](https://crm.organizastudios.com/relatorios) e confira o período.
2. Clique em **Clientes** e depois em **Sem retorno**.
3. Consulte o quadro **Clientes sem retorno**.
4. Quando houver resultados, localize o cliente na lista e consulte as ações disponíveis na linha dele.

A aba apresenta os clientes identificados pelo relatório. Quando o quadro estiver vazio, confira o período e o texto de resultado da tela.

**Perguntas:** Onde vejo clientes sem retorno nos relatórios? | Como consultar relatório de clientes que não voltaram? | Onde analiso o quadro Clientes sem retorno?

**Fontes:**
- [Aba Sem retorno](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ReportsPage.tsx)
- [Quadro de clientes sem retorno](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ClientInsights.tsx)

## RL05 · Consultar clientes e contratações nos relatórios

1. Abra [**Relatórios**](https://crm.organizastudios.com/relatorios) e confira **Período de análise**.
2. Clique em **Clientes** e depois em **Consulta de clientes**.
3. Preencha **Buscar cliente** ou selecione **Situação** e **Desconto** para refinar.
4. Clique em **Consultar clientes**.
5. Leia a lista em **Clientes, frequência, aparelhos e produtos** e abra o nome da pessoa se precisar ver a ficha.

Depois da consulta, **Exportar clientes** e **Imprimir clientes** usam os resultados exibidos.

**Perguntas:** Como consultar clientes no relatório? | Onde vejo frequência e produtos contratados por cliente? | Como filtrar o relatório de clientes por nome?

**Fontes:**
- [Abas de relatórios de clientes](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ReportsPage.tsx)
- [Busca, filtros e resultados da consulta](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ClientDetailsSection.tsx)

## RL06 · Consultar o desempenho de campanhas nos relatórios

1. Abra [**Relatórios**](https://crm.organizastudios.com/relatorios) e escolha o **Período de análise**.
2. Clique em **Campanhas**.
3. Use **Tipo de campanha** para escolher quais campanhas deseja analisar.
4. Confira os resultados apresentados para o período.
5. Clique em **Exportar planilha** se precisar de uma cópia.

Confira o intervalo e o tipo selecionados antes de comparar os resultados.

**Perguntas:** Onde vejo o desempenho de uma campanha? | Como filtrar o relatório de campanhas? | Onde exporto a planilha de campanhas?

**Fontes:**
- [Período e acesso ao relatório](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ReportsPage.tsx)
- [Filtros e exportação de campanhas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/CampaignsSection.tsx)

## RL07 · Ler a composição da DRE

1. Abra [**Relatórios**](https://crm.organizastudios.com/relatorios) e ajuste o período.
2. Clique na aba **DRE**.
3. Em **DRE por competência**, confira **Receitas**, **Despesas** e **Resultado**.
4. Na tabela **Composição**, compare as linhas das categorias nas colunas de cada mês.
5. Use **Exportar DRE** ou **Imprimir DRE** para conferir fora da tela.

Os valores são agrupados pela competência. Confira o período e a categoria antes de comparar com os lançamentos.

**Perguntas:** Onde vejo a DRE por competência? | Como conferir as categorias e baixar a DRE?

**Fontes:**
- [Totais, composição e exportação da DRE](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/DreSection.tsx)

## RL08 · Configurar pró-labore a partir do relatório

1. Abra [**Relatórios**](https://crm.organizastudios.com/relatorios) e entre em **Financeiro**.
2. Clique em **Configurar pró-labore**.
3. Preencha **Percentual (%)**.
4. Confira a opção em **Calcular sobre** e clique em **Salvar pró-labore**.

Abra a configuração novamente para conferir o percentual salvo. O relatório usa a base selecionada.

**Perguntas:** Como configurar pró-labore no relatório? | Onde mudo o percentual ou a base de pró-labore?

**Fontes:**
- [Atalho no relatório financeiro](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/FinancialSection.tsx)
- [Percentual, base e salvamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ProLaboreModal.tsx)

## RL09 · Consultar e exportar o extrato financeiro

1. Abra [**Relatórios**](https://crm.organizastudios.com/relatorios) e escolha o período.
2. Clique em **Financeiro**.
3. Desça até **Extrato detalhado**.
4. Ajuste os filtros que precisar, como **Tipo**, **Origem**, **Categoria**, **Forma de pagamento** ou datas.
5. Confira as linhas do extrato.
6. Clique em **Exportar extrato**.

O navegador baixa uma planilha XLSX identificada pelo intervalo do extrato.

**Perguntas:** Como consultar o extrato financeiro? | Como baixar o extrato financeiro filtrado? | Onde exporto o extrato nos relatórios?

**Fontes:**
- [Aba de relatórios financeiros](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/FinancialSection.tsx)
- [Filtros e exportação do extrato](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/FinancialLedger.tsx)

## RL10 · Filtrar e baixar o relatório detalhado de vendas

1. Abra [**Relatórios**](https://crm.organizastudios.com/relatorios).
2. Em **Período de análise**, selecione um atalho ou preencha **De** e **Até** e clique em **Atualizar**.
3. Abra **Visão geral** e selecione **Vendas**.
4. Confirme o intervalo mostrado acima do relatório.
5. Clique em **Exportar Excel detalhado**.

O navegador baixa uma planilha XLSX com o intervalo no nome do arquivo.

**Perguntas:** Como exportar o relatório gerencial de vendas? | Como baixar o Excel detalhado de vendas? | Como filtrar o período de um relatório de vendas antes de baixar?

**Fontes:**
- [Período, seção e atualização do relatório](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ReportsPage.tsx)
- [Exportação das vendas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/SalesInsights.tsx)

## RL11 · Consultar indicadores, rentabilidade e vendas detalhadas

1. Abra [**Relatórios**](https://crm.organizastudios.com/relatorios) e confira o **Período de análise**.
2. Em **Visão geral**, abra **Indicadores** e consulte **Como a clínica foi no período** e **Turmas e loja**.
3. Abra **Rentabilidade** para comparar serviços no quadro **Rentabilidade por serviço**.
4. Abra **Vendas** para consultar **Evolução no período**, **Por tipo**, **Por item** e **Maiores compradores**.

Use o mesmo período para comparar as abas. Em **Vendas**, use **Exportar Excel detalhado** para conferir os lançamentos na planilha.

**Perguntas:** Onde vejo indicadores e rentabilidade? | Como consultar rentabilidade por serviço? | Onde analiso as vendas detalhadas nos relatórios?

**Fontes:**
- [Abas do resumo geral](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ReportsPage.tsx)
- [Indicadores da clínica](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ClinicIndicators.tsx)
- [Tabelas de rentabilidade](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/ProfitTables.tsx)
- [Detalhes de vendas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/reports/SalesInsights.tsx)

## HI01 · Pesquisar e filtrar alterações no Histórico

1. Abra [**Histórico**](https://crm.organizastudios.com/historico).
2. Escolha a **Área**, o **Tipo de atividade** ou o **Responsável** que deseja consultar.
3. Se precisar, delimite o período nos campos **De** e **Até**.
4. Clique em **Pesquisar e filtrar** para atualizar a lista.
5. Use **Limpar filtros** para voltar à lista geral.

Confira se os registros correspondem à área, à atividade, à pessoa ou ao período que você selecionou.

**Perguntas:** Como pesquisar no histórico de alterações? | Como filtrar o histórico por responsável? | Como ver só as alterações da Agenda no Histórico?

**Fontes:**
- [Campos, filtros e resultados do Histórico](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/history/HistoryPage.tsx)

## HI02 · Abrir os detalhes de uma alteração no Histórico

1. Abra [**Histórico**](https://crm.organizastudios.com/historico).
2. Localize a alteração pelo título, pela área e pelo momento em que aconteceu.
3. Na alteração escolhida, clique em **Ver detalhes**.
4. Leia a aba **Resumo**. Abra **Detalhes técnicos** para consultar os campos que o sistema registrou.

Em **Resumo**, confira **O que aconteceu**, a **Área**, **Quem realizou** e **Quando**.

**Perguntas:** Como abrir os detalhes de uma alteração? | Onde vejo quem fez uma alteração no histórico? | Como ler os detalhes técnicos de uma alteração?

**Fontes:**
- [Botão Ver detalhes no Histórico](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/history/HistoryPage.tsx)
- [Abas e campos da alteração](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/history/HistoryDetailsModal.tsx)

## CF01 · Navegar em Configurações e salvar ou descartar alterações

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes).
2. Clique na aba que quer consultar, como **Clínica**, **Usuários** ou **Filiais**.
3. Se fizer mudanças, use o botão de salvamento da aba. Em **Clínica**, ele se chama **Salvar configurações**.
4. Se tentar trocar de aba com uma edição pendente, leia **Salvar as alterações?**.
5. Na janela, clique em **Salvar alterações** para gravar, **Descartar alterações** para sair sem gravar ou **Continuar editando** para voltar ao formulário.

Ao descartar, os campos voltam aos valores salvos. Ao gravar, abra a aba de novo para conferir as mudanças.

**Perguntas:** Como navegar nas configurações? | Como descartar uma alteração ao mudar de aba? | Como salvar as alterações em Configurações?

**Fontes:**
- [Navegação e confirmação da troca de aba](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/SettingsPage.tsx)

## CF02 · Atualizar dados e apresentação da clínica

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Clínica**.
2. Em **Dados da clínica**, revise **Nome**, **Razão social**, a identificação e os contatos.
3. Se precisar atualizar a imagem, use **Logotipo**.
4. Clique em **Salvar configurações**.

Reabra **Clínica** e confira os dados salvos.

**Perguntas:** Como alterar a razão social da clínica? | Onde edito os dados e o logotipo da clínica?

**Fontes:**
- [Campos de identificação, imagem e salvamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/ClinicSettingsContent.tsx)

## CF03 · Cadastrar um usuário e associá-lo às filiais

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Usuários**.
2. Clique em **Novo usuário**. Preencha nome, e-mail e senha inicial, e escolha **Tipo**.
3. Para **Usuário comum**, selecione as permissões necessárias.
4. Em **Filiais**, escolha **Acessa todas as filiais** ou desmarque a opção e selecione as unidades permitidas.
5. Clique em **Criar usuário**. Para ajustar um cadastro existente, abra **Editar** e clique em **Salvar alterações**.

Confira o usuário na lista. A seção **Filiais** aparece para usuário comum quando há mais de uma filial ativa.

**Perguntas:** Como cadastrar um usuário e dar acesso às filiais? | Onde escolho as unidades que um usuário pode acessar?

**Fontes:**
- [Lista e ações dos usuários](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/AdminUsersContent.tsx)
- [Cadastro e seleção de filiais](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/UserFormModal.tsx)

## CF04 · Selecionar, copiar ou limpar permissões de um usuário

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes), entre em **Usuários** e clique em **Editar** na linha do usuário comum.
2. Em **Permissões**, marque ou desmarque as ações necessárias.
3. Use **Copiar permissões de…** para começar com o acesso de outro usuário comum, ou **Limpar permissões** para limpar a seleção.
4. Revise os módulos de acesso e clique em **Salvar alterações**.

Reabra o cadastro e confira as permissões. Para usar ações de um módulo, o usuário também precisa da permissão de acesso daquele módulo.

**Perguntas:** Como copiar permissões de um usuário? | Como retirar ou mudar permissões de um usuário comum?

**Fontes:**
- [Cópia e salvamento das permissões](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/UserFormModal.tsx)
- [Seleção e limpeza de permissões](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/PermissionEditor.tsx)

## CF05 · Editar, desativar ou ativar um usuário

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Usuários**.
2. Localize o usuário pelo nome.
3. Para alterar o cadastro, clique em **Editar**, faça as mudanças e clique em **Salvar alterações**.
4. Para impedir o acesso, clique em **Desativar** e confirme em **Desativar**.
5. Para devolver o acesso ao usuário inativo, clique em **Ativar**.

Confira os dados e a situação na lista. A gestão de usuários está disponível para administradores.

**Perguntas:** Como editar um usuário? | Como desativar um usuário do CRM? | Como reativar um usuário inativo?

**Fontes:**
- [Lista e ações Ativar e Desativar](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/AdminUsersContent.tsx)
- [Campos e salvamento da edição](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/UserFormModal.tsx)

## CF06 · Redefinir a senha ou encerrar sessões de outro usuário

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e vá a **Usuários**.
2. Localize o usuário correto.
3. Clique em **Redefinir senha**, preencha **Nova senha** e confirme em **Redefinir senha**.
4. Para derrubar os acessos ativos, clique em **Encerrar acessos** na linha do usuário e confirme em **Encerrar acessos**.

A nova senha pode ser usada na próxima entrada. Depois de encerrar acessos, o usuário precisa entrar novamente.

**Perguntas:** Como redefinir a senha de outro usuário? | Como derrubar as sessões de um usuário pelo cadastro?

**Fontes:**
- [Ações administrativas sobre o usuário](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/AdminUsersContent.tsx)
- [Formulário da senha nova](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/ResetPasswordModal.tsx)

## CF07 · Configurar um profissional de Agenda e sua comissão

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Usuários**.
2. Abra **Editar** na linha do usuário que vai atender.
3. Na seção **Agenda**, marque **Realiza atendimentos**.
4. Revise **Nome na agenda**, preencha **Registro profissional** e ajuste os demais campos do profissional, se necessário.
5. Em **Comissão**, preencha **Comissão (%)** e confira a data de vigência, quando exibida.
6. Clique em **Salvar alterações** e leia a prévia se aparecer.

Reabra o cadastro para conferir o nome de Agenda e o percentual salvo.

**Perguntas:** Como ligar um usuário à agenda? | Onde cadastro a comissão de um profissional da agenda?

**Fontes:**
- [Dados de Agenda e comissão no usuário](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/UserFormModal.tsx)
- [Campos do profissional](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/UserAgendaFields.tsx)

## CF08 · Cadastrar uma filial

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique na aba **Filiais**.
2. Clique em **Nova filial**.
3. Preencha **Nome da filial**.
4. Informe os telefones e o endereço se estiverem disponíveis.
5. Confira **Filial ativa** e clique em **Salvar filial**.

Confira o nome da nova unidade na lista **Filiais**. O seletor do cabeçalho fica disponível quando a conta tem acesso a mais de uma filial ativa.

**Perguntas:** Como cadastrar uma filial? | Como criar uma nova unidade? | Onde adiciono uma filial da clínica?

**Fontes:**
- [Lista de filiais e botão Nova filial](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/BranchesContent.tsx)
- [Campos do cadastro de filial](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/BranchModal.tsx)

## CF09 · Editar ou inativar uma filial

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Filiais**.
2. Localize a unidade e clique em **Editar** na linha dela.
3. Altere os dados necessários.
4. Para mudar a situação, marque ou desmarque **Filial ativa**.
5. Clique em **Salvar filial**.

Confira o nome e a situação na lista. A filial inativa deixa de aparecer no seletor do topo e mantém seu histórico.

**Perguntas:** Como editar uma filial? | Como inativar uma unidade? | Como reativar uma filial?

**Fontes:**
- [Listagem e ação Editar](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/BranchesContent.tsx)
- [Campos, situação e salvamento da filial](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/BranchModal.tsx)

## CF10 · Renomear uma aba do menu

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Abas do menu**.
2. Localize o campo da aba desejada e preencha o nome que deve aparecer.
3. Clique em **Salvar nomes das abas**.
4. Confira o novo rótulo no menu lateral.

Para recuperar os rótulos originais, use **Restaurar nomes padrão** e confira a confirmação mostrada pelo CRM.

**Perguntas:** Como trocar o nome de uma aba do menu? | Onde altero o rótulo das páginas no menu do CRM?

**Fontes:**
- [Campos, rótulos e salvamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/NavTabLabelsContent.tsx)

## CF11 · Cadastrar um plano no catálogo

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e entre em **Planos**.
2. Clique em **Cadastrar plano**.
3. Preencha **Nome do plano**, escolha **Tipo de plano** e informe **Valor total**.
4. Selecione cada **Serviço** e informe as sessões pedidas pelo formulário.
5. Clique em **Salvar plano**.

Confira o novo plano na lista. A quantidade de sessões pedida pode variar conforme o tipo de plano.

**Perguntas:** Como cadastrar um plano no catálogo? | Onde crio um modelo de plano para vender? | Como definir os serviços de um plano cadastrado?

**Fontes:**
- [Lista e ações do catálogo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/PlanTemplatesContent.tsx)
- [Campos do plano](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/PlanTemplateModal.tsx)

## CF12 · Editar, desativar ou ativar um plano do catálogo

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e entre em **Planos**.
2. Localize o plano. Clique em **Editar**, faça os ajustes e clique em **Salvar plano**.
3. Para retirar o plano das novas contratações, clique em **Desativar** na linha dele.
4. Para voltar a oferecê-lo, use **Ativar**.

Confira a situação na lista. O catálogo mostra **Ativar** na linha do plano desativado.

**Perguntas:** Como editar um plano no catálogo? | Como desativar um modelo de plano?

**Fontes:**
- [Ações de edição e situação no catálogo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/PlanTemplatesContent.tsx)
- [Formulário de edição do plano](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/PlanTemplateModal.tsx)

## CF13 · Adicionar um feriado manualmente

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Feriados**.
2. Preencha **Data**.
3. Digite o **Nome do feriado**.
4. Clique em **Adicionar feriado**.

O feriado aparece na lista com a data e o nome informados. Na Agenda, consulte o dia correspondente para ver a indicação de feriado.

**Perguntas:** Como adicionar um feriado manual? | Onde cadastro um feriado na agenda? | Como colocar um feriado local no CRM?

**Fontes:**
- [Cadastro e lista de feriados](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/HolidaysContent.tsx)
- [Exibição do feriado na Agenda](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/agenda/AgendaPage.tsx)

## CF14 · Importar ou excluir feriados

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Feriados**.
2. Para carregar uma lista, clique em **Importar feriados do ano**.
3. Escolha o **Ano** e marque os feriados que deseja cadastrar.
4. Clique em **Importar … feriados** e confira os itens na lista.
5. Para excluir um feriado, clique em **Excluir** na linha dele e confirme em **Confirmar**.

Os feriados importados aparecem com suas datas. Depois da exclusão, confira se o item saiu da lista.

**Perguntas:** Como importar os feriados do ano? | Como remover um feriado do calendário? | Onde escolho quais feriados importar?

**Fontes:**
- [Seleção e importação de feriados](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/ImportHolidaysModal.tsx)
- [Lista e ação de excluir](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/HolidaysContent.tsx)

## CF15 · Configurar a finalização automática dos atendimentos

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Finalização automática**.
2. Marque **Finalizar atendimentos automaticamente** para ativar, ou desmarque para desativar.
3. Com a opção ativa, preencha **Tempo de espera após o término** e escolha **Unidade**.
4. Clique em **Salvar finalização automática**.

Confira o aviso de finalização ligada ou desligada. Com ela ativa, o prazo começa após o término do atendimento.

**Perguntas:** Como ligar ou desligar a finalização automática? | Onde altero o prazo para o CRM finalizar atendimentos?

**Fontes:**
- [Prazo, ativação e salvamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/AutoFinalizationContent.tsx)

## CF16 · Definir parcelamento por forma de pagamento

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Formas de pagamento**.
2. Localize a forma de pagamento.
3. Marque ou desmarque **Aceita parcelamento**. Se permitido, preencha **Máximo de parcelas**.
4. Clique em **Salvar formas de pagamento**.

Reabra a aba e confira o limite salvo. O máximo limita as opções de parcelamento apresentadas para aquela forma.

**Perguntas:** Onde defino o máximo de parcelas no cartão? | Como liberar ou limitar as parcelas de uma forma de pagamento?

**Fontes:**
- [Formas disponíveis e limites de parcelas](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/PaymentMethodsContent.tsx)

## CF17 · Criar ou revogar uma chave de integração

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Integrações**.
2. Preencha **Nome** para identificar a chave.
3. Confira as permissões, como **Ler vendas** e **Gravar vendas**, e deixe marcadas apenas as necessárias.
4. Clique em **Criar chave**.
5. Use **Copiar token** e guarde o token no local seguro da sua integração. O token completo é exibido somente na criação.
6. Para desativar uma chave existente, localize o nome, clique em **Revogar** e confirme com **Revogar**.

A lista identifica as chaves revogadas. Ao revogar, a integração deixa de poder usar aquela chave.

**Perguntas:** Como criar uma chave de integração? | Onde copio o token de integração de vendas? | Como revogar uma chave de integração do CRM?

**Fontes:**
- [Criação, permissões, token e revogação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/IntegrationKeysContent.tsx)

## CF18 · Vincular e gerenciar avisos do Telegram em chats pessoais e grupos

1. Abra [**Configurações › Integrações**](https://crm.organizastudios.com/configuracoes?secao=integracoes) e localize **Telegram**. A integração precisa estar ligada. Em **Podem vincular**, confira quais perfis podem vincular o chat pessoal. Use uma conta administradora para vincular grupos.
2. Para o chat pessoal, clique em **Gerar código de vínculo**. Copie **Mensagem para o bot**, envie o comando no chat privado com o bot do estúdio e volte ao CRM. Clique em **Já enviei** e confira **Chat vinculado**.
3. Em **Avisos neste chat**, escolha **Recibos**, **Agendamentos** e **Clientes novos** conforme o que deseja receber. Clique em **Salvar avisos**. Com todos desmarcados, ficam disponíveis no privado os comandos `/hoje`, `/semana` e `/mes`.
4. Para um grupo, adicione o bot do estúdio ao grupo desejado. No CRM, clique em **Vincular grupo**, marque pelo menos um assunto e clique em **Gerar código**.
5. Envie **Mensagem para o grupo** no grupo escolhido. Se o Telegram pedir o nome do bot, use o formato `/vincular@nome_do_bot CÓDIGO`. Volte ao CRM, clique em **Já enviei** e confira o nome do grupo e os assuntos exibidos em **Grupos**.
6. Para alterar os assuntos do grupo, clique em **Editar avisos**, ajuste as opções e clique em **Salvar**. Para interromper os avisos de um grupo ou do chat pessoal, clique em **Desvincular** junto ao destino e confirme.

Cada código vale 10 minutos e pode ser usado uma vez. Para verificar o recebimento de um assunto selecionado, confira no chat se chegou o aviso após uma ação correspondente no CRM. Os comandos de agenda respondem no chat privado.

**Perguntas:** Como vincular o Telegram ao CRM? | Como configurar avisos do CRM em um grupo do Telegram? | Como mudar ou desativar avisos do Telegram? | Como desvincular um chat ou grupo do Telegram do CRM?

**Fontes:**
- [Vínculo, assuntos e desvinculação na tela de Integrações](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/TelegramIntegrationContent.tsx)
- [Expiração dos códigos e assuntos disponíveis](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/packages/contracts/src/integrations/telegram.ts)

## CF19 · Criar ou editar uma etiqueta manual

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e entre em **Etiquetas**.
2. Preencha **Nome da etiqueta** e escolha uma **Categoria**, se precisar.
3. Selecione a cor e clique em **Adicionar etiqueta**.
4. Para corrigir uma existente, clique em **Editar** na linha dela. Ajuste os campos e clique em **Salvar etiqueta**.

Confira o nome e a cor na lista de etiquetas manuais.

**Perguntas:** Como criar uma etiqueta manual? | Onde mudo o nome ou a cor de uma etiqueta?

**Fontes:**
- [Criação e ações da lista](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/PatientTagsContent.tsx)
- [Campos de edição da etiqueta](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/PatientTagEditModal.tsx)

## CF20 · Excluir uma etiqueta manual ou editar uma automática

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Etiquetas**.
2. Para apagar uma etiqueta manual, clique em **Excluir** na linha dela e confirme em **Excluir etiqueta**.
3. Para mudar a apresentação de uma etiqueta automática, vá a **Etiquetas automáticas** e clique em **Editar** na etiqueta.
4. Ajuste **Nome da etiqueta** ou cor e clique em **Salvar etiqueta**.

Confira a remoção na lista manual e o nome ou a cor na lista automática. A etiqueta automática continua sendo aplicada pelo critério definido no CRM.

**Perguntas:** Como excluir uma etiqueta de cliente? | Como mudar a cor ou o nome de uma etiqueta automática?

**Fontes:**
- [Exclusão da etiqueta manual](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/PatientTagsContent.tsx)
- [Edição da apresentação automática](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/AutomaticTagEditModal.tsx)

## CF21 · Gerenciar catálogos comerciais da clínica

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Cadastros**.
2. Localize o quadro desejado, como **Origens**, **Formas de contato** ou **Motivos de não efetivação**.
3. Clique em **Adicionar**, preencha **Nome** e revise a situação do item.
4. Clique em **Salvar**. Use a edição na linha para ajustar um cadastro existente.

Confira o item no quadro. Uma origem ativa pode ser selecionada em **Novo lead** no CRM comercial.

**Perguntas:** Onde cadastro uma origem comercial? | Como gerenciar formas de contato ou motivos de não efetivação?

**Fontes:**
- [Quadros dos cadastros comerciais](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/ClinicCatalogsContent.tsx)
- [Ações de cada catálogo](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/CatalogSection.tsx)

## CF22 · Cadastrar um serviço e definir os recursos

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e clique em **Serviços e salas → Serviços**.
2. Clique em **Novo cadastro** ou em **Editar** no serviço desejado.
3. Preencha **Nome** e **Duração (minutos)**.
4. Marque os recursos em **Profissionais que atendem** e **Salas onde é atendido** para limitar as opções do agendamento.
5. Clique em **Salvar cadastro**.

Confira o serviço na lista. O formulário explica que, com a lista de recursos desmarcada, todos os recursos daquele tipo podem ser usados.

**Perguntas:** Onde cadastro um serviço? | Como limitar as salas de um serviço? | Como indicar quais profissionais atendem um serviço?

**Fontes:**
- [Cadastro do serviço e restrições de recursos](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/AdministrativeRegistrySection.tsx)

## CF23 · Cadastrar ou editar uma sala e sua capacidade

1. Abra [**Configurações**](https://crm.organizastudios.com/configuracoes) e entre em **Serviços e salas → Salas**.
2. Clique em **Novo cadastro** ou em **Editar** na linha da sala.
3. Preencha **Nome da sala** e **Capacidade de atendimento simultâneo**.
4. Clique em **Salvar cadastro**.

Confira a sala e sua capacidade na lista.

**Perguntas:** Como cadastrar uma sala? | Onde mudo a capacidade de uma sala? | Como editar uma sala de atendimento?

**Fontes:**
- [Cadastro e capacidade da sala](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/settings/AdministrativeRegistrySection.tsx)

## MP01 · Atualizar seu nome ou sua foto de perfil

1. Abra [**Meu perfil**](https://crm.organizastudios.com/perfil).
2. Em **Dados pessoais**, revise **Nome completo**.
3. Em **Foto**, escolha uma imagem PNG ou JPEG de até 2 MB.
4. Clique em **Salvar perfil** e aguarde **Perfil salvo.**.

Confira o nome e a foto em **Meu perfil**. Eles também identificam seu usuário na interface.

**Perguntas:** Como mudar minha foto de perfil? | Como atualizar meu nome no CRM? | Onde salvo os dados do meu perfil?

**Fontes:**
- [Campos de perfil, tamanho da foto e salvamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/profile/ProfilePage.tsx)

## MP02 · Alterar a própria senha

1. Abra [**Meu perfil**](https://crm.organizastudios.com/perfil).
2. Na seção **Senha**, preencha **Senha atual**.
3. Digite a **Nova senha**.
4. Repita a nova senha em **Confirmar nova senha**.
5. Clique em **Alterar senha**.

Aparece o aviso de senha alterada. As sessões em outros aparelhos são encerradas. Use a nova senha na próxima entrada.

**Perguntas:** Como alterar minha senha? | Como trocar a senha do meu perfil? | Onde mudo minha senha de acesso?

**Fontes:**
- [Campos e confirmação da alteração](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/profile/ProfilePage.tsx)

## MP03 · Alterar o nome e a cor que aparecem na sua Agenda

1. Abra [**Meu perfil**](https://crm.organizastudios.com/perfil).
2. Em **Dados pessoais**, procure a seção **Agenda**.
3. Em **Nome na agenda**, digite o nome que deve aparecer.
4. Em **Cor na agenda**, escolha a cor.
5. Clique em **Salvar perfil**.

Confira se o nome e a cor ficaram salvos. A seção **Agenda** aparece quando seu usuário tem um profissional vinculado.

**Perguntas:** Como alterar meu nome na agenda? | Como trocar minha cor na agenda? | Onde mudo o nome que aparece nos atendimentos?

**Fontes:**
- [Dados da própria agenda e salvamento](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/profile/ProfilePage.tsx)

## LX01 · Enviar um cadastro de cliente à Lixeira

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes) e localize o cadastro correto.
2. Abra a ficha do cliente e clique em **Excluir**.
3. Na confirmação, confira o nome e clique em **Enviar para a lixeira**.

O cadastro sai da lista de clientes. Na tela **Clientes**, clique em **Abrir lixeira** para encontrá-lo.

**Perguntas:** Como enviar um cliente para a lixeira? | Onde excluo um cadastro sem apagar de vez? | Como tirar um cadastro da lista e mandar para a lixeira?

**Fontes:**
- [Ação de excluir na ficha](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/patients/PatientDetailPage.tsx)
- [Confirmação de envio para a lixeira](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/trash/SendToTrashModal.tsx)

## LX02 · Consultar a Lixeira e restaurar um cadastro de cliente

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes).
2. Clique em **Abrir lixeira** no alto da página.
3. Localize o item pelo nome e confira a data de exclusão.
4. Ao lado do cadastro correto, clique em **Restaurar**.

O cadastro sai da Lixeira e volta à lista de **Clientes**. Use a busca para localizá-lo.

**Perguntas:** Como restaurar um cliente da lixeira? | Onde vejo os clientes excluídos? | Como desfazer o envio de um cliente para a lixeira?

**Fontes:**
- [Lista de excluídos e ação Restaurar](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/trash/TrashModal.tsx)

## LX03 · Conferir os efeitos e excluir um cadastro definitivamente

1. Abra [**Clientes**](https://crm.organizastudios.com/clientes) e clique em **Abrir lixeira**.
2. Localize o cadastro certo e clique em **Excluir em definitivo** na linha dele.
3. Aguarde a lista de registros ligados que também serão apagados e leia o aviso.
4. Se quiser prosseguir, digite **EXCLUIR** no campo de confirmação.
5. Clique em **Excluir em definitivo**.

O cadastro sai da Lixeira. Essa exclusão é permanente. Se quiser manter a possibilidade de recuperar o item, clique em **Voltar** antes de confirmar.

**Perguntas:** Como excluir definitivamente um cliente? | O que vai ser apagado junto na lixeira? | Por que preciso digitar EXCLUIR para apagar um cadastro?

**Fontes:**
- [Ação por item na Lixeira](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/trash/TrashModal.tsx)
- [Resumo dos efeitos e confirmação](https://github.com/Bren0-lz/crm-studios/blob/5e03ad9c1da1279154229546e583d82ae8104a40/apps/web/src/features/trash/PurgeConfirmModal.tsx)
