# Status da implementação

Atualizado em 28 de setembro de 2026.

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

## Próximo incremento de desenvolvimento autônomo

Conciliação dos cálculos financeiros com casos reais da clínica e preparação da importação validada dos dados do sistema anterior, inclusive seu modelo de planilha.

O aplicativo e o portal do cliente permanecem fora do escopo.
