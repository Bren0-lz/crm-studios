# Status da implementação — Studios Aryana

Atualizado em 3 de outubro de 2026.

## Incremento 1 — Fundação e operação básica

Concluído:

- monorepo, contratos compartilhados e validação de entrada;
- autenticação JWT e sessão web;
- dashboard operacional;
- cadastro e pesquisa de clientes;
- profissionais, salas e serviços;
- agenda diária, criação de atendimento e mudança de status;
- interface responsiva;
- testes unitários, build, lint e formatação.

## Incremento 2 — Persistência PostgreSQL

Implementado:

- repositório PostgreSQL com isolamento por `clinic_id`;
- migrações automáticas e versionadas;
- seed demonstrativo idempotente;
- persistência de clientes, agenda e cadastros auxiliares;
- restrições de exclusão no banco contra sobreposição de profissional ou sala;
- encerramento seguro do pool de conexões;
- teste de integração opt-in via `TEST_DATABASE_URL`;
- modo em memória preservado para demonstrações rápidas.

Validação local pendente apenas para o teste de integração PostgreSQL: o computador atual não oferece WSL2/virtualização, impedindo o mecanismo Linux do Docker Desktop de iniciar. O teste está pronto para execução em CI ou em qualquer ambiente com PostgreSQL acessível.

## Incremento 3 — Prontuário clínico web

Concluído:

- evolução SOAP vinculada obrigatoriamente ao atendimento;
- escala de dor de 0 a 10;
- rascunhos editáveis;
- finalização imutável com confirmação explícita;
- versão preservada a cada salvamento;
- consulta do histórico de versões;
- acesso restrito a gestão e fisioterapeutas na interface e na API;
- proteção equivalente nos modos memória e PostgreSQL;
- interface responsiva para listagem, edição e histórico.

## Incremento 4 — Planos e sessões

Concluído:

- atendimento avulso, pacote fixo, recorrente e personalizado;
- quantidade, validade, valor e parcelamento;
- saldo e razão imutável de movimentos;
- consumo transacional ao finalizar atendimento;
- restauração transacional ao desfazer finalização;
- pausa, reativação e cancelamento definitivo;
- cancelamento conjunto das parcelas ainda abertas;
- alertas visuais de saldo baixo.

## Incremento 5 — Financeiro inicial

Concluído:

- contas a receber geradas atomicamente na venda do plano;
- divisão exata do valor entre parcelas;
- situação aberta, vencida, paga e cancelada;
- baixa e estorno com histórico de eventos;
- totais em aberto, atrasados e recebidos no mês;
- acesso restrito a gestão e financeiro;
- interface responsiva de parcelas.

## Incremento 6 — CRM comercial interno

Concluído:

- leads e origem;
- funil Kanban com seis etapas;
- histórico de mudanças de etapa;
- motivo obrigatório para perdas;
- conversão idempotente e segura em cliente;
- reaproveitamento de cliente existente por telefone ou e-mail;
- acesso restrito a gestão, recepção e financeiro.

## Incremento 7 — Comunicação transacional

Concluído:

- preferências e opt-out por canal;
- mensagens administrativas sem conteúdo clínico;
- fila de mensagens desacoplada;
- lembretes idempotentes de atendimento e cobrança;
- histórico centralizado da outbox;
- modo seguro `outbox_only`, sem simular entregas externas;
- persistência equivalente em memória e PostgreSQL;
- interface responsiva para recepção e gestão.

Para envio real ainda será necessário contratar e configurar provedores oficiais de WhatsApp Business e e-mail. A agenda e o financeiro não dependem desses provedores.

## Incremento 8 — Núcleo de contratos e documentos

Concluído:

- modelos versionados com variáveis controladas;
- contratos vinculados a cliente e plano;
- snapshot imutável do conteúdo emitido;
- rascunho, emissão e cancelamento definitivo;
- histórico das versões antigas do modelo;
- validação de que o plano pertence ao cliente;
- interface para biblioteca, emissão e consulta do conteúdo preservado;
- persistência equivalente em memória e PostgreSQL.

Assinatura eletrônica externa, evidências técnicas e geração do PDF final permanecem desacopladas até a definição do provedor. Nenhum portal ou aplicativo do cliente foi criado.

