# Passo a passo de uso do CRM Organiza Studios

Revisão das fontes: `5e03ad9c1da1279154229546e583d82ae8104a40`

Os percursos abaixo foram exercitados na interface de `crm.organizastudios.com` em 24/11/2026, no Chromium, com uma conta de teste e registros fictícios. O menu também foi testado em tamanho de celular. Na Agenda, foram concluídos um agendamento experimental, uma remarcação e um agendamento com plano ativo. A revisão identifica o código usado para conferir as instruções. Cada guia indica as condições que mudam os passos.

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

## FI01 · Criar uma conta a receber manual

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
