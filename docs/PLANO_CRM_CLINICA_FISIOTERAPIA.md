# CRM sob medida para clínica de fisioterapia

## 1. Resumo executivo

O SeuFisio não é apenas um CRM comercial. Ele reúne cadastro e relacionamento com pacientes, agenda, prontuário fisioterapêutico, venda de serviços e pacotes, financeiro, documentos, estoque, relatórios, comunicação e integrações. A substituição segura precisa preservar as ligações entre esses domínios: um plano vendido gera agenda e contas a receber; o status do atendimento consome sessões, alimenta frequência, comissão e relatórios; a evolução clínica fica vinculada ao atendimento e ao profissional.

Este levantamento cobre a página comercial e o índice completo da central oficial de ajuda disponível publicamente. Ele é amplo, mas não deve ser confundido com engenharia reversa da conta da cliente: campos específicos, permissões efetivamente usadas, regras internas e possíveis recursos não documentados precisam ser confirmados em uma sessão acompanhada dentro do ambiente dela.

Recomendação: construir primeiro um núcleo operacional sob medida — pacientes, agenda, prontuário, planos/pacotes e financeiro — e só depois acrescentar CRM comercial, relatórios avançados e integrações. Não se recomenda copiar telas ou código do concorrente; a meta é reproduzir capacidades de negócio necessárias com experiência e arquitetura próprias.

Uma equipe de 3 a 4 pessoas consegue, como estimativa inicial, entregar um MVP operacional em 12 a 16 semanas e a paridade web relevante em 24 a 32 semanas. O prazo só deve virar compromisso após a descoberta com a cliente, a inspeção dos dados exportáveis e a escolha de pagamentos, NFSe e WhatsApp.

## 2. Escopo adotado

### Dentro do escopo

- Sistema web responsivo para gestão, recepção e profissionais.
- Páginas públicas por link para pré-cadastro/cadastro, agendamento, formulários clínicos, pagamento, assinatura de contrato e pesquisa de satisfação.
- Todos os módulos administrativos e clínicos descritos neste relatório.
- Migração dos dados históricos que o SeuFisio permitir exportar legitimamente.
- Segurança, auditoria, backups e requisitos mínimos de LGPD e prontuário eletrônico.

### Canais digitais incluídos

O produto será web e responsivo. Permanecem no plano as páginas públicas por link para cadastro, agendamento online, compra de serviço/pacote, pagamento, ficha de anamnese, assinatura de contrato e NPS. Check-in facial em navegador/tablet e catraca são opcionais, pois adicionam custo, biometria e risco de privacidade.

## 3. Inventário funcional do SeuFisio

### 3.1 Organização da clínica e acessos

- Cadastro da clínica como pessoa física ou jurídica, razão social, documentos, contatos e logotipo.
- Definições gerais de funcionamento da unidade.
- Usuários administrativos e profissionais; ativação, desativação e indicação de quem realiza atendimentos.
- Três perfis de permissão predefinidos, com possibilidade de editar e criar perfis próprios.
- Agendas por profissional e logins administrativos conforme o plano contratado.
- Encerramento de todas as sessões ativas em todos os dispositivos.
- Cadastro de profissionais com dados para atendimento; no produto substituto, incluir obrigatoriamente identificação profissional e CREFITO.
- Auditoria documentada para mesclagem de pacientes e reconhecimento facial. Para o novo sistema, a auditoria deve ser abrangente.