Em 1º de outubro de 2026 o módulo Documentos foi removido por completo (migração 0036). Ele voltou como **Contratos** no incremento 37, com as mesmas regras de modelos e emissão, sem a emissão da declaração pela agenda.

## Incremento 9 — Relatórios e indicadores gerenciais

Concluído:

- operação da agenda, presença e faltas;
- ocupação por profissional e serviço;
- consumo e saldo de sessões;
- carteira financeira e inadimplência;
- conversão comercial;
- filtros reproduzíveis por período;
- indicadores por profissional, serviço e origem do lead;
- definições das taxas registradas na interface;
- exportação CSV autenticada derivada dos mesmos dados da tela;
- acesso restrito a gestão e financeiro;
- persistência equivalente em memória e PostgreSQL.

## Incremento adiado — Migração de dados

Adiado por depender de arquivos e validação humana do legado.

## Incremento 10 — Agenda avançada

Concluído:

- visão diária e semanal responsiva;
- criação de séries recorrentes com intervalo de uma a quatro semanas;
- criação atômica: conflito em uma ocorrência cancela toda a série;
- vínculo das ocorrências pelo identificador da série;
- bloqueios por profissional ou sala;
- cancelamento de bloqueio com preservação do registro;
- conflito entre atendimentos e bloqueios protegido no domínio e no PostgreSQL;
- interface operacional para recorrência e indisponibilidades.

## Incremento 11 — CRM comercial avançado

Concluído:

- responsáveis por lead;
- etiquetas;
- tarefas e lembretes;
- histórico detalhado de contatos;
- canal, direção, autoria e horário de cada contato;
- vencimento, responsável, conclusão e cancelamento de tarefas;
- alertas de tarefas abertas e atrasadas no Kanban;
- linha do tempo comercial por lead;
- tempo médio de primeira resposta nos relatórios;
- persistência equivalente em memória e PostgreSQL.

## Incremento 12 — Financeiro avançado

Concluído:

- contas a pagar com fornecedor, vencimento e observações;
- categorias financeiras de receita e despesa;
- centros de custo;
- baixa e estorno de despesas;
- formas de pagamento em recebimentos e pagamentos;
- descontos e acréscimos por ajuste justificado de recebíveis;
- eventos financeiros imutáveis no PostgreSQL;
- recibos de pagamento prontos para impressão;
- totais de despesas abertas, vencidas e pagas no mês;
- saldo de caixa mensal calculado entre entradas e saídas confirmadas;
- interface financeira responsiva com visões de recebíveis e contas a pagar;
- persistência equivalente em memória e PostgreSQL;
- teste integrado do fluxo completo de recebimento, recibo, pagamento e estorno.

## Incremento 13 — Prontuário clínico avançado

Concluído:

- avaliações configuráveis por especialidade;
- construtor de modelos com campos de texto, números, escalas e booleanos;
- validação de obrigatoriedade, tipo e limites de cada campo;
- medidas e escalas seriadas;
- objetivos terapêuticos e acompanhamento de evolução;
- alta, encaminhamento e encerramento do tratamento;
- resumo longitudinal integrado com evoluções SOAP, avaliações, medidas e encerramentos;
- autoria e data preservadas em todos os registros;
- isolamento por clínica e acesso restrito à gestão e fisioterapeutas;
- persistência equivalente em memória e PostgreSQL;
- teste integrado das regras, limites de escala e linha do tempo.

## Incremento 14 — Arquivos e integridade do prontuário

Concluído:

- anexos clínicos com metadados, limites e controle de acesso;
- suporte a PDF, PNG e JPEG com limite de 5 MB;
- validação da assinatura binária real, tamanho declarado e codificação Base64;
- impressão digital SHA-256 para conferência de integridade;
- conteúdo do arquivo omitido das listagens e carregado apenas no download;
- adendos imutáveis em evoluções já finalizadas;
- bloqueio de adendos em rascunhos;
- resumo longitudinal próprio para impressão;
- exportação estruturada do prontuário;
- auditoria de leitura, exportação, upload, download e criação de adendo;
- gatilhos PostgreSQL que impedem alteração e exclusão de anexos, adendos e eventos de auditoria;
- interface responsiva para anexar, baixar, complementar, imprimir e exportar;
- cobertura integrada das regras de integridade e auditoria.

## Incremento 15 — Administração e segurança operacional

