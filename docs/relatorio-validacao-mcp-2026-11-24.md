# Validação dos guias do CRM em 24/11/2026

O teste foi feito no site de homologação informado, no Chromium. Usei uma conta administrativa e criei um usuário comum para testar consulta de cliente, troca de senha e encerramento de sessões. As duas assinaturas públicas foram testadas em uma janela sem login, no tamanho de um celular.

Os guias incorporados estão no [catálogo de passos verificados](guias-mcp-fluxos-verificados.md). O código usado para conferir os rótulos e condições é o da revisão `84fd92e18fc06d125417e7c82afcf3d4d0d7832f`. As referências dos guias usam uma revisão anterior com os mesmos arquivos citados, equivalência que o gerador do MCP verifica no build.

O JavaScript `index-2iho31au.js` e o CSS `index-BEDjH5Ke.css` do site eram idênticos aos arquivos do build local para a Hostinger. A comparação cobre a interface carregada no navegador.

## Problemas observados

### AG06 · A Agenda oferece edição para um atendimento já finalizado

1. Na **Agenda**, crie um atendimento experimental num horário cujo término já passou, com a finalização automática ativa.
2. Sem recarregar a página, abra o cartão que acabou de aparecer como **Agendado**.
3. Clique em **Editar**, altere **Observação** e clique em **Salvar alterações**.

O resultado esperado era que o cartão mostrasse a situação atualizada e oferecesse as ações disponíveis para ela.

