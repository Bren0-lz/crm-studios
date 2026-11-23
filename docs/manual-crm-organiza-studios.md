# Manual do CRM Organiza Studios

**Revisão examinada na abertura da auditoria:** [`dd13b30dbf99a361899221397f476792601a54d2`](https://github.com/Bren0-lz/crm-studios/commit/dd13b30dbf99a361899221397f476792601a54d2), branch `main`, em 19/11/2026. As referências ao repositório apontam para essa revisão. A versão exata em execução no CRM publicado ficou sem confirmação.

**Cobertura parcial.** A consulta ao sistema foi de leitura. Nenhum formulário foi enviado. Os resultados de gravação citados vêm das asserções dos testes consultados no repositório. Os testes foram lidos, sem execução nesta auditoria.

Os caminhos começam no menu lateral. O nome de uma opção pode variar se a clínica personalizou o menu. O acesso de usuários comuns depende da permissão para cada operação. [Menu da revisão](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/app/navItems.ts) · [Permissões](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/docs/permissoes.md)

## Índice

- [Inventário das telas](#inventário-das-telas)
- [Tutoriais](#tutoriais)
  - [Agendar um atendimento](#tarefa-1)
  - [Mudar o horário de um atendimento](#tarefa-2)
  - [Cancelar um atendimento agendado](#tarefa-14)
  - [Cadastrar um cliente sem contratar um plano](#tarefa-3)
  - [Cadastrar uma pessoa interessada](#tarefa-4)
  - [Transformar uma pessoa interessada em cliente](#tarefa-5)
  - [Criar uma turma](#tarefa-6)
  - [Abrir os dados e a frequência de uma turma](#tarefa-7)
  - [Colocar um cliente na espera de uma turma cheia](#tarefa-8)
  - [Contratar um pacote já cadastrado para um cliente](#tarefa-9)
  - [Colocar um cliente na fila por um serviço](#tarefa-10)
  - [Registrar o pagamento de uma parcela já recebida](#tarefa-11)
  - [Estornar a baixa de uma parcela paga](#tarefa-15)
  - [Cadastrar um evento](#tarefa-12)
  - [Consultar os números de um período](#tarefa-13)
- [Pendências de verificação](#pendências-de-verificação)
- [Estado por módulo](#estado-por-módulo)

## Inventário das telas

| Entrada no menu lateral | Telas, abas e controles vistos |
| --- | --- |
| [Agenda](https://crm.organizastudios.com/agenda) | Dia, Semana, Mês e Lista. Novo atendimento e Nova nota. |
| [Clientes](https://crm.organizastudios.com/clientes) | Busca, Filtros, Novo cliente e Mais → Importar / Exportar. Novo cliente oferece aula experimental, plano, serviço avulso e produto. |
| [CRM comercial](https://crm.organizastudios.com/comercial) | Funil, Filtros, Novo lead e Adicionar etapa. Novo lead oferece Origem e Interesse. |
| [Turmas](https://crm.organizastudios.com/turmas) | Turmas e Visão geral. Nova turma e Matricular cliente. No cartão, Abrir turma → Dados da turma / Frequência e reposições. |
| [Planos e sessões](https://crm.organizastudios.com/planos) | Planos dos clientes. Novo plano → Avulso, Pacote fixo, Recorrente e Personalizado. |
| [Lista de espera](https://crm.organizastudios.com/lista-de-espera) | Maior procura, Clientes na lista e Adicionar à lista → Turma de um serviço / Reposição de produto. |
| [Financeiro](https://crm.organizastudios.com/financeiro) | Parcelas e menu Mais ações de uma parcela, com Ajustar observado. Código lista Contas a receber, Contas a pagar e Comissões. |
| [Visão geral](https://crm.organizastudios.com/) | Resumo do dia e Campanhas automáticas. Agenda de hoje, Clientes sem retorno e Aniversariantes. |
| [Prontuários](https://crm.organizastudios.com/prontuarios) | Prontuários, Modelos de avaliação e Criar modelo. |
| [Eventos](https://crm.organizastudios.com/eventos) | Novo evento e Eventos cadastrados. |
| [Contatos sugeridos](https://crm.organizastudios.com/relacionamento) | Quem contatar. |
| [Comunicações](https://crm.organizastudios.com/comunicacoes) | Campanhas, Campanhas automáticas e Mensagens padrão. |
| [Contratos](https://crm.organizastudios.com/contratos) | Documentos, Modelos, Criar modelo e Novo documento. |
| [Vendas de produtos](https://crm.organizastudios.com/vendas) | Nova venda. |
| [Relatórios](https://crm.organizastudios.com/relatorios) | Período de análise. Visão geral, Clientes, Campanhas, DRE, Financeiro, Vendas, Indicadores, Rentabilidade e Equipe e origens. |
| [Histórico](https://crm.organizastudios.com/historico) | Pesquisar e filtrar e cartões de ações. |
| [Configurações](https://crm.organizastudios.com/configuracoes) | Clínica, Usuários, Filiais, Abas do menu, Planos, Feriados, Finalização automática, Formas de pagamento, Integrações, Etiquetas, Cadastros, Serviços e salas e Contatos sugeridos. |
| [Meu perfil](https://crm.organizastudios.com/perfil) | Dados pessoais, Senha e Salvar perfil. |

## Tutoriais

<a id="tarefa-1"></a>

## Agendar um atendimento

- **Também perguntam:** Como marco uma sessão? Como coloco um cliente na agenda?
- **Onde começar:** Menu lateral → [Agenda](https://crm.organizastudios.com/agenda).
- **Antes de começar:** Tenha um cliente cadastrado e permissão para agendar. Este passo a passo cobre um atendimento único, com plano apto para o serviço.

1. Clique em **Novo atendimento**.
2. Selecione a pessoa em **Cliente**.
3. Em **Tipo**, escolha **Atendimento**.
4. Selecione o **Serviço**.
5. Selecione o **Profissional**.
6. Selecione a **Sala**.
7. Abra o seletor de data e escolha o dia.
8. Preencha **Horário**.
9. Clique em **Fechar calendário**.
10. Clique em **Confirmar atendimento**.

**Como saber se deu certo:** O formulário fecha e o atendimento aparece na agenda.

**Se o botão não aparecer:** Confira se seu acesso permite agendar atendimentos.

**Verificação:** Formulário visto na interface. Gravação verificada pelas asserções do teste de ponta a ponta.

**Fontes:** [Agenda](https://crm.organizastudios.com/agenda) · [AgendaPage.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/AgendaPage.tsx) · [AppointmentModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/AppointmentModal.tsx) · [agenda.spec.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/agenda.spec.ts) · [fixtures.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/fixtures.ts)

<a id="tarefa-2"></a>

## Mudar o horário de um atendimento

- **Também perguntam:** Como remarco uma sessão? Como reagendo um atendimento?
- **Onde começar:** Menu lateral → [Agenda](https://crm.organizastudios.com/agenda).
- **Antes de começar:** Tenha permissão para reagendar. Este caminho foi confirmado para um atendimento agendado e disponível para edição.

1. Abra os detalhes do atendimento na agenda.
2. Clique em **Remarcar atendimento**.
3. Abra o seletor de data e escolha o dia.
4. Preencha **Horário**.
5. Clique em **Fechar calendário**.
6. Clique em **Confirmar reagendamento**.

**Como saber se deu certo:** O formulário fecha. O teste verifica que o mesmo atendimento fica no novo horário e que o histórico registra uma remarcação.

**Se o botão não aparecer:** Confira se o atendimento está agendado e se você tem permissão para reagendar.

**Verificação:** Entrada da Agenda vista na interface. Detalhes e gravação verificados no código e no teste de ponta a ponta.

**Fontes:** [Agenda](https://crm.organizastudios.com/agenda) · [AppointmentDetailsModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/AppointmentDetailsModal.tsx) · [AppointmentRescheduleModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/AppointmentRescheduleModal.tsx) · [agenda.spec.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/agenda.spec.ts) · [fixtures.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/fixtures.ts)

<a id="tarefa-14"></a>

## Cancelar um atendimento agendado

- **Também perguntam:** Como cancelo uma sessão? Como tiro da agenda um horário que não vai acontecer?
- **Onde começar:** Menu lateral → [Agenda](https://crm.organizastudios.com/agenda).
- **Antes de começar:** Tenha permissão para cancelar. O atendimento deve estar agendado ou confirmado.

1. No cartão do atendimento, abra o menu de três pontos.
2. Clique em **Cancelar**.
3. Selecione o **Motivo do cancelamento**.
4. Se precisar, preencha **Detalhes (opcional)**.
5. Clique em **Confirmar cancelamento**.

**Como saber se deu certo:** O sistema registra o atendimento como cancelado. A Agenda só exibe cancelados quando a visualização correspondente é ativada.

**Se o botão não aparecer:** Confira se o atendimento está agendado ou confirmado e se seu acesso permite cancelar.

**Verificação:** Caminho, motivo obrigatório e envio do cancelamento conferidos no código e em testes de integração separados. Cartão e confirmação pendentes na tela publicada.

**Fontes:** [Agenda](https://crm.organizastudios.com/agenda) · [AgendaCard.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/AgendaCard.tsx) · [AppointmentDetailsModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/AppointmentDetailsModal.tsx) · [agenda-card-menu.integration.test.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/agenda-card-menu.integration.test.tsx) · [appointment-attendance.integration.test.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/appointment-attendance.integration.test.tsx) · [agenda-cancelled.integration.test.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/agenda/agenda-cancelled.integration.test.tsx)

<a id="tarefa-3"></a>

## Cadastrar um cliente sem contratar um plano

- **Também perguntam:** Como cadastro um aluno? Como faço só a ficha do cliente? Como cadastro um cliente?
- **Onde começar:** Menu lateral → [Clientes](https://crm.organizastudios.com/clientes).
- **Antes de começar:** Tenha permissão para cadastrar e os dados do cliente e do contato de emergência.

1. Clique em **Novo cliente**.
2. Preencha **Nome completo**.
3. Informe um **CPF** válido.
4. Na seção **Contato**, informe **Telefone** e **WhatsApp**.
5. Informe nome, telefone e WhatsApp do contato de emergência. Se forem os próprios dados do cliente, clique em **Usar os dados do cliente**.
6. Deixe sem seleção as opções de **O que o cliente vai fazer?**.
7. Clique em **Salvar cliente**.
8. Na lista de **Clientes**, busque pelo nome para localizar o cadastro.

**Como saber se deu certo:** O formulário fecha e o cliente aparece na busca.

**Se o botão não aparecer:** Confira se você tem permissão para cadastrar. Se **Salvar cliente** estiver desabilitado, confira os campos obrigatórios. O CPF é obrigatório no cadastro manual e deve ser único. Se o CRM informar que o CPF já está cadastrado, procure a ficha existente em **Clientes**.

**Verificação:** Formulário visto na interface. O teste de integração confirma a gravação com **Salvar cliente**. A confirmação e a busca constam no teste de ponta a ponta, que cita uma opção antiga, registrada nas pendências.

**Fontes:** [Clientes](https://crm.organizastudios.com/clientes) · [PatientsPage.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/PatientsPage.tsx) · [PatientModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/PatientModal.tsx) · [patient-nickname.integration.test.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/patient-nickname.integration.test.tsx) · [patients.spec.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/patients.spec.ts)

<a id="tarefa-4"></a>

## Cadastrar uma pessoa interessada

- **Também perguntam:** Como crio um lead? Como adiciono um contato ao funil? Como cadastro um lead?
- **Onde começar:** Menu lateral → [CRM comercial](https://crm.organizastudios.com/comercial).
- **Antes de começar:** Tenha permissão para cadastrar leads. Um lead é uma pessoa que demonstrou interesse.

1. Clique em **Novo lead**.
2. Preencha **Nome completo**.
3. Preencha **Telefone**.
4. Selecione a **Origem**.
5. Selecione o **Interesse**.
6. Clique em **Adicionar ao funil**.

**Como saber se deu certo:** Um aviso confirma o cadastro e o cartão aparece em **Novos**.

**Se o botão não aparecer:** Confira se seu acesso permite cadastrar leads. **Cadastrar origem** e **Cadastrar interesse** aparecem para administradores.

**Verificação:** Formulário visto na interface. Código marca Origem e Interesse como obrigatórios. A confirmação e o cartão são verificados no teste de integração.

**Fontes:** [CRM comercial](https://crm.organizastudios.com/comercial) · [CommercialPage.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/CommercialPage.tsx) · [LeadModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/LeadModal.tsx) · [lead-form-conversion.integration.test.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/lead-form-conversion.integration.test.tsx)

<a id="tarefa-5"></a>

## Transformar uma pessoa interessada em cliente

- **Também perguntam:** Como converto um lead? Como passo um contato do funil para Clientes? Como converto um lead em cliente?
- **Onde começar:** Menu lateral → [CRM comercial](https://crm.organizastudios.com/comercial).
- **Antes de começar:** O lead precisa estar em aberto. Tenha permissão para converter leads e cadastrar clientes. Este caminho cobre a conversão sem plano ou venda junto.

1. No cartão do lead, clique em **Converter**.
2. Se aparecer uma janela com os dados que faltam, clique em **Preencher cadastro**.
3. Confira o **Nome completo** e o **Telefone** que vieram do lead.
4. Complete o **CPF** e o **WhatsApp**.
5. Preencha nome, telefone e WhatsApp em **Contato de emergência**.
6. Complete os demais dados disponíveis no formulário.
7. Clique em **Converter em cliente**.

**Como saber se deu certo:** O lead aparece na coluna **Ganhos** e um aviso confirma a conversão.

**Se o botão não aparecer:** Confira se o lead ainda está em aberto e se seu acesso permite converter leads e cadastrar clientes.

**Verificação:** A tela do funil foi vista sem cartões. Caminho no cartão, condições e resultado verificados no código e no teste de integração.

**Fontes:** [CRM comercial](https://crm.organizastudios.com/comercial) · [CommercialPage.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/CommercialPage.tsx) · [LeadCard.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/LeadCard.tsx) · [LeadConvertModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/LeadConvertModal.tsx) · [lead-form-conversion.integration.test.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/lead-form-conversion.integration.test.tsx)

<a id="tarefa-6"></a>

## Criar uma turma

- **Também perguntam:** Como abro uma turma nova? Onde cadastro uma turma semanal?
- **Onde começar:** Menu lateral → [Turmas](https://crm.organizastudios.com/turmas).
- **Antes de começar:** Tenha permissão para criar turmas. Separe o serviço, o profissional, a sala, o número de vagas e o horário semanal.

1. Clique em **Nova turma**.
2. Se quiser dar um nome próprio à turma, preencha **Nome da turma**.
3. Selecione o **Serviço**.
4. Selecione o **Profissional**.
5. Selecione a **Sala**.
6. Confira **Vagas**.
7. Clique em **Adicionar horário**.
8. Confira o dia e o horário em **Horários semanais**.
9. Clique em **Criar turma**.

**Como saber se deu certo:** A janela fecha e aparece um cartão com o nome da turma.

**Se o botão não aparecer:** Confira se seu acesso permite criar turmas.

**Verificação:** Formulário visto na interface. Criação verificada no código e no teste de ponta a ponta.

**Fontes:** [Turmas](https://crm.organizastudios.com/turmas) · [GroupsPage.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/groups/GroupsPage.tsx) · [GroupModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/groups/GroupModal.tsx) · [groups.spec.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/groups.spec.ts)

<a id="tarefa-7"></a>

## Abrir os dados e a frequência de uma turma

- **Também perguntam:** Onde vejo as aulas da turma? Como abro a aba de frequência?
- **Onde começar:** Menu lateral → [Turmas](https://crm.organizastudios.com/turmas).
- **Antes de começar:** A turma deve estar cadastrada e visível na lista.

1. No cartão da turma, clique em **Abrir turma**.
2. Clique em **Frequência e reposições** para ver o calendário da turma.
3. Clique em **Dados da turma** para voltar aos dados.

**Como saber se deu certo:** A janela permanece na mesma turma e passa a mostrar o conteúdo da aba escolhida.

**Se o botão não aparecer:** Você consegue ver o cartão da turma na aba **Turmas**?

**Verificação:** Abas vistas na interface. Calendário e troca de abas conferidos no teste de ponta a ponta.

**Fontes:** [Turmas](https://crm.organizastudios.com/turmas) · [GroupsPage.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/groups/GroupsPage.tsx) · [GroupDetailsModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/groups/GroupDetailsModal.tsx) · [groups.spec.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/groups.spec.ts)

<a id="tarefa-8"></a>

## Colocar um cliente na espera de uma turma cheia

- **Também perguntam:** Como coloco um aluno numa fila de turma? O que clico quando a turma está sem vagas?
- **Onde começar:** Menu lateral → [Turmas](https://crm.organizastudios.com/turmas).
- **Antes de começar:** Tenha permissão para matricular. A turma deve estar sem vagas e o cliente deve estar cadastrado.

1. Clique em **Matricular cliente**.
2. Em **Turma**, selecione a opção indicada como turma cheia.
3. Selecione o cliente.
4. Clique em **Colocar na lista de espera**.

**Como saber se deu certo:** O contador **em espera** aumenta no cartão da turma. O teste verifica que a fila permanece após recarregar a página.

**Se o botão não aparecer:** Confira se você escolheu uma turma cheia. Veja se seu acesso permite matricular.

**Verificação:** Entrada da matrícula vista na interface. Seleção de turma cheia e resultado verificados no teste de ponta a ponta.

**Fontes:** [Turmas](https://crm.organizastudios.com/turmas) · [GroupsPage.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/groups/GroupsPage.tsx) · [groups.spec.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/groups.spec.ts)

<a id="tarefa-9"></a>

## Contratar um pacote já cadastrado para um cliente

- **Também perguntam:** Como vendo um pacote de sessões? Como coloco um plano existente no cliente?
- **Onde começar:** Menu lateral → [Planos e sessões](https://crm.organizastudios.com/planos).
- **Antes de começar:** Tenha permissão para contratar planos. Este exemplo cobre um pacote fixo já cadastrado, com pagamento em uma parcela.

1. Clique em **Novo plano**.
2. Selecione o **Cliente**.
3. Em **Plano cadastrado**, escolha o pacote.
4. Confira o **Valor total**.
5. Confira a **Forma de pagamento**.
6. Informe uma parcela no campo **Parcelas**.
7. Preencha **Primeiro vencimento**.
8. Clique em **Criar plano e parcelas**.

**Como saber se deu certo:** A janela fecha. O teste verifica que o plano foi criado com o saldo de sessões do pacote e que a parcela aparece no Financeiro.

**Se o botão não aparecer:** Confira se seu acesso permite contratar planos. Se não encontrar o pacote, verifique a lista **Plano cadastrado**.

**Verificação:** Formulário visto na interface. Gravação do plano e criação da parcela verificadas no teste de ponta a ponta.

**Fontes:** [Planos e sessões](https://crm.organizastudios.com/planos) · [PlansPage.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/plans/PlansPage.tsx) · [PlanModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/plans/PlanModal.tsx) · [plans-finance.spec.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/plans-finance.spec.ts)

<a id="tarefa-10"></a>

## Colocar um cliente na fila por um serviço

- **Também perguntam:** Como ponho um aluno na lista de espera? Como registro que alguém está esperando uma vaga?
- **Onde começar:** Menu lateral → [Lista de espera](https://crm.organizastudios.com/lista-de-espera).
- **Antes de começar:** Tenha permissão para gerenciar a lista. O cliente e o serviço precisam estar cadastrados.

1. Clique em **Adicionar à lista**.
2. Selecione o **Cliente**.
3. Clique em **Turma de um serviço**.
4. Selecione o **Serviço**.
5. Se precisar, preencha **Observações**.
6. Clique em **Adicionar à lista** dentro da janela.

**Como saber se deu certo:** A janela fecha. O serviço aparece em **Maior procura** e o cliente aparece em **Clientes na lista**, com sua posição na fila.

**Se o botão não aparecer:** Confira se você tem permissão para gerenciar a lista. Se o botão da janela estiver desabilitado, confira **Cliente** e **Serviço**.

**Verificação:** Formulário visto na interface. Gravação e posição na fila verificadas no teste de integração.

**Fontes:** [Lista de espera](https://crm.organizastudios.com/lista-de-espera) · [WaitlistPage.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/waitlist/WaitlistPage.tsx) · [WaitlistEntryModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/waitlist/WaitlistEntryModal.tsx) · [waitlist-page.integration.test.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/waitlist/waitlist-page.integration.test.tsx)

<a id="tarefa-11"></a>

## Registrar o pagamento de uma parcela já recebida

- **Também perguntam:** Como dou baixa em uma parcela? Como marco uma parcela como paga? Como registro o pagamento de uma parcela?
- **Onde começar:** Menu lateral → [Financeiro](https://crm.organizastudios.com/financeiro).
- **Antes de começar:** Tenha permissão para registrar recebimentos. A parcela precisa estar em aberto. Este exemplo cobre pagamento integral por Pix.

1. Em **Contas a receber**, encontre a parcela na seção **Parcelas**.
2. Na linha da parcela, clique em **Dar baixa**.
3. Em **Forma de pagamento recebida**, selecione **Pix**.
4. Clique em **Confirmar baixa**.

**Como saber se deu certo:** A janela fecha e a parcela aparece como **Paga**.

**Se o botão não aparecer:** Confira se a parcela está em aberto e se você tem permissão para registrar recebimentos.

**Verificação:** Tela de parcelas vista na interface. Caminho da baixa e situação Paga verificados no código e no teste de ponta a ponta.

**Fontes:** [Financeiro](https://crm.organizastudios.com/financeiro) · [FinancePage.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/FinancePage.tsx) · [ReceivablesList.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/ReceivablesList.tsx) · [SettleModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/SettleModal.tsx) · [plans-finance.spec.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/plans-finance.spec.ts)

<a id="tarefa-15"></a>

## Estornar a baixa de uma parcela paga

- **Também perguntam:** Como desfaço uma baixa? Como corrijo um pagamento lançado na parcela errada?
- **Onde começar:** Menu lateral → [Financeiro](https://crm.organizastudios.com/financeiro).
- **Antes de começar:** A parcela precisa estar paga. Tenha permissão para estornar recebimentos.

1. Em **Contas a receber**, localize a parcela em **Parcelas**.
2. Abra o menu de três pontos, identificado como **Mais ações**.
3. Clique em **Estornar**.
4. Preencha **Motivo**.
5. Clique em **Estornar pagamento**.

**Como saber se deu certo:** A lista é atualizada. O código mostra o aviso **Pagamento estornado.** após a resposta de sucesso.

**Se o botão não aparecer:** Confira se a parcela está paga e se você tem permissão para estornar recebimentos.

**Verificação:** O menu da parcela foi visto na interface. A opção Estornar e a atualização após confirmar foram conferidas no teste de integração. O aviso consta no código.

**Fontes:** [Financeiro](https://crm.organizastudios.com/financeiro) · [FinancePage.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/FinancePage.tsx) · [ReceivablesList.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/ReceivablesList.tsx) · [ReversePaymentModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/ReversePaymentModal.tsx) · [application-shell-finance.integration.test.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/finance/application-shell-finance.integration.test.tsx)

<a id="tarefa-12"></a>

## Cadastrar um evento

- **Também perguntam:** Como crio um evento? Onde registro um aulão?
- **Onde começar:** Menu lateral → [Eventos](https://crm.organizastudios.com/eventos).
- **Antes de começar:** Tenha acesso para cadastrar eventos. Separe o nome e a data com horário.

1. Clique em **Novo evento**.
2. Preencha **Nome do evento**.
3. Preencha **Data e horário**.
4. Se quiser, preencha **Local ou cidade**.
5. Clique em **Salvar evento**.

**Como saber se deu certo:** O evento aparece em **Eventos cadastrados**, com o nome informado.

**Se o botão não aparecer:** Você consegue ver o botão **Novo evento** no topo da tela **Eventos**?

**Verificação:** Entrada vista na interface. Campos e gravação verificados no código e no teste de ponta a ponta.

**Fontes:** [Eventos](https://crm.organizastudios.com/eventos) · [EventsPage.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/events/EventsPage.tsx) · [EventModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/events/EventModal.tsx) · [events.spec.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/events.spec.ts)

<a id="tarefa-13"></a>

## Consultar os números de um período

- **Também perguntam:** Como filtro os relatórios por data? Como vejo os números entre duas datas?
- **Onde começar:** Menu lateral → [Relatórios](https://crm.organizastudios.com/relatorios).
- **Antes de começar:** Tenha acesso ao módulo Relatórios.

1. Na seção **Período de análise**, preencha a data inicial em **De**.
2. Preencha a data final em **Até**.
3. Clique em **Atualizar**.
4. Clique na aba do assunto que deseja consultar, como **Clientes** ou **DRE**.

**Como saber se deu certo:** Os gráficos e valores passam a usar o período escolhido. O teste verifica que o período é compartilhado entre as abas.

**Se o botão não aparecer:** Você está vendo a seção **Período de análise** e os campos **De** e **Até**?

**Verificação:** Abas vistas na interface. Escolha do período e resultado verificados no teste de ponta a ponta.

**Fontes:** [Relatórios](https://crm.organizastudios.com/relatorios) · [ReportsPage.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/reports/ReportsPage.tsx) · [reports.spec.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/reports.spec.ts)

## Pendências de verificação

Retome pela **Agenda → cartão de um atendimento → menu de três pontos e Detalhes**. Abra as opções conforme a situação do atendimento e confira as telas de confirmação no código e nos testes para completar a validação do cancelamento na interface e documentar presença e falta. Depois siga a ordem abaixo. Use a revisão registrada no início deste arquivo.

| Módulo | Pontos a conferir |
| --- | --- |
| Agenda | Cartões e três pontos por situação, notas recorrentes, presença, falta, cancelamento, bloqueios, compartilhamento, histórico de remarcações e atalhos para A finalizar e Concluídos. |
| Clientes | Abrir ficha e Editar constam no código da lista. Conferir abas da ficha, ações em registros antigos, edição, duplicados, importação, exportação e cadastro com cada item adicional. |
| CRM comercial | Conferir no navegador cartões, detalhes, edição, tarefas, contatos, perda, movimentação, importação e seções recolhíveis Mais informações e Dados para o cadastro de cliente. Conversão depende também do acesso a cadastro de clientes. |
| Turmas | Matricular com vaga, renomear, cancelar matrícula, registrar frequência, concluir aula e reservar reposição. Conferir cada ação a partir do cartão e da aula. |
| Planos e sessões | Conferir ações de cartão, saldo e movimentos, renovar, pausar, cancelar, devolução, venda por tipo, pagamento dividido, turma, renovação automática e documentos. |
| Lista de espera | Conferir fila por produto, filtros, atualização, oferta de vaga, matrícula, remoção e aviso por WhatsApp. O código exige acesso a Turmas e Clientes para oferecer vaga e permissão de matrícula para confirmar. |
| Financeiro | Conferir ações por situação da parcela, contato, ajuste, comprovante, recibo, estorno e permissão por ação. Abrir Contas a pagar e Comissões e verificar despesas, fornecedores, recorrências e folha. |
| Visão geral | Conferir cartões e atalhos, inclusive o que aparece com cada permissão. |
| Prontuários | Conferir ficha, anexos, revisões, evolução, avaliações, modelos e exportação. |
| Eventos | Conferir edição, cartão, detalhe, participantes, importação, exportação e conversão. |
| Contatos sugeridos | Conferir cartões, motivos das sugestões e registrar contato. |
| Comunicações | Conferir edição, prévia, destinatários, disparo, tratamento de falhas e permissões. |
| Contratos | Conferir editor, revisão, emissão, assinatura, envio, cancelamento e opções por situação. |
| Vendas de produtos | Conferir abas, estoque, descontos, pagamentos, histórico e reversão. |
| Relatórios | Conferir abas internas, filtros por assunto e opções de exportação. |
| Histórico | Conferir campos de filtro, detalhes e vínculo com registro de origem. |
| Configurações | Conferir conteúdo, opções e dependências de cada aba. Validar as permissões em Usuários pelo código e pelos testes. |
| Meu perfil | Conferir passos e validações para atualização de perfil e senha. |

### Diferenças e caminhos ainda sem confirmação

- **Novo cliente.** O teste de ponta a ponta seleciona **Só cadastrar por enquanto**. Esse controle não apareceu na tela publicada e o componente atual oferece os botões da seção **O que o cliente vai fazer?** para adicionar itens. O tutorial segue o formulário visto e o teste de integração que usa **Salvar cliente**. Revalidar o teste de ponta a ponta contra o formulário atual. [patients.spec.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/patients.spec.ts) · [PatientModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/PatientModal.tsx) · [patient-nickname.integration.test.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/patients/patient-nickname.integration.test.tsx)
- **Novo lead.** O teste de integração cadastra com nome e telefone preenchidos no cenário dele. O formulário atual também marca **Origem** e **Interesse** como obrigatórios, e na tela publicada ambos começaram em **Selecione**. O tutorial orienta preencher os dois. [LeadModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/LeadModal.tsx) · [lead-form-conversion.integration.test.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/features/commercial/lead-form-conversion.integration.test.tsx)
- **Assinaturas públicas.** O código declara rotas próprias para assinatura de contrato e recibo. Caminho pela interface publicado pendente. Conferir como o link é gerado, em que situação aparece e quais etapas o destinatário vê. [AppRoutes.tsx](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/apps/web/src/app/AppRoutes.tsx) · [public-signature.spec.ts](https://github.com/Bren0-lz/crm-studios/blob/dd13b30dbf99a361899221397f476792601a54d2/e2e/public-signature.spec.ts)
- **Perfis e publicação.** A inspeção usou a sessão que já estava aberta. Falta comparar a interface com perfis de acesso restrito, testar as condições de cada ação e identificar a revisão publicada. Os pontos acima descrevem diferenças de rótulos ou de cenário observadas, sem atribuir uma revisão ao sistema publicado.

## Estado por módulo

| Módulo | Estado | Alcance |
| --- | --- | --- |
| Agenda | Parcialmente mapeado | 3 tutoriais e inventário inicial. |
| Clientes | Parcialmente mapeado | 1 tutorial e inventário inicial. |
| CRM comercial | Parcialmente mapeado | 2 tutoriais e inventário inicial. |
| Turmas | Parcialmente mapeado | 3 tutoriais e inventário inicial. |
| Planos e sessões | Parcialmente mapeado | 1 tutorial e inventário inicial. |
| Lista de espera | Parcialmente mapeado | 1 tutorial e inventário inicial. |
| Financeiro | Parcialmente mapeado | 2 tutoriais e inventário inicial. |
| Visão geral | Parcialmente mapeado | Entrada e controles principais inventariados. Fluxos detalhados pendentes. |
| Prontuários | Parcialmente mapeado | Entrada e controles principais inventariados. Fluxos detalhados pendentes. |
| Eventos | Parcialmente mapeado | 1 tutorial e inventário inicial. |
| Contatos sugeridos | Parcialmente mapeado | Entrada e controles principais inventariados. Fluxos detalhados pendentes. |
| Comunicações | Parcialmente mapeado | Entrada e controles principais inventariados. Fluxos detalhados pendentes. |
| Contratos | Parcialmente mapeado | Entrada e controles principais inventariados. Fluxos detalhados pendentes. |
| Vendas de produtos | Parcialmente mapeado | Entrada e controles principais inventariados. Fluxos detalhados pendentes. |
| Relatórios | Parcialmente mapeado | 1 tutorial e inventário inicial. |
| Histórico | Parcialmente mapeado | Entrada e controles principais inventariados. Fluxos detalhados pendentes. |
| Configurações | Parcialmente mapeado | Entrada e controles principais inventariados. Fluxos detalhados pendentes. |
| Meu perfil | Parcialmente mapeado | Entrada e controles principais inventariados. Fluxos detalhados pendentes. |
| Assinaturas públicas | Pendente | Rotas identificadas no código. Caminho publicado por confirmar. |