Implementado:

- gestão e ativação de usuários restrita ao proprietário;
- redefinição de senha forte;
- configurações cadastrais da clínica;
- matriz de permissões por perfil;
- auditoria de alterações administrativas;
- bloqueio temporário após cinco tentativas inválidas de login;
- interface administrativa responsiva;
- persistência equivalente em memória e PostgreSQL.

## Incremento 16 — Renegociação e comissões profissionais

Concluído:

- renegociação atômica de uma ou mais parcelas do mesmo cliente;
- cancelamento preservado das parcelas originais;
- redistribuição exata do novo total entre parcelas e vencimentos;
- regras percentuais de comissão com início de vigência;
- cálculo sobre atendimentos concluídos e preço do serviço;
- seleção automática da regra vigente na data do atendimento;
- geração idempotente por atendimento e competência;
- pagamento e estorno de comissões;
- comissões pagas consideradas no saldo de caixa mensal;
- interface para seleção de parcelas, renegociação, regras e competências;
- persistência equivalente em memória e PostgreSQL;
- teste integrado de renegociação, arredondamento e idempotência.

## Incremento 17 — Turmas, frequência e reposições

Concluído:

- cadastro de turmas vinculado a serviço, profissional e sala;
- validação da capacidade física da sala;
- matrículas com lotação protegida e lista de espera ordenada;
- promoção automática da primeira pessoa da fila após cancelamento;
- geração atômica de encontros recorrentes;
- detecção de conflitos com atendimentos, bloqueios e outras turmas;
- frequência individual com presença, falta e ausência justificada;
- créditos de reposição gerados por falta justificada;
- reserva de reposição com controle de vagas e consumo único;
- interface operacional responsiva e persistência equivalente em memória e PostgreSQL;
- cobertura integrada do fluxo de capacidade, fila, promoção e reposição.

A partir do incremento 21, a interface não oferece mais o registro de frequência das aulas nem a reserva de reposições; as regras continuam disponíveis na API.

## Incremento 18 — Produtos, estoque e comandas

Concluído:

- catálogo de produtos com SKU, unidade, custo e preço de venda;
- saldo atual e configuração de estoque mínimo;
- movimentos manuais de compra, entrada, saída e perda;
- bloqueio de movimentos e vendas sem saldo disponível;
- histórico imutável com saldo posterior, operador, motivo e origem;
- comandas vinculadas ao cliente e itens com preço preservado;
- baixa de estoque no lançamento do item;
- fechamento à vista ou como conta a receber;
- integração das vendas ao fluxo financeiro existente;
- cancelamento de comandas com estorno automático do estoque e do financeiro;
- indicadores de custo armazenado, estoque baixo e comandas abertas;
- interface responsiva e persistência equivalente em memória e PostgreSQL;
- cobertura integrada do fluxo de venda, pagamento, cancelamento e estorno.

A partir do incremento 21, a tela de estoque e comandas foi retirada da interface; as regras continuam disponíveis na API.

## Incremento 19 — Edição de clientes e reagendamento individual

Concluído:

- edição dos dados cadastrais do cliente sem alterar seu número de prontuário;
- proteção contra CPF duplicado na clínica, inclusive no PostgreSQL;
- reagendamento individual de atendimentos agendados ou confirmados, com troca de profissional e sala;
- prevenção de conflitos com atendimentos, bloqueios e encontros de turmas;
- registro imutável do horário, profissional e sala anteriores e novos, com operador e data;
- interface de edição, reagendamento e consulta do histórico na agenda;
- testes dos fluxos em memória, PostgreSQL e interface web.

Os relatórios já incluem uma DRE gerencial básica, rentabilidade por serviço/produto e indicadores operacionais. A classificação gerencial detalhada prevista no plano funcional ainda precisa ser conciliada com dados reais da clínica.

## Incremento 20 — Vendas mensais e retorno dos clientes

Concluído:

- livro de movimentos rastreáveis de planos criados, itens de comandas fechadas e cancelamentos;
- cancelamento de plano limitado ao valor das parcelas ainda abertas, preservado no registro do plano;
- pagamentos e estornos apresentados pela data dos eventos financeiros;
- comparação do mês em andamento com os mesmos dias do mês anterior;
- clientes distintos com atendimento concluído no mês anterior e sem atendimento concluído no mês selecionado;
- resumo de vendas, recebimentos e retorno na página inicial de gestão;
- planilha XLSX com resumo, movimentos de vendas, recebimentos, clientes sem retorno e definições;
- leitura do PostgreSQL com snapshot único para o relatório mensal;
- testes de períodos, estornos, cancelamento parcial, planilha e interface.