Fonte funcional: [configurações](https://tutoriais.seufisio.com/menu-configuracoes), [usuários](https://tutoriais.seufisio.com/menu-configuracoes/adicionando-usuarios-ao-sistema) e [segurança de sessões](https://tutoriais.seufisio.com/seguranca-e-acesso).

### 3.2 Pacientes e relacionamento

- Tipos de cadastro: cliente fixo, rotativo e prospecção/lead.
- Cadastro completo de dados pessoais, contato, endereço, documentos, profissão, responsável, contato de emergência, dados de cobrança, observações e autorização de uso de imagem.
- Cadastro manual ou por link: pré-cadastro e cadastro completo preenchido pela própria pessoa.
- Busca por nome, matrícula, e-mail, documento/CPF, telefone e etiquetas.
- Visões de ativos, sem plano ativo, com faturas abertas, renovações próximas, com reposições, lista de espera e inativos.
- Edição, ativação/inativação e inativação em lote de pacientes antigos com base no último atendimento.
- Mesclagem de cadastros duplicados, preservando atendimentos, prontuários, avaliações e financeiro, com registro de auditoria.
- Interesses/objetivos do paciente.
- Etiquetas personalizáveis por nome e cor; múltiplas etiquetas por paciente; filtros e segmentação.
- Lista de espera por horário ou turma indisponível.
- Lembretes e tarefas internas vinculados ao acompanhamento.
- Resumo individual integrado: dados cadastrais, agenda, presença, vendas/planos, financeiro, contratos, avaliações, prontuários, anexos e atestados.
- Botão SOS com acesso ao contato de emergência e atalhos para 190, 192 e 193.

Fonte funcional: [menu Clientes](https://tutoriais.seufisio.com/menu-clientes), [gestão de clientes](https://tutoriais.seufisio.com/menu-clientes/gestao-de-clientes), [cadastro](https://tutoriais.seufisio.com/cadastrar-clientes), [interesses](https://tutoriais.seufisio.com/menu-clientes/interesses), [etiquetas](https://tutoriais.seufisio.com/menu-clientes/etiquetas) e [SOS](https://tutoriais.seufisio.com/menu-configuracoes/sos-botao-de-emergencia).

### 3.3 Agenda, grades, turmas e presença

- Agenda geral e agenda individual do profissional.
- Visualizações por profissional, sala, paciente, dia e semana.
- Cadastro de salas e controle de ocupação dos espaços.
- Cadastro de feriados que bloqueiam a agenda.
- Atendimento avulso, experimental ou avaliação, inclusive para lead ainda não efetivado.
- Destaque visual para experimental/avaliação e uso dessa informação nas análises gerenciais.
- Grade/turma vinculada a serviços, níveis, duração, sala e profissional.
- Capacidade/vagas por horário e controle automático de lotação.
- Replicação semanal da grade e operação com horários fixos ou rotativos/flexíveis.
- Agendamentos criados automaticamente por serviço recorrente ou pacote com horário fixo.
- Agendamento manual de sessões de pacote sem dia fixo.
- Status: aguardando chegar, finalizado, não compareceu, ausência justificada e ausência do profissional.
- Registro de presença, falta, frequência e check-in; efeito do status no consumo de pacote, reposições, comissão e estatísticas.
- Reagendamento/reposição após ausência justificada do paciente ou do profissional; seleção de novo profissional, data e horário.
- Limite de ausências justificadas/reposições configurável por plano.
- Lista de espera para vagas indisponíveis.
- Lembretes seletivos por tipo de atendimento e profissional.
- Agendamento online por link, com serviços expostos, nome público, preço opcional e marcação de serviço experimental.
- Compra de serviço avulso ou pacote pelo link, condicionada à integração de pagamento.
- Configuração de antecedência e prazo de cancelamento para os canais de booking.

Fonte funcional: [grades e turmas](https://tutoriais.seufisio.com/menu-clientes/grades-e-turmas), [agendamento online](https://tutoriais.seufisio.com/menu-configuracoes/agendamento-online), [atendimento experimental](https://tutoriais.seufisio.com/atendimento-experimental-avaliacao), [status](https://tutoriais.seufisio.com/status-dos-atendimentos) e [reposições](https://tutoriais.seufisio.com/status-dos-atendimentos/reagedamentos-reposicoes).

### 3.4 Prontuário, avaliações e conteúdo clínico

- Prontuário eletrônico por paciente.
- Fichas personalizáveis de avaliação/anamnese com construtor de campos, incluindo pelo menos resposta curta e longa, pré-visualização, publicação e histórico de múltiplas avaliações.
- Preenchimento da avaliação pela agenda ou pelo cadastro do paciente.
- Envio de link público seguro para o paciente preencher anamnese antes do atendimento.
- Evolução por atendimento com profissional responsável, data e ordem cronológica.
- Modelos de evolução em texto livre e modelos “clicáveis”/questionários.
- Consulta rápida das últimas evoluções diretamente na agenda.
- Exportação/impressão das evoluções por período em PDF.
- Anexos separados em exames e outros: imagens JPEG e documentos PDF/DOC; a descrição geral também menciona RX, ressonâncias, fotos, laudos e pareceres.
- Cadastros de aparelhos/acessórios e vínculo com evoluções/prontuário.
- Cadastro de exercícios e procedimentos, com nome, aparelho, nível, grupo muscular, descrição, foto e vídeo.
- Atestado de comparecimento padrão e modelos próprios com variáveis; seleção de tipo/modelo/profissional; edição, PDF e envio por e-mail.

Fonte funcional: [cadastros clínicos](https://tutoriais.seufisio.com/cadastros-clinicos), [avaliação/anamnese](https://tutoriais.seufisio.com/cadastros-clinicos/fichas-de-avaliacao-anamnese), [evoluções](https://tutoriais.seufisio.com/cadastros-clinicos/evolucoes-dos-atendimentos), [multimídias](https://tutoriais.seufisio.com/cadastros-clinicos/multimidias) e [atestados](https://tutoriais.seufisio.com/cadastros-gerais/atestados).

### 3.5 CRM comercial e marketing

- Cadastro manual de leads ou captura por link.
- Campos de lead: nome, telefone, origem/procedência, forma de contato, interesses e observações.
- Responsável pelo lead, etiquetas, tarefas e lembretes de retorno.
- Funil Kanban com arrastar e soltar.
- Etapas documentadas: aguardando contato, em contato, avaliação agendada, efetivado como cliente e não efetivado.
- Agendamento de avaliação/aula experimental diretamente ao mover o lead para a etapa correspondente.
- Conversão/efetivação do lead em paciente sem redigitação.
- Motivo estruturado de não efetivação.
- Filtros por responsável, nome, etiqueta e período de efetivação.
- Cadastros configuráveis de origem/procedência, formas de contato e motivos de não efetivação.
- Indicadores de contatos realizados, conversão entre experimental e perda e origem dos leads mais valiosos; a visão geral oficial também menciona leads gerados, conversões, tempo médio de resposta e canais eficazes.
- E-mails segmentados para pessoa específica, fixos, rotativos, leads ou toda a base; filtro por ativos/inativos, assunto, corpo e anexo.
- Pesquisa automática de satisfação ao fim de atendimento avulso ou da última sessão de pacote/recorrência; página pública com nota de 1 a 5 e comentário.
- Relatório de satisfação: total, comparação com período anterior, média, taxa de resposta, distribuição das notas e detalhe por atendimento, paciente, profissional e comentário.

Fonte funcional: [Marketing/CRM](https://tutoriais.seufisio.com/marketing-crm), [leads](https://tutoriais.seufisio.com/marketing-crm/prospeccoes-leads), [funil](https://tutoriais.seufisio.com/marketing-crm/funil-de-vendas), [métricas](https://tutoriais.seufisio.com/marketing-crm/indicadores-e-metricas), [comunicados](https://tutoriais.seufisio.com/marketing-crm/envios-e-comunicados) e [pesquisa de satisfação](https://tutoriais.seufisio.com/marketing-crm/pesquisa-de-satisfacao-nps).

### 3.6 Catálogo, vendas, planos e contratos

- Tabela de preços para serviços, planos e pacotes, com valores, modalidades e periodicidades.
- Atendimento avulso com cobrança própria.
- Serviço recorrente mensal, com ou sem término, horários fixos ou flexíveis, valor, vencimento, sala, profissional e limite de reposição.
- Pacote fixo/plano longo, à vista ou parcelado, periodicidade, vigência, agenda fixa, limite de faltas/reclassificações e geração simultânea de agenda e financeiro.
- Pacote personalizado com quantidade de sessões, valor, validade e dias fixos ou livres.
- Pacote personalizado de múltiplos serviços, com limite individual por modalidade e consumo conforme atendimentos realizados.
- Venda proporcional para início no meio do mês e continuidade em recorrência/pacote fixo.
- Comanda/combo: vários serviços do mesmo paciente no mesmo dia, horários automáticos opcionais e uma cobrança consolidada.
- Inclusão de produtos na comanda, com baixa de estoque, rateio por serviços/produtos, bloqueio após cobrança e reversão consistente no cancelamento.
- Cobrança manual à vista ou parcelada; integração com link, Pix, boleto e cartão.
- Geração de contrato no fechamento da venda.
- Modelos de contrato/termos com variáveis automáticas.
- Contrato vinculado ou não a serviço/plano/pacote, preenchendo nome do plano, valor, pagamento e vigência.
- Envio por e-mail/WhatsApp, link público, aceite e assinatura desenhada, status assinado, reenvio e relatório de contratos.

Fonte funcional: [tabela de preços](https://tutoriais.seufisio.com/cadastros-gerais/tabela-de-precos), [pacote fixo](https://tutoriais.seufisio.com/venda-pacote-fixo-planos-longos), [serviço recorrente](https://tutoriais.seufisio.com/servico-recorrente-mensais), [pacote personalizado](https://tutoriais.seufisio.com/pacote-personalizado), [múltiplos serviços](https://tutoriais.seufisio.com/pacote-personalizado-multiplos-servicos), [comanda](https://tutoriais.seufisio.com/comanda-combo-de-servicos-com-venda-de-produtos) e [contratos](https://tutoriais.seufisio.com/cadastros-gerais/contratos/enviando-o-contrato).

### 3.7 Financeiro e fiscal

- Contas a receber geradas por avulsos, planos, pacotes, comandas e produtos, além de lançamento manual.
- Baixa/quitação com data, forma de pagamento e observação.
- Datas distintas de lançamento/competência, vencimento, pagamento e recebimento/caixa.
- Situações aberta, paga, vencida e falha de cobrança; indicador de NFSe gerada.
- Filtros por paciente, pagamento, centro de custo, origem da conta, tipo de data, períodos rápidos/personalizados e ordenação.
- Emissão de recibos.
- Contas a pagar, fornecedores, categorias, centro de custo, vencimento, pagamento e observações.
- Despesas fixas recorrentes com geração automática mensal e despesas variáveis.
- Fluxo de caixa por data efetiva de recebimento/pagamento.
- Caixa diário e demonstrativo financeiro consolidado.
- Vendas gerais de produtos, pacotes, planos e serviços.
- Simulador de receitas futuras baseado em pacientes fixos e planos/pacotes ativos.
- Comissão por profissional e serviço, em valor fixo ou percentual; filtros por período e status; gravação do total em contas a pagar.
- Centros de custo para setores/unidades e análise segmentada.
- DRE gerencial por competência, mensal, trimestral, anual ou período de até 12 meses, filtrável por centro de custo.
- DRE com receita bruta, impostos, receita líquida, custos diretos/CSP, custos variáveis, lucro bruto, despesas operacionais, resultado operacional, depreciação, resultado financeiro e lucro/prejuízo.
- NFSe com cadastro fiscal da clínica, município/regime tributário, código e descrição do serviço, emissão sobre contas pagas ou abertas e envio automático por e-mail.
- Separação, na comanda, entre valor de serviços e produtos para a NFSe de serviços.
- Cobrança automática no cartão tokenizado, boleto/Pix recorrente e link mensal de cartão.
- Notificações de cobrança por WhatsApp, e-mail e SMS.
- Saldo e antecipação de recebíveis, se oferecidos pelo provedor de pagamento escolhido.

Fonte funcional: [Financeiro](https://tutoriais.seufisio.com/financeiro), [contas a receber](https://tutoriais.seufisio.com/financeiro/contas-a-receber), [contas a pagar](https://tutoriais.seufisio.com/financeiro/contas-a-pagar), [comissões](https://tutoriais.seufisio.com/financeiro/comissionamento-de-profissionais), [DRE](https://tutoriais.seufisio.com/financeiro/dre-gerencial-demonstrativo-de-resultados-do-exercicio), [NFSe](https://tutoriais.seufisio.com/financeiro/emissao-de-notas-fiscais-nfse-no-seufisio) e [cobranças automáticas](https://tutoriais.seufisio.com/servico-recorrente-mensais/cobrancas-automaticas).

### 3.8 Produtos e estoque

- Categorias e subcategorias.
- Marcas.
- Cadastro de produtos, preço e estoque.
- Venda de um ou vários produtos, paciente, responsável e centro de custo.
- Cobrança manual ou digital.
- Baixa automática e estorno de estoque em cancelamento.
- Venda avulsa ou integrada à comanda.
- Relatório com produtos, pacientes, valores e faturamento.

Fonte funcional: [Produtos](https://tutoriais.seufisio.com/produtos) e [relatório de vendas](https://tutoriais.seufisio.com/relatorios/relatorio-de-vendas-de-produtos).

### 3.9 Relatórios e painéis

- Aniversariantes por período.
- Base de pacientes com filtros por cadastro, perfil, endereço, plano, datas, idade, interesses, etiquetas, contrato e situação; escolha dinâmica de colunas e exportação.
- Planos fixos/recorrentes por paciente, situação, gênero, cobrança automática, plano, periodicidade, profissional, tipo de venda, pausados e sem venda ativa.
- Indicadores mensais de pacientes fixos e rotativos; rankings dos 20 mais ativos e mais valiosos de cada tipo.
- Indicadores anuais de novos e inativados, comparação anual, ticket médio mensal/anual, rankings e faixa etária.
- Dashboard demográfico por gênero, idade média, faixa etária, bairro e cidade.
- Relatório de leads com filtros de estágio, origem, contato, perda, indicação, idade e período.
- Retenções e cancelamentos.
- Análises gerenciais.
- Taxa de ocupação da agenda.
- Comissionamento de profissionais.
- Relatórios financeiros.
- Vendas de produtos.
- Gestão/status de contratos.
- Aparelhos utilizados nos atendimentos/prontuários.
- NPS/satisfação e CRM comercial.

Fonte funcional: [índice de relatórios](https://tutoriais.seufisio.com/relatorios), [clientes — geral](https://tutoriais.seufisio.com/relatorios/clientes/aba-geral), [mês](https://tutoriais.seufisio.com/relatorios/clientes/aba-mes), [ano](https://tutoriais.seufisio.com/relatorios/clientes/aba-ano), [dashboard](https://tutoriais.seufisio.com/relatorios/clientes/aba-dashboard) e [leads](https://tutoriais.seufisio.com/relatorios/clientes/aba-prospeccoes-leads).

### 3.10 Comunicação e integrações

- E-mail transacional, lembretes e comunicados segmentados, com anexos.
- SMS por créditos, lembrete automático um ou dois dias antes e seleção por atendimento/profissional.
- WhatsApp centralizado e lembretes automáticos. O SeuFisio documenta uma conexão não oficial baseada no WhatsApp Web; no novo produto deve-se adotar API oficial, templates aprovados, consentimento/opt-out e limites do provedor, não imitar esse mecanismo frágil.
- Gateway de pagamentos com onboarding/KYC, Pix, boleto, cartão, recorrência, links, webhooks, conciliação e antecipação opcional.
- Integração NFSe dependente do município/provedor fiscal.
- Wellhub: configuração da unidade, booking em grades/turmas, prazos, agendamento e check-in.
- TotalPass: API key, profissional/sala/plano de repasse, booking, limites e repasses.
- Check-in facial em navegador/tablet: cadastro/atualização/exclusão de face, auditoria de tentativas, validação de agenda/pendência e foto opcional do evento.
- Catraca física FIT4 TOPDATA e leitor facial, com bloqueio opcional por ausência de atendimento ou inadimplência.
- O próprio FAQ do SeuFisio informa que não há API aberta para chatbots/agentes. Isso torna a exportação e a migração um risco a validar cedo.

Fonte funcional: [WhatsApp](https://tutoriais.seufisio.com/integracao-whatsapp), [SeuFisio Pay](https://tutoriais.seufisio.com/menu-configuracoes/ativando-o-seufisio-pay), [Wellhub](https://tutoriais.seufisio.com/integracao-wellhub), [TotalPass](https://tutoriais.seufisio.com/integracao-totalpass), [check-in facial](https://tutoriais.seufisio.com/check-in-facial), [catraca](https://tutoriais.seufisio.com/manual-de-instalacao-e-configuracao-catraca-e-leitor-facial) e [FAQ/API](https://tutoriais.seufisio.com/faq-duvidas-frequentes).

## 4. O que construir para esta cliente

### P0 — indispensável para trocar de sistema

1. Login, perfis e permissões; profissionais e salas.
2. Pacientes, responsáveis, contatos, documentos, etiquetas e pesquisa.
3. Agenda diária/semanal por profissional/sala, recorrência, conflitos, status, faltas e reposições.
4. Serviços, avulsos, planos recorrentes, pacotes por sessões e consumo de saldo.
5. Prontuário com avaliação/anamnese, evolução por sessão, anexos e PDF.
6. Contas a receber/pagar, baixa, vencimentos, fluxo de caixa, recibo e inadimplência.
7. Importação validada de pacientes, agenda futura, planos ativos, saldos, financeiro aberto e prontuários.
8. Auditoria, backups testados, exportação completa e controles de LGPD.

### P1 — paridade web recomendada

1. Links públicos de cadastro, anamnese, agendamento e pagamento.
2. Contratos e termos com assinatura eletrônica.
3. CRM de leads, funil, tarefas, origens e conversão.
4. Comissões, centros de custo, dashboards e relatórios/exportações.
5. Lembretes por e-mail e WhatsApp oficial; cobrança automática.
6. Atestados, modelos clínicos avançados e NPS.
7. NFSe, se a cliente realmente emite pelo SeuFisio hoje.

### P2 — somente após validação de uso e retorno

1. Produtos, estoque e comandas complexas.
2. Wellhub e TotalPass.
3. Cadastro de exercícios/procedimentos, se usado pela clínica.
4. Check-in facial e catraca — demandam hardware, biometria, consentimento específico e avaliação de impacto.
5. DRE avançada, simulador de receita e análises demográficas.

## 5. Plano de desenvolvimento

### Fase 0 — descoberta e redução de risco (2 semanas)

- Entrevistar proprietária, recepção, fisioterapeutas e financeiro.
- Gravar, com autorização, a execução de um dia real: cadastro, venda, agenda, atendimento/evolução, cobrança e fechamento.
- Marcar cada item do inventário como “usa hoje”, “precisa melhorar”, “não usa” ou “desconhece”.
- Levantar profissionais, salas, modalidades, convênios, volume mensal, recorrências, regras de falta/reposição, comissões e relatórios críticos.
- Solicitar ao SeuFisio todos os meios oficiais de exportação e uma cópia de teste: CSV/XLSX, PDFs, anexos e contratos.
- Definir provedores de pagamento, WhatsApp oficial, e-mail/SMS e NFSe.
- Produzir protótipo dos cinco fluxos críticos e critérios de aceite.

**Saída:** matriz fit-gap aprovada, mapa de dados, protótipo, backlog priorizado e estimativa revisada.

### Fase 1 — fundação técnica (2 semanas)

- Ambientes de desenvolvimento, homologação e produção.
- Autenticação, recuperação de senha, MFA para administradores e sessões revogáveis.
- Perfis/permissões, unidade, profissionais, CREFITO, salas, serviços e feriados.
- Banco, armazenamento de anexos, fila de tarefas, e-mail, observabilidade e trilha de auditoria.
- CI/CD, backups automáticos e primeiro teste de restauração.

### Fase 2 — pacientes e agenda (4 semanas)

- Pacientes, responsáveis, emergência, cobrança, etiquetas, interesses, busca e duplicidade.
- Agendas por profissional/sala, visões diária/semanal, bloqueios, conflitos e capacidade.
- Avulsos, recorrência, turma/grade, status, faltas e reposições.
- Lista de espera e lembretes internos.
- Testes de concorrência para impedir dupla reserva e excesso de vagas.

### Fase 3 — prontuário e documentos clínicos (4 semanas)

- Construtor versionado de avaliação/anamnese.
- Evolução por atendimento com autoria, data, CREFITO, bloqueio de alteração silenciosa e adendo/correção auditável.
- Linha do tempo, anexos com antivírus, exportação PDF e acesso do titular.
- Modelos de atestado e termos; links públicos protegidos por token e expiração.
- Regras de sigilo por profissional, unidade e função.

### Fase 4 — vendas, planos e financeiro básico (4 semanas)

- Tabela de preços, avulsos, serviços recorrentes, pacotes fixos e personalizados.
- Agenda e contas geradas de forma transacional; saldo e validade de sessões.
- Contas a receber/pagar, parcelas, baixas, categorias, fornecedor, centro de custo, recibos e caixa.
- Inadimplência, renovação e visão financeira do paciente.
- Migração-piloto repetível e relatório de reconciliação.

**Marco:** MVP homologável em aproximadamente 12–16 semanas, dependendo da composição da equipe e qualidade da exportação.

### Fase 5 — operação digital e comercial (4 semanas)

- Pré-cadastro/cadastro e agendamento público responsivo.
- CRM de leads Kanban, tarefas, origem, perda, conversão e métricas.
- Gateway de pagamento com cartão tokenizado no provedor, Pix/boleto/link e webhooks idempotentes.
- Contratos com versão imutável, evidências de aceite, assinatura e reenvio.
- E-mail e WhatsApp oficial; consentimento, templates, opt-out e histórico de entrega.
- NPS por link web enviado por e-mail.

### Fase 6 — gestão avançada e integrações (4–8 semanas)

- Comissão, relatórios operacionais, ocupação, retenção, vendas e exportações.
- DRE por competência e centros de custo.
- NFSe para o município da cliente, com tratamento de rejeição e reprocessamento.
- Produtos, estoque e comanda, se aprovados no fit-gap.
- Wellhub/TotalPass somente se houver acesso às APIs/parceria e uso real.
- Check-in facial/catraca em projeto separado, após avaliação jurídica e de segurança.

### Fase 7 — migração e corte (2 semanas, parcialmente paralela)

- Executar duas migrações simuladas e reconciliar contagens, totais e amostras clínicas.
- Treinar recepção, profissionais e financeiro por função.
- Congelar alterações no legado em janela combinada, exportar delta final e importar.
- Operação assistida por 5 a 10 dias úteis; evitar dupla escrituração longa, que cria divergência.
- Manter o legado em acesso somente leitura enquanto contrato e obrigações permitirem; preservar exportação integral e evidência da migração.

## 6. Arquitetura recomendada

Para uma única clínica, começar como monólito modular é mais econômico e simples de operar do que microsserviços.

- **Frontend:** aplicação web responsiva em React/Next.js, com páginas públicas isoladas do painel autenticado.
- **Backend:** API modular TypeScript (NestJS ou equivalente), com validação e autorização centralizadas.
- **Dados:** PostgreSQL; transações para venda → agenda → financeiro; histórico e exclusão lógica onde apropriado.
- **Arquivos:** armazenamento S3 compatível com criptografia, URLs temporárias e varredura antimalware.
- **Filas:** Redis/BullMQ ou serviço gerenciado para lembretes, webhooks, geração de PDFs, NFSe e e-mails.
- **Integrações:** adaptadores por provedor, webhooks assinados e idempotência; nenhuma informação completa de cartão no banco da clínica.
- **Operação:** logs estruturados sem conteúdo clínico, métricas, alertas, rastreamento de erro, backup criptografado e restauração periódica.

Domínios principais: `identity`, `clinic`, `patients`, `crm`, `scheduling`, `clinical-records`, `catalog-sales`, `billing`, `documents`, `inventory`, `communications`, `reports`, `integrations` e `audit`.

Entidades centrais: clínica/unidade, usuário, perfil/permissão, profissional, paciente/responsável, lead, tarefa, sala, serviço, grade/turma, agendamento, ocorrência de presença, plano/pacote, saldo de sessões, avaliação/modelo/versão, evolução/adendo, anexo, contrato/versão/assinatura, conta/baixa/parcela, fornecedor, centro de custo, comissão, produto/movimento de estoque, mensagem/consentimento, pesquisa/resposta e evento de auditoria.

## 7. Requisitos regulatórios e de segurança

Dados de saúde e biometria são dados pessoais sensíveis na LGPD.[^1] O sistema precisa nascer com minimização, finalidade, base legal documentada, transparência, controle de acesso e resposta a direitos do titular — não como correção posterior. A clínica tende a ser controladora e a empresa que operar/hospedar o CRM, operadora, mas os papéis devem ser formalizados conforme a operação real.

A Resolução COFFITO nº 414/2012 exige prontuário das atividades assistenciais, define conteúdo mínimo, admite meio eletrônico, requer nome completo e CREFITO imediatamente após o registro, impõe sigilo, acesso do paciente e guarda mínima de cinco anos desde o último registro.[^2] Portanto:

- prontuário deve conter identificação, história clínica, exame físico-funcional, exames complementares, diagnóstico/prognóstico, plano terapêutico, evolução/intercorrências e identificação do profissional;
- evolução assinada não pode ser sobrescrita silenciosamente; correções devem ser adendos com autor, data e motivo;
- exportação legível e cópia autêntica devem estar disponíveis;
- política de retenção deve respeitar no mínimo cinco anos e outras obrigações aplicáveis;
- acesso clínico deve ser mínimo e auditado; recepção não precisa ler conteúdo clínico;
- backups precisam ser testados, criptografados e ter retenção definida.

Controles obrigatórios recomendados:

- TLS, criptografia em repouso e gestão segura de segredos.
- MFA administrativo; senha forte, rate limit e revogação de sessões.
- RBAC com separação entre gestão, recepção, fisioterapeuta e financeiro.
- Auditoria append-only de leitura/exportação e alteração de prontuário, permissões, financeiro, contratos e migrações.
- Links públicos de uso único ou curta duração, tokens armazenados como hash e proteção contra enumeração.
- Upload com limites, validação real de MIME, renomeação, antivírus e download autorizado.
- Backup diário, restauração trimestral testada, RPO/RTO acordados e plano de continuidade.
- Inventário de dados, registro das bases legais, política de retenção/descarte, canal do titular e processo de incidente.
- Consentimentos separados quando necessários para marketing, imagem e biometria; não usar um aceite genérico.
- Contrato com suboperadores e localização dos dados; revisão jurídica antes da produção. A ANPD mantém orientação específica de segurança para agentes de pequeno porte.[^3]

## 8. Migração de dados

O risco dominante é a saída do SeuFisio. A documentação pública informa que o produto não oferece API aberta para chatbots/agentes; não há promessa pública de uma API geral de exportação.[^4] Antes de desenvolver importadores definitivos:

1. Solicitar formalmente exportação de pacientes, profissionais, agenda futura/histórica, planos e saldos, contas abertas/pagas, prontuários, avaliações, anexos, contratos e auditoria disponível.
2. Verificar formatos, chaves, encoding, fuso horário, arquivos ausentes e qualidade dos documentos.
3. Criar staging imutável da exportação e importadores idempotentes.
4. Definir identificador legado em cada entidade para rastreabilidade.
5. Reconciliar número de registros, soma de contas, sessões restantes, agenda futura e amostra clínica assinada pela responsável.
6. Gerar relatório de exceções; nada deve ser descartado silenciosamente.
7. Se o legado só exportar prontuários em PDF, guardar o PDF como documento histórico e iniciar registros estruturados no novo sistema, identificando claramente a origem.

Não se deve automatizar scraping da conta ou contornar controles do fornecedor sem autorização contratual e jurídica explícita.

## 9. Critérios de aceite do MVP

- Nenhum conflito de profissional/sala e nenhuma turma acima da capacidade em testes concorrentes.
- Venda recorrente/pacote cria agenda, saldo de sessões e financeiro de forma atômica; falha não deixa dados parciais.
- Status finalizado consome exatamente uma sessão e participa da comissão uma única vez; cancelamento autorizado reverte corretamente.
- Prontuário identifica profissional/CREFITO, mantém histórico, bloqueia alteração destrutiva e exporta PDF compreensível.
- Recepção não acessa notas clínicas; fisioterapeuta não acessa DRE sem permissão.
- Contas conciliam datas de competência, vencimento, pagamento e recebimento.
- Webhooks repetidos não duplicam cobrança, baixa ou NFSe.
- Exportação da clínica funciona sem dependência da equipe técnica.
- Backup restaurado em ambiente isolado e evidenciado antes do go-live.
- Migração reconciliada, com zero erro silencioso e aceite formal da cliente.

## 10. Equipe, esforço e custo relativo

Equipe mínima recomendada:

- 1 responsável de produto/analista com acesso constante à clínica.
- 1 designer de produto parcial nas primeiras 8–10 semanas.
- 2 desenvolvedores full-stack experientes.
- 1 QA/automação parcial desde a Fase 2.
- DevOps e revisão de segurança sob demanda, com teste antes da produção.

Estimativa por cenário, ainda não comercial:

| Cenário | Conteúdo | Prazo indicativo |
|---|---|---:|
| MVP de troca | P0, migração essencial, sem pagamento/NFSe complexos | 12–16 semanas |
| Paridade web relevante | P0 + P1 | 20–26 semanas |
| Escopo amplo | P0 + P1 + P2 selecionado | 24–32 semanas |

As integrações externas podem alterar bastante o prazo. NFSe varia por município; Wellhub/TotalPass dependem de acesso de parceiro; pagamento exige KYC e homologação; WhatsApp oficial exige conta empresarial e templates. Custos recorrentes continuarão existindo para nuvem, backups, e-mail/SMS/WhatsApp, armazenamento, gateway, NFSe e suporte. O objetivo realista é eliminar a licença genérica e dar controle/adequação à cliente, não prometer custo operacional zero.

## 11. Decisões que precisam ser tomadas com a cliente

1. Ela atende apenas fisioterapia ou também Pilates/estética? Usa turma, grade e reposição?
2. Quantos profissionais, usuários, salas e unidades existem?
3. Quais módulos ela realmente usa toda semana?
4. Qual é o fluxo de cobrança: Pix direto, maquininha, boleto, cartão recorrente ou convênio?
5. Emite NFSe pelo SeuFisio? Em qual município e regime?
6. Usa comissão, produtos/estoque, Wellhub, TotalPass, facial ou catraca?
7. Quais avaliações e modelos de evolução precisam ser migrados?
8. Quantos pacientes, atendimentos, anexos e anos de histórico existem?
9. Que exportações o fornecedor disponibiliza e até quando o acesso permanecerá ativo?
10. Quais relatórios são usados para decisão, contabilidade e fiscalização?

## 12. Recomendação final

Não iniciar pela clonagem de todas as funcionalidades. Iniciar pela descoberta com inventário marcado pela cliente e por uma exportação real. Se o uso for típico de uma clínica pequena, P0 provavelmente cobre quase toda a operação e evita meses de trabalho em catraca, estoque, Wellhub, TotalPass e recursos de Pilates que talvez não gerem valor.

A melhor primeira entrega é um “caminho dourado” completo: lead/paciente → agendamento → atendimento → evolução → consumo da sessão → cobrança/baixa → recibo/relatório. Quando esse fluxo estiver íntegro, auditável e migrável, os módulos restantes podem ser adicionados sem comprometer a operação clínica.

## Fontes

[^1]: Presidência da República. [Lei nº 13.709/2018 — Lei Geral de Proteção de Dados Pessoais, texto compilado](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm).
[^2]: Conselho Federal de Fisioterapia e Terapia Ocupacional. [Resolução COFFITO nº 414/2012 — registro, guarda e descarte do prontuário fisioterapêutico](https://www.coffito.gov.br/nsite/?p=1727), 2012.
[^3]: Autoridade Nacional de Proteção de Dados. [Materiais educativos e guias orientativos](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes), incluindo o guia de segurança da informação para agentes de pequeno porte.
[^4]: SeuFisio. [FAQ — ausência de API aberta para chatbots/agentes](https://tutoriais.seufisio.com/faq-duvidas-frequentes).

Fontes primárias do produto consultadas: [funcionalidades](https://www.seufisio.com/funcionalidades), [planos e preços](https://www.seufisio.com/planos-e-precos), [índice completo da documentação](https://tutoriais.seufisio.com/llms.txt) e as páginas oficiais citadas junto a cada módulo. Consulta realizada em setembro de 2026; funcionalidades e integrações podem mudar.
