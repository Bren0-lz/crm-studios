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

### CT12 · A assinatura do fornecedor falha quando o e-mail está vazio

1. Em **Vendas de produtos › Fornecedores**, abra **Editar** em um fornecedor com WhatsApp preenchido e **E-mail** vazio.
2. Em **Documentos**, selecione um modelo cuja prévia indique que os dados usados pelo modelo estão preenchidos.
3. Clique em **Salvar e enviar pelo WhatsApp**.

O CRM voltou à aba **Dados** com “E-mail: Opção inválida.” A resposta HTTP foi 400, com código `VALIDATION_ERROR`. A aba **Documentos** indicava que os dados do modelo estavam completos, e o campo **E-mail** não estava marcado como obrigatório. Com um endereço fictício preenchido, o CRM emitiu o documento, exibiu o link e acrescentou a entrada a **Documentos enviados**. [Guia CT12](guias-mcp-fluxos-verificados.md#ct12--consultar-os-documentos-enviados-para-um-fornecedor)

### CO01 · A lista de campanhas não oferece busca nem filtro

Em **Comunicações › Campanhas**, as campanhas fictícias apareceram em **Em andamento** e **Concluídas**. A busca pelo título e o filtro por situação solicitados no inventário não tinham controles nessa lista. Os filtros de destinatário funcionaram dentro da fila de cada campanha. [Guia CO01](guias-mcp-fluxos-verificados.md#co01--encontrar-uma-campanha-manual-em-comunicações)

### RL07 · A composição da DRE não abre os lançamentos da categoria

Em **Relatórios › DRE**, selecionei um período com receitas e despesas. A tabela **Composição** mostrou os totais mensais por categoria e o botão **Exportar DRE** gerou o arquivo. A tabela não ofereceu uma ação nas linhas para abrir os lançamentos que compõem o total de uma categoria. [Guia RL07](guias-mcp-fluxos-verificados.md#rl07--ler-a-composição-da-dre)

### AG12 · A reposição de uma experimental pode ser bloqueada depois de uma compra

Ao tentar **Remarcar ausência** em uma experimental de um cliente que já tinha comprado um plano do mesmo serviço, o CRM recusou a confirmação com “O cliente já tem plano deste serviço. A aula experimental é só para serviço fora do plano.” Em outro cliente fictício sem plano daquele serviço, a reposição apareceu no novo dia e o atendimento original continuou com falta. [Guia AG12](guias-mcp-fluxos-verificados.md#ag12--agendar-reposição-a-partir-de-uma-falta)

### FI23 · O total dos produtos não preenche o valor do pedido de compra

Ao adicionar um produto ao pedido de fornecedor, o CRM mostrou a soma dos itens. O formulário ainda exigiu preencher **Valor do pedido** separadamente. O pedido foi registrado depois desse preenchimento. [Guia FI23](guias-mcp-fluxos-verificados.md#fi23--consultar-ou-cadastrar-um-pedido-de-fornecedor)

## Cobertura da rodada

Na primeira rodada entraram **129** guias. A segunda acrescentou **79** dos **82** objetivos pendentes. Dos **211** objetivos do anexo, **208** têm guia e **3** ainda precisam de validação suficiente para receber um. Com os capítulos anteriores, o catálogo do MCP no repositório tem **238** tutoriais. A busca e o filtro da lista de campanhas (**CO01**) e a abertura de lançamentos por categoria da DRE (**RL07**) são diferenças de cobertura nos guias correspondentes, descritas acima.

Na segunda rodada, conferi resultados após sair do formulário, nas listas, fichas e históricos correspondentes. Por exemplo, a matrícula apareceu na turma selecionada, o cancelamento com devolução gerou uma saída no Financeiro e o estorno da folha devolveu a comissão à situação **Na folha**. As variantes de perfil, filial, situação do registro e dispositivo estão na [matriz de cobertura](auditoria-cobertura-mcp.md#matriz-por-objetivo).

Também reconferi alguns capítulos existentes, como cadastro simples de cliente, criação de lead, agendamento individual, criação de evento e lançamento manual no Financeiro. O lançamento manual passou de **FI01** para **FI11** para coincidir com a matriz. **FI01** agora identifica a localização e filtragem de parcelas.

## Dados fictícios

Usei o prefixo `[MCP 241126]` em cadastros e lançamentos criados para a rodada. Os testes de importação também criaram **MCP Cliente Importado** e **MCP Participante Importado**. O cliente importado foi usado nos testes da Lixeira e excluído definitivamente. O participante importado continuou no funil comercial depois da remoção do evento. A importação do funil também criou **MCP Lead Importado**. Restaurei a preferência de som, o nome e a cor de Agenda da conta usada para a validação depois de verificar o salvamento.

Na segunda rodada, usei também o prefixo `[MCP 241126 R2]`. Restaurei as preferências da Agenda e a configuração de pró-labore ajustadas temporariamente. Nos fluxos de WhatsApp, conferi a abertura do canal e o registro de status no CRM usando destinatários fictícios, sem disparar mensagens externas.

## Objetivos pendentes

### CL14 · Inativar clientes em lote

Em **Clientes › Mais › Inativar em lote**, o prazo mínimo foi de três meses. Com esse prazo, **Ver prévia** retornou “Nenhum cliente elegível para o período informado.” Os clientes criados para esta rodada eram recentes. O teste de integração do repositório passou com cadastros elegíveis e conferiu a inativação. Falta conferir no site a seleção de um cadastro fictício elegível, a confirmação e a situação final do cliente.

### CO09 · Registrar manualmente uma resposta de NPS em campanha

Na fila de campanhas em **Comunicações**, a tela permitiu registrar o envio e pular destinatários. Não encontrei uma ação para lançar a resposta manual ali. A entrada manual de nota e comentário funcionou nos detalhes do atendimento, em **Satisfação**. Falta confirmar se o inventário também exige que a resposta seja atribuída à campanha. [Guia AG24](guias-mcp-fluxos-verificados.md#ag24--registrar-uma-pesquisa-de-satisfação-no-atendimento)

### CF18 · Vincular e gerenciar avisos no Telegram

Em **Configurações › Integrações**, gerei códigos de vínculo para conversa privada e grupo em uma conta administrativa fictícia. Ao reconferir, nenhum chat aparecia vinculado nessa conta. A etapa com o bot no chat privado e no grupo de teste precisa ser concluída para validar o recebimento dos avisos, os assuntos selecionados, a edição e a desvinculação.