Limites atuais: o relatório detalhado cobre vendas, recebimentos e retorno, não todos os módulos do CRM. A migração dos dados anteriores ainda precisa preencher os eventos financeiros de origem. Cancelamentos antigos de planos recebem uma data estimada a partir da última atualização no banco. A exportação Excel de dados clínicos deve seguir permissões próprias e permanece fora deste relatório gerencial.

## Incremento 21 — Clientes, turmas na agenda e cenários de demonstração

Concluído:

- "Paciente" passa a ser "Cliente" na interface, nas mensagens da API e na documentação;
- número de WhatsApp opcional, separado do telefone de contato; em branco, as mensagens usam o telefone;
- telefones formatados no padrão brasileiro e contato de emergência agrupado com nome e telefone;
- filtros de clientes por situação, etiquetas e dados do cadastro;
- horários fixos semanais nas turmas, com reserva automática na agenda;
- atendimentos e turmas listados juntos, em ordem cronológica;
- turmas nomeadas no formato "<Serviço> Turma <X>";
- cenários de demonstração com planos, parcelas, atendimentos e uma turma de dançaterapia;
- API resiliente ao encerramento de conexões pelo PostgreSQL e CORS liberado para PUT, PATCH e DELETE;
- migrações 0021 a 0026 e testes equivalentes em memória, PostgreSQL e interface.

A seção de encontros e frequência saiu da aba Turmas; as aulas passam a ser acompanhadas pela agenda.

## Incremento 22 — Renovação de planos

Concluído:

- renovação manual de qualquer plano não cancelado, com nome, sessões, valor, parcelas e datas ajustáveis;
- sugestão automática do período seguinte: meses inteiros seguem por meses, os demais repetem a mesma quantidade de dias, e o primeiro vencimento mantém a distância do início;
- renovação automática, ligada por padrão nos planos recorrentes e configurável em cada plano com fim de validade;
- geração do período seguinte ao abrir planos, financeiro ou painel, recuperando períodos perdidos;
- sessões restantes do período anterior não são transferidas e expiram com ele;
- vínculo entre plano original e renovação, com no máximo uma renovação por plano, garantida no PostgreSQL;
- crédito de sessões e parcelas da renovação registrados no extrato e no financeiro;
- clientes inativos ou serviços desativados interrompem a renovação automática;
- testes de contratos, API em memória, PostgreSQL (opt-in) e interface.

## Incremento 23 — Central de relacionamento

Concluído:

- página "Contatos sugeridos" em `/relacionamento`, acessível a gestão, recepção e financeiro; o perfil de fisioterapeuta não tem acesso;
- filtro e contador por situação, considerando apenas clientes ativos;
- aniversário nos próximos 7 dias; quem nasceu em 29/02 é lembrado em 28/02 nos anos não bissextos;
- serviço avulso sem retorno há 60 dias;
- plano acabando nos próximos 7 dias, apenas sem renovação automática e ainda não renovado;
- saldo baixo, com até 2 sessões restantes, ignorando planos avulsos;
- plano vencido com saldo, até 60 dias após o vencimento;
- tratamento interrompido: 30 dias sem atendimento concluído e nada agendado;
- faltas repetidas: 2 faltas em 30 dias;
- ex-cliente: plano cancelado entre 30 e 90 dias atrás e sem plano ativo;
- parcela vencida, com um aviso por cliente, visível apenas para gestão e financeiro;
- prazos e mensagens-modelo configuráveis em **Configurações** > "Prazos e mensagens": a gestão edita, recepção e financeiro veem em modo leitura;
- botão WhatsApp que abre o wa.me com a mensagem-modelo, usando o WhatsApp do cadastro ou, na falta dele, o telefone; `{{nome}}` é substituído pelo primeiro nome;
- "Registrar contato" com resultado (contatado, sem resposta, agendou, sem interesse, adiado ou descartado), observação e "Adiar até";
- supressão: um contato registrado para a mesma situação e referência esconde a sugestão; o adiamento a esconde até a data escolhida, inclusive;
- cartão "Aniversariantes" no painel para gestão, recepção e financeiro, com "Dar parabéns" e "Marcar como enviado", uma vez por ano;
- aba "Aniversários do mês" com seletor de mês, idade que o cliente completa e indicação de parabéns enviado;
- testes de contratos, API em memória, PostgreSQL (opt-in) e interface.