O formulário abriu, mas o salvamento foi recusado com a mensagem “Somente atendimentos agendados ou confirmados podem ser editados.” A resposta foi HTTP 409, código `APPOINTMENT_UPDATE_FORBIDDEN`. Depois de recarregar a Agenda, o mesmo atendimento apareceu como **Finalizado**. Repeti a edição num atendimento futuro e a observação foi salva. [Guia AG06](guias-mcp-fluxos-verificados.md#ag06--editar-os-dados-de-um-atendimento-na-agenda)

### AG13 · Bloqueio gravado demorou a aparecer na Lista

1. Na **Agenda**, selecione **Dia** e **Lista**.
2. Clique em **Bloquear horário**, escolha o profissional e informe um período livre no dia aberto.
3. Preencha **Motivo** e clique em **Criar bloqueio**.

O resultado esperado era que o bloqueio aparecesse na lista do dia após o salvamento.

Na primeira tentativa, o Histórico registrou **Bloqueio de agenda criado**, mas o bloqueio só ficou visível na Agenda depois de recarregar a página e voltar para **Lista**. Na segunda tentativa, outro bloqueio retornou HTTP 201 e apareceu sem recarregar. A inconsistência ocorreu uma vez. Ambos os bloqueios de teste foram cancelados. [Guia AG13](guias-mcp-fluxos-verificados.md#ag13--bloquear-um-horário-de-um-profissional-ou-de-uma-sala)

### AG25 · Compromissos da Agenda e cadastros de Eventos

No mesmo dia, cadastrei um feriado em **Configurações** e um registro no módulo **Eventos**. A Agenda exibiu o feriado e os encontros de turma, mas o registro do módulo **Eventos** não apareceu na programação diária nem na janela do calendário mensal. Se a expectativa do produto for mostrar esses cadastros na Agenda, o cenário está reproduzido.

## Cobertura da rodada

Cobre os percursos descritos nos guias incorporados. As variantes de perfil, filial, situação do registro e dispositivo continuam registradas na [matriz de cobertura](auditoria-cobertura-mcp.md#matriz-por-objetivo). Dos **211** objetivos do anexo, **129** entraram no catálogo e **82** seguem pendentes. Com os capítulos anteriores, o MCP local passa a oferecer **159** tutoriais.

Durante a rodada também reconferi alguns capítulos existentes, como cadastro simples de cliente, criação de lead, agendamento individual, criação de evento e lançamento manual no Financeiro. O lançamento manual passou de **FI01** para **FI11** para coincidir com a matriz. **FI01** agora identifica a localização e filtragem de parcelas.

## Dados fictícios

Usei o prefixo `[MCP 241126]` em cadastros e lançamentos criados para a rodada. Os testes de importação também criaram **MCP Cliente Importado** e **MCP Participante Importado**. O cliente importado foi usado nos testes da Lixeira e excluído definitivamente. O participante importado continuou no funil comercial depois da remoção do evento. A importação do funil também criou **MCP Lead Importado**. Restaurei a preferência de som, o nome e a cor de Agenda da conta usada para a validação depois de verificar o salvamento.

## Pontos para retomar nos fluxos pendentes

- **AG03**. O formulário mostrou **Repetir este atendimento**. Para **Experimental**, o controle ficou desativado. Falta contratar um plano elegível e verificar a criação das ocorrências.
- **AG11**. A ação **Marcar como realizado** foi vista no detalhe. Falta registrar a finalização manual e conferir o efeito sobre o saldo de um plano fictício.
- **AG12**. A falta fictícia abriu **Remarcar ausência** e o formulário **Reagendar atendimento**. Falta gravar e conferir o vínculo com a falta e com o plano.
- **CL06**. O cadastro mostrou **Agendar aula experimental**. Falta salvar a combinação de cadastro e agendamento.
- **CL07**. O cadastro mostrou **Adicionar plano**. Falta salvar a contratação junto com o cadastro.
- **CL08**. O cadastro mostrou **Adicionar serviço avulso**. Falta salvar a venda junto com o cadastro.
- **CL09**. O cadastro mostrou **Adicionar produto**. Falta salvar a venda junto com o cadastro.
- **CL14**. A opção **Inativar em lote** apareceu em **Mais**. Falta conferir os critérios, a seleção e o resultado com registros fictícios.
- **CM11**. O cartão do lead fictício abriu **Agendar experimental**. Falta salvar e conferir o atendimento na Agenda.
- **GR11**. A ação **Cancelar matrícula** apareceu nos detalhes da turma. Falta matricular um cliente fictício na turma da rodada e conferir os efeitos do cancelamento.
- **PL09**. A ação **Cancelar** apareceu em plano ativo. Faltam os cenários com e sem devolução em compras fictícias.
- **PR02**. Aba **Linha do tempo** e filtros **Tudo**, **Avaliações** e **Arquivos** localizados. Falta confirmar quais dados do anexo e da avaliação aparecem em cada filtro.
- **PR14**. A ação **Encerrar tratamento** apareceu em **Mais ações**. Falta gravar e conferir o resultado no prontuário.
- **PR19**. O formulário de anexo mostrou **Gravar áudio**. Falta gravar com fonte de áudio de teste e reproduzir o arquivo.
- **CO01**. A aba **Campanhas** mostrou uma campanha manual. Faltam busca e filtros com resultados de teste.
- **CT09**. A ação **Registrar assinatura manual** apareceu no contrato emitido. Falta confirmar em outro contrato fictício e conferir o registro depois.
- **VE05**. Os detalhes da venda paga mostraram o cancelamento indisponível. Falta estornar o recebimento correspondente e confirmar a reversão de estoque.
- **FI24**. A aba **Comissões** apareceu no Financeiro. Falta conferir regras associadas a comissões geradas.
- **RL07**. A aba mostrou **DRE por competência**, **Exportar DRE** e **Imprimir DRE**. Falta abrir categorias num período com lançamentos apropriados.
- **RL08**. O relatório financeiro mostrou **Configurar pró-labore**. Falta gravar e reverter uma configuração de teste.
- **CF03**. Foi criado um usuário comum com acesso a Clientes. Falta associar o usuário a mais de uma filial e conferir o escopo resultante.
- **CF04**. A seleção de permissão de consulta foi exercitada com usuário comum e a interface mostrou **Limpar permissões**. Faltam copiar e limpar permissões e conferir o efeito após salvar.
- **CF06**. As ações **Redefinir senha** e **Encerrar acessos** apareceram na lista de usuários. Falta exercitá-las como administrador sobre outra conta fictícia.

## Inventário dos objetivos pendentes

Os objetivos incluem os percursos que chegaram aos pontos descritos acima e os que ainda precisam ser exercitados.

### Agenda (7)

- **AG03** Agendar atendimentos recorrentes.
- **AG04** Cadastrar rapidamente um cliente durante o agendamento.
- **AG11** Finalizar um atendimento individual.
- **AG12** Agendar reposição de um atendimento com falta.
- **AG19** Consultar o histórico de remarcações.
- **AG20** Filtrar e finalizar atendimentos pendentes.
- **AG24** Registrar pesquisa de satisfação no atendimento.

### Clientes (7)

- **CL06** Cadastrar um cliente e agendar aula experimental no mesmo fluxo.
- **CL07** Cadastrar um cliente e contratar plano no mesmo fluxo.
- **CL08** Cadastrar um cliente e vender serviço avulso.
- **CL09** Cadastrar um cliente e adicionar produto.
- **CL14** Inativar clientes em lote.
- **CL16** Aplicar desconto no cadastro com compra.
- **CL18** Concluir as etapas da venda guiada após cadastro ou compra.

### CRM comercial (2)

- **CM07** Organizar as etapas do funil.
- **CM11** Agendar atendimento para o lead.

### Turmas (6)

- **GR07** Marcar frequência em uma aula.
- **GR08** Concluir uma aula.
- **GR09** Reservar uma reposição.
- **GR10** Registrar presença na reposição.
- **GR11** Cancelar uma matrícula.
- **GR12** Alterar o profissional de uma aula.

### Lista de espera (1)

- **LE05** Confirmar matrícula a partir da fila.

### Planos e sessões (2)

- **PL05** Contratar plano com matrícula e documento.
- **PL09** Cancelar um plano com ou sem devolução.

### Prontuários (6)

- **PR02** Consultar o histórico clínico.
- **PR14** Registrar alta ou encerramento de tratamento.
- **PR17** Criar material ou treino clínico.
- **PR18** Copiar, editar, finalizar ou imprimir material clínico.
- **PR19** Gravar e ouvir áudio no fluxo do prontuário.
- **PR20** Registrar a execução de um treino. Este fluxo foi identificado na auditoria de navegador.

### Eventos (1)

- **EV09** Converter um participante em cliente.

### Contatos sugeridos (1)

- **RE03** Registrar contato com o cliente sugerido.

### Comunicações (9)

- **CO01** Consultar, procurar e filtrar campanhas.
- **CO02** Preparar uma campanha manual e conferir destinatários.
- **CO03** Trabalhar na fila da campanha com um filtro ativo.
- **CO04** Abrir o canal, marcar a execução e tratar falhas.
- **CO07** Criar e agendar os momentos de uma campanha automática.
- **CO08** Tratar uma entrega ou excluir uma pendência automática.
- **CO09** Registrar manualmente uma resposta de NPS.
- **CO10** Preparar um lembrete de sessão por WhatsApp.
- **CO11** Editar as preferências de contato do cliente.

### Contratos e documentos (2)

- **CT09** Registrar a assinatura presencial de um contrato.
- **CT12** Abrir documentos associados a um fornecedor.

### Vendas de produtos e estoque (2)

- **VE04** Cancelar uma venda ainda a receber.
- **VE05** Estornar o recebimento e cancelar uma venda paga.

### Financeiro (17)

- **FI05** Ajustar o valor de uma parcela em aberto.
- **FI10** Contatar o cliente sobre uma parcela.
- **FI12** Renegociar valores a receber.
- **FI13** Corrigir a data ou a classificação de um lançamento.
- **FI19** Ajustar o valor de uma conta a pagar.
- **FI22** Cadastrar ou editar um fornecedor.
- **FI23** Consultar ou cadastrar um pedido de fornecedor.
- **FI24** Consultar comissões e suas regras.
- **FI25** Criar uma regra de comissão e conferir o recálculo.
- **FI26** Gerar comissões para um período.
- **FI27** Pagar ou estornar uma comissão.
- **FI28** Conciliar um ajuste de comissão já paga.
- **FI29** Configurar um colaborador na folha.
- **FI30** Registrar desconto, recompensa ou vale.
- **FI31** Lançar ou desfazer a folha.
- **FI33** Registrar uma operação fiscal externa com comprovante.
- **FI34** Consultar ou baixar o comprovante de uma operação fiscal externa.

### Relatórios (2)

- **RL07** Ler a DRE e detalhar categorias.
- **RL08** Configurar pró-labore a partir do relatório.

### Configurações (16)

- **CF02** Atualizar informações e apresentação da clínica.
- **CF03** Cadastrar um usuário e associá-lo a filiais.
- **CF04** Ajustar, copiar ou limpar permissões de um usuário.
- **CF06** Redefinir senha ou encerrar sessões de outro usuário.
- **CF07** Configurar um profissional de agenda e sua comissão.
- **CF10** Renomear uma aba do menu.
- **CF11** Cadastrar um plano no catálogo.
- **CF12** Editar ou retirar um plano do catálogo.
- **CF15** Configurar a finalização automática de atendimentos.
- **CF16** Definir parcelamento e formas de pagamento.
- **CF18** Vincular o Telegram, escolher assuntos e editar ou desvincular avisos em chats pessoais e grupos.
- **CF19** Criar ou editar uma etiqueta manual.
- **CF20** Excluir uma etiqueta manual ou ajustar etiquetas automáticas.
- **CF21** Gerenciar catálogos comerciais.
- **CF22** Cadastrar ou editar um serviço e seus recursos.
- **CF23** Cadastrar ou editar uma sala e sua capacidade.

### Meu perfil (1)

- **MP01** Atualizar nome e foto do próprio perfil.