Limites atuais: nenhuma mensagem é enviada automaticamente; a recepção abre cada contato no WhatsApp. As regras são recalculadas a cada abertura da página. As consultas no PostgreSQL ainda não passaram por teste de integração executado, pois o ambiente não tem `TEST_DATABASE_URL`.

## Incremento 24 — CREFITO do profissional

Concluído:

- CREFITO do profissional exibido ao lado do nome na lista de prontuários, na evolução e no resumo para impressão;
- emissão de contrato com profissional opcional, validado na clínica e recusado com 404 quando inválido;
- variáveis `{{profissional_nome}}` e `{{profissional_crefito}}` nos modelos, vazias quando o contrato não tem profissional;
- profissional guardado no documento emitido, preservando o snapshot imutável (coluna criada pela migração 0029 e recriada pela 0038, depois da remoção e da volta do módulo como Contratos);
- testes de contratos, API em memória, PostgreSQL (opt-in) e interface.

## Incremento 25 — Pesquisa de satisfação (NPS)

Concluído:

- pesquisa de satisfação com nota de 0 a 10 e comentário de até 1000 caracteres, guardada pela migração 0030;
- atendimento opcional, que precisa ser do mesmo cliente e estar concluído, com uma pesquisa por atendimento (409 na repetição);
- registro e consulta pela API disponíveis para todos os perfis;
- botão "Registrar satisfação" no atendimento concluído da agenda;
- cartão "Satisfação (NPS)" em **Relatórios**, acessível a gestão e financeiro, com período padrão do início do mês até hoje;
- NPS calculado como percentual de promotores (9 e 10) menos percentual de detratores (0 a 6), arredondado, e exibido como "—" sem respostas;
- detratores dos últimos 30 dias aparecem na Central de relacionamento na situação "Avaliação baixa", uma por cliente, considerando a avaliação mais recente;
- testes de contratos, API em memória, PostgreSQL (opt-in) e interface.

## Incremento 26 — Histórico do cliente

Concluído:

- rota `GET /patients/:id/timeline`, acessível a gestão, recepção e financeiro; o perfil de fisioterapeuta não tem acesso;
- linha do tempo com atendimentos sem conteúdo clínico, planos criados, renovados e cancelados, pagamentos e estornos, contatos registrados, mensagens e pesquisas de satisfação;
- seção "Histórico" na ficha do cliente, com filtro por grupo;
- testes de API em memória, PostgreSQL (opt-in) e interface.

## Incremento 27 — Importação de clientes

Concluído:

- botão "Importar" em **Clientes**, disponível para gestão, recepção e financeiro;
- leitura de CSV separado por `;` ou `,`, com aspas e BOM, em UTF-8 ou Windows-1252 do Excel detectado automaticamente, ou de XLSX pela primeira aba, com até 2 MB;
- cabeçalhos reconhecidos sem depender de acentos ou maiúsculas: nome, CPF, telefone, WhatsApp, e-mail, nascimento (dd/mm/aaaa ou aaaa-mm-dd), etiquetas e observações;
- prévia linha a linha indicando válida, com erro ou duplicada por CPF ou telefone, contra a base ou dentro do próprio arquivo;
- importação que analisa o arquivo novamente no servidor e grava as linhas válidas numa única transação, ignorando as duplicadas;
- CSV modelo para download;
- testes de leitura e validação, API em memória, PostgreSQL (opt-in) e interface.

Limites atuais: a importação cobre apenas o cadastro de clientes; planos, saldos de sessões e lançamentos financeiros do sistema anterior ficam fora. Os testes de integração PostgreSQL dos incrementos 24 a 27 existem, mas não foram executados, pois o ambiente não tem `TEST_DATABASE_URL`.

## Incremento 28 — Padrões de design

Concluído:

- respiro lateral padrão de 23px em todos os filhos diretos de `.panel`, que não tem padding próprio;
- escala de espaçamento `--space-1` a `--space-8` (4 a 64px) e raios `--radius-sm/md/lg` (8, 12 e 18px);
- `.secondary-button` com ícone e texto alinhados, como o `.primary-button`;
- grids de várias colunas reduzidos a uma coluna até 700px; lista de clientes em cartões no celular;
- correções da revisão visual: tela de login, espaçamento do painel de vendas, métricas de vendas e painéis de Configurações;
- verificação automática `node apps/web/scripts/audit-panels.cjs` (filhos de painel sem respiro, cartões colados na borda e grids sem regra para celular; exceções só com `/* audit: mobile-ok <motivo> */`);
- regras de design registradas no processo de desenvolvimento.

## Incremento 29 — Feriados

Concluído:

- feriados por clínica e data, únicos por dia, guardados pela migração 0031;
- consulta para todos os perfis; cadastro e exclusão só pela gestão, na seção "Feriados" de **Configurações**;
- criar atendimento, criar série recorrente ou reagendar para um feriado é recusado com 409 e o nome do feriado; na série, nenhuma ocorrência é criada;
- agenda diária, semanal e mensal marca o feriado com o nome e mostra o erro em linguagem clara;
- testes de API em memória, PostgreSQL (opt-in) e interface.

## Incremento 30 — Experimental e avaliação de leads

Concluído:

- tipo de atendimento regular, experimental ou avaliação (migração 0032), preservado na criação, recorrência e reagendamento;
- agendamento de experimental ou avaliação para lead sem convertê-lo, com "Agendar experimental" no detalhe do lead aberto (migração 0033: atendimento é de cliente ou de lead);
- prontuário e pesquisa de satisfação recusados em atendimento de lead;
- a conversão do lead leva os atendimentos para o cliente criado ou reaproveitado;
- selo "Experimental" ou "Avaliação" (com "· lead" antes da conversão) na agenda e no detalhe do atendimento;
- relatório gerencial com atendimentos por tipo e cartão "Experimentais": agendadas, concluídas, convertidas (plano criado em até 30 dias após a aula) e taxa de conversão;
- testes de contratos, API em memória, PostgreSQL (opt-in) e interface.

## Incremento 31 — Declaração de comparecimento pela agenda (removida)

Implementada a emissão da declaração de comparecimento a partir de um atendimento concluído na agenda (migração 0034). Em 1º de outubro de 2026 foi removida junto com o módulo Documentos (migração 0036). A emissão da declaração pela agenda não voltou; em Contratos, "Declaração de comparecimento" segue disponível como tipo de modelo.

## Incremento 32 — Botão SOS

Concluído:

- botão SOS no detalhe do atendimento de cliente e na ficha do cliente;
- painel com o nome e o telefone do contato de emergência do cadastro, com ligação e WhatsApp, e atalhos para SAMU (192) e Bombeiros (193);
- teste de interface.

## Incremento 33 — Despesas fixas recorrentes

Concluído:

- despesas fixas com descrição, valor, dia de vencimento, categoria, centro de custo e meses de início e fim (migração 0035);
- conta a pagar gerada uma vez por competência, garantida por índice único, ao abrir o financeiro ou a previsão;
- pausa sem gerar contas; a reativação retoma no mês atual, sem lançar os meses pausados;
- seção na aba de contas a pagar do **Financeiro** para cadastrar, pausar, reativar e encerrar;
- exclusão recusada com 409 quando a despesa já gerou contas;
- testes de contratos, API em memória, PostgreSQL (opt-in) e interface.

## Incremento 34 — Caixa do dia

Concluído:

- aba "Caixa do dia" no **Financeiro**, para gestão e financeiro, com seletor de data;
- totais por forma de pagamento ("Não informada" quando não há), entradas, saídas e saldo do dia;
- movimentos em ordem cronológica: recebimentos, estornos, contas pagas e comissões pagas, pela data da clínica;
- testes de API em memória, PostgreSQL (opt-in) e interface.

## Incremento 35 — Previsão de receitas e despesas

Concluído:

- aba "Previsão" no **Financeiro** com horizonte de 3, 6 ou 12 meses a partir do mês atual;
- valores confirmados (parcelas e contas a pagar em aberto) e projetados (renovações automáticas de planos e despesas fixas ainda não lançadas), com saldo por mês e total;
- valores vencidos antes do mês atual mostrados à parte, fora dos saldos;
- comissões fora da previsão;
- divisão das parcelas de plano unificada num helper compartilhado;
- testes de contratos, API em memória, PostgreSQL (opt-in) e interface.

## Incremento 36 — Marca Studios Aryana

Concluído:

- o produto passa a se chamar "Studios Aryana" no logo, no topo, na tela de login, no título da aba e na planilha de vendas;
- clínica "Studios Aryana" (razão social "Studios Aryana Ltda.") e gestora "Aryana Dutra" no seed e no modo memória; o login de demonstração continua `admin@movimenta.local`;
- migração 0037 atualiza os nomes nos bancos já existentes.

## Incremento 37 — Contratos

Concluído:

- volta do módulo de modelos versionados e documentos emitidos como **Contratos**, em `/contratos` (gestão, recepção e financeiro; `/documentos` redireciona);
- tabelas recriadas vazias pela migração 0038, com profissional opcional e variáveis de nome e CREFITO;
- nova versão do modelo em janela própria, preservando quebras de linha; cancelamento com confirmação;
- impressão do contrato emitido;
- sem a emissão da declaração pela agenda;
- testes de API em memória, PostgreSQL (opt-in) e interface.

## Incremento 38 — Exportação da base de clientes

Concluído:

- botão "Exportar" em **Clientes**, só para a gestão, com CSV (UTF-8 com BOM, separado por `;`) ou Excel;
- escolha entre 13 colunas, sempre na mesma ordem;
- filtros da tela aplicados: busca, situação, etiquetas, aniversariantes do mês e plano ativo; filtros de e-mail e ordenação avisados como não aplicados;
- arquivo `clientes-AAAA-MM-DD` e registro da exportação na auditoria administrativa;
- testes de API em memória, PostgreSQL (opt-in) e interface.

Limite atual: o CSV não neutraliza células iniciadas por `=`, `+`, `-` ou `@`.

## Incremento 39 — Paginação de clientes e modais

Concluído:

- lista de **Clientes** paginada em 20 por página, com "Anterior", "Próxima" e contagem; busca e filtros voltam à primeira página;
- modais sem desfoque do fundo e sem rolar a página de trás enquanto estão abertos;
- testes de interface.

## Incremento 40 — Retenção e cancelamentos

Concluído:

- relatório mês a mês, para gestão e financeiro, com clientes ativos, novos e perdidos, taxa de retenção, planos cancelados e valor cancelado;
- período padrão dos últimos 6 meses, limitado a 24 meses;
- tabela com totais no bloco de indicadores de **Relatórios**;
- testes de API em memória, PostgreSQL (opt-in) e interface.

## Incremento 41 — Rankings e faixa etária

Concluído:

- os 20 clientes com mais sessões concluídas e os 20 com mais recebimentos no período (pagamentos menos estornos);
- distribuição dos clientes ativos por faixa etária: 0–17, 18–29, 30–44, 45–59, 60+ e sem data de nascimento;
- cartões em **Relatórios**, cada um com carregamento, vazio e erro próprios;
- testes de API em memória, PostgreSQL (opt-in) e interface.

## Incremento 42 — Comunicado segmentado

Concluído:

- painel "Comunicado segmentado" em **Comunicações** para gestão, recepção e financeiro;
- segmento por etiquetas, situação, plano ativo e aniversariantes do mês, por WhatsApp ou e-mail, com texto de até 500 caracteres;
- prévia com clientes do segmento, enfileirados e pulados por opt-out, falta de destino ou mensagem longa, além de um exemplo;
- enfileiramento com confirmação na outbox: as mensagens **não são enviadas**, ficam aguardando um provedor (modo `outbox_only`);
- testes de contratos, API em memória, PostgreSQL (opt-in) e interface.

Limite atual: os testes de integração PostgreSQL dos incrementos 41 e 42 existem, mas não foram executados nesta máquina, que não tem `TEST_DATABASE_URL`.

## Próximo incremento de desenvolvimento autônomo

Conciliação dos cálculos financeiros com casos reais da clínica e preparação da importação validada dos dados do sistema anterior, inclusive seu modelo de planilha.

O aplicativo e o portal do cliente permanecem fora do escopo.
