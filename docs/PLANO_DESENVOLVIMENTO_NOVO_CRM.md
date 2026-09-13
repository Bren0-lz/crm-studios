# Plano de desenvolvimento do novo CRM

## 1. Objetivo do produto

Construir um CRM web sob medida para a clínica, inspirado nas capacidades operacionais do SeuFisio, mas com identidade, experiência e código próprios. O sistema deverá centralizar pacientes, agenda, prontuário, planos, sessões, financeiro, documentos, relacionamento comercial e relatórios.

O primeiro objetivo de negócio é permitir que a cliente encerre o uso diário do SeuFisio sem perder histórico, agenda futura, controle de sessões, prontuários ou valores em aberto. O segundo é reduzir tarefas manuais e oferecer uma base que possa evoluir sem depender do fornecedor anterior.

O produto não terá aplicativo do paciente. Interações externas serão feitas por páginas web responsivas acessadas por links seguros.

## 2. Premissas iniciais

- Uma clínica como cliente inicial, preparada para mais de uma unidade sem complexidade de SaaS público no MVP.
- Usuários internos: proprietária/gestora, recepção, fisioterapeutas e financeiro.
- Uso em desktop, notebook, tablet e navegador móvel.
- Idioma e moeda: português do Brasil e real.
- Horários armazenados com fuso da clínica; padrão inicial `America/Sao_Paulo`.
- Dados de saúde tratados como dados pessoais sensíveis.
- Migração feita somente a partir de exportações legítimas fornecidas pela cliente ou pelo SeuFisio.
- Pagamentos, WhatsApp, e-mail e NFSe serão integrações substituíveis por adaptadores.
- A definição final do MVP depende de uma exportação real do legado e da validação dos fluxos com a cliente.

Documento de referência do escopo: [levantamento funcional e análise do SeuFisio](./PLANO_CRM_CLINICA_FISIOTERAPIA.md).

## 3. Resultado esperado por release

### Release 1 — MVP de substituição

Ao final desta release, a clínica deverá conseguir trabalhar no novo CRM sem cadastrar novas informações no sistema anterior.

- Usuários, perfis, permissões, profissionais, salas e serviços.
- Cadastro e histórico básico de pacientes.
- Agenda diária e semanal, recorrência, conflitos, faltas e reposições.
- Avaliação, anamnese, prontuário, evolução e anexos.
- Serviços avulsos, planos recorrentes e pacotes de sessões.
- Contas a receber e pagar, baixa, recibo, inadimplência e caixa básico.
- Importação dos dados indispensáveis.
- Auditoria, backup, exportação e controles de segurança.

### Release 2 — paridade web e automação

- Links públicos de cadastro, anamnese e agendamento.
- CRM de leads e funil comercial.
- Cobranças digitais e recorrentes.
- Contratos e termos com assinatura eletrônica.
- Lembretes por e-mail e WhatsApp oficial.
- Comissões, centros de custo, relatórios, NPS e NFSe, conforme uso confirmado.

### Release 3 — expansão opcional

- Produtos, estoque e comandas.
- Pacotes de múltiplos serviços e regras comerciais especiais.
- DRE e indicadores gerenciais avançados.
- Wellhub e TotalPass, se houver credenciais e necessidade.
- Check-in facial e catraca somente em projeto separado.

## 4. Princípios de desenvolvimento

1. **Fluxos completos antes de quantidade de telas:** cada entrega deve ligar cadastro, agenda, atendimento, prontuário e financeiro quando aplicável.
2. **Integridade antes de automação:** recorrências e cobranças só serão automatizadas depois que criação, alteração e cancelamento forem confiáveis.
3. **Histórico não é sobrescrito:** evoluções, contratos, pagamentos e eventos críticos usam versão, adendo, estorno ou cancelamento auditado.
4. **Menor acesso necessário:** recepção, profissional, financeiro e gestão veem apenas o que precisam.
5. **Saída de dados desde o início:** toda informação da clínica deve ser exportável em formato utilizável.
6. **Integrações desacopladas:** falha de WhatsApp, pagamento ou NFSe não pode bloquear o restante do CRM.
7. **Sem dependência do aplicativo:** todos os canais externos previstos funcionam por navegador e link seguro.

## 5. Arquitetura proposta

### Estrutura

Monólito modular em um monorepositório. É a opção com menor custo operacional para a primeira clínica e mantém fronteiras claras para uma futura separação de serviços.

- `apps/web`: painel interno e páginas públicas em Next.js/React.
- `apps/api`: API e regras de negócio em NestJS/TypeScript.
- `apps/worker`: tarefas assíncronas, notificações, importações e documentos.
- `packages/ui`: componentes e design system.
- `packages/contracts`: schemas, tipos e contratos da API.
- `packages/config`: configuração compartilhada de lint, TypeScript e testes.
- `infra`: definições de ambientes, banco, filas, arquivos e observabilidade.

### Serviços de infraestrutura

- PostgreSQL como banco transacional.
- Prisma ou ORM equivalente, com migrações versionadas.
- Redis e fila para recorrências, mensagens, PDFs, webhooks e importações.
- Armazenamento S3 compatível para exames, imagens, PDFs e contratos.
- Provedor transacional de e-mail.
- Gateway de pagamento brasileiro com tokenização, Pix, boleto, cartão e webhooks.
- Provedor oficial de WhatsApp Business.
- Serviço de geração de PDF no worker.
- Monitoramento de erros, logs estruturados, métricas e alertas.

### Ambientes

- Desenvolvimento local com dados fictícios.
- Homologação isolada, usada pela cliente para aceite.
- Produção com dados reais.
- Cópias de produção nunca devem ser usadas diretamente no desenvolvimento.

## 6. Domínios e épicos do backlog

### EP-01 — Plataforma, identidade e acesso

**Objetivo:** estabelecer a fundação segura do produto.

- Autenticação, logout e recuperação de senha.
- MFA para administradores e gestores.
- Sessões revogáveis e encerramento em todos os dispositivos.
- Usuários, convites, ativação e desativação.
- Perfis: gestão, recepção, fisioterapeuta e financeiro.
- Permissões granulares e perfis personalizados.
- Clínica, unidades, logotipo, documentos e configurações.
- Profissionais, especialidade, CREFITO e vínculo com unidades.
- Auditoria de acesso e alterações críticas.

**Aceite:** cada perfil acessa apenas seus módulos; usuário desativado perde acesso imediatamente; toda mudança de permissão fica auditada.

### EP-02 — Cadastros operacionais

**Objetivo:** formar as tabelas utilizadas por agenda, vendas e financeiro.

- Salas, feriados e bloqueios.
- Serviços e tabela de preços.
- Formas de pagamento.
- Categorias financeiras, fornecedores e centros de custo.
- Etiquetas, interesses e origens de pacientes/leads.
- Status ativo/inativo e exclusão lógica.

**Aceite:** um cadastro em uso não pode ser apagado de modo a quebrar histórico; itens inativos deixam de aparecer em novas operações.

### EP-03 — Pacientes

**Objetivo:** oferecer uma visão única e confiável de cada paciente.

- Dados pessoais, documentos, contato, endereço e profissão.
- Responsável legal e contato de emergência.
- Dados de cobrança e autorização de uso de imagem.
- Observações administrativas, etiquetas e interesses.
- Busca por nome, matrícula, CPF, telefone e e-mail.
- Indicadores: ativo, inativo, sem plano, inadimplente e renovação próxima.
- Mesclagem auditada de duplicidades.
- Linha do tempo administrativa.
- Exportação individual e da base.

**Aceite:** CPF/e-mail/telefone auxiliam na detecção de duplicidade; mesclagem preserva agenda, prontuário, vendas e financeiro.

### EP-04 — Agenda e presença

**Objetivo:** tornar a agenda o centro da operação diária.

- Agenda geral e por profissional.
- Visões diária e semanal; filtros por sala, profissional e serviço.
- Criação, edição e cancelamento de atendimento.
- Validação de conflito de profissional e sala.
- Duração por serviço e bloqueios de agenda.
- Atendimento avulso, experimental e avaliação.
- Grades/turmas com capacidade e repetição semanal.
- Recorrência com horário fixo ou sessões flexíveis.
- Status: agendado, confirmado, finalizado, não compareceu, ausência justificada e ausência do profissional.
- Reagendamento, reposição, limites e lista de espera.
- Atalho da agenda para paciente, avaliação e evolução.

**Aceite:** duas requisições simultâneas não criam dupla reserva nem excedem vagas; alterações em série permitem editar uma ocorrência ou as ocorrências futuras.

### EP-05 — Prontuário e avaliações

**Objetivo:** registrar a assistência fisioterapêutica de forma segura e auditável.

- Construtor de modelos de avaliação/anamnese.
- Versão publicada do modelo e preservação das respostas antigas.
- Tipos de campo: texto curto/longo, número, data, seleção, múltipla escolha, sim/não e escala.
- Avaliação vinculada ao paciente, atendimento e profissional.
- Evolução clínica por atendimento.
- Modelos de evolução em texto e formulário estruturado.
- Diagnóstico/prognóstico, plano terapêutico, objetivos e alta.
- Adendos auditáveis; proibição de alteração silenciosa após assinatura.
- Linha do tempo clínica e consulta rápida pela agenda.
- Anexos com classificação, descrição, autor e data.
- Exportação do prontuário por período em PDF.
- Registro do profissional, nome, CREFITO e data em cada entrada.

**Aceite:** recepção não lê conteúdo clínico; toda evolução assinada é imutável e qualquer correção cria adendo; PDF contém autoria e sequência cronológica.

### EP-06 — Planos, pacotes e sessões

**Objetivo:** representar os modelos comerciais da clínica e controlar o direito de atendimento.

- Atendimento avulso.
- Serviço recorrente mensal, com ou sem data final.
- Pacote fixo de longa duração.
- Pacote personalizado por quantidade e validade.
- Horários fixos ou sessões sem horário predefinido.
- Valor padrão e ajuste autorizado.
- Parcelamento e dia de vencimento.
- Saldo, consumo, estorno e expiração de sessões.
- Pausa, reativação, renovação e cancelamento.
- Venda proporcional no primeiro mês.
- Geração transacional de agenda e contas a receber.

**Aceite:** uma sessão finalizada é consumida uma única vez; reversão autorizada restaura o saldo; falha ao gerar agenda ou financeiro desfaz a venda inteira.

### EP-07 — Financeiro

**Objetivo:** permitir controle financeiro suficiente para a operação e migração.

- Contas a receber manuais e originadas de vendas.
- Parcelas, vencimento, competência, pagamento e recebimento.
- Status aberta, vencida, paga, cancelada e falha de cobrança.
- Baixa, estorno e histórico.
- Recibos em PDF.
- Contas a pagar e despesas recorrentes.
- Fornecedores, categorias e centros de custo.
- Caixa diário e fluxo de caixa.
- Inadimplência e visão financeira do paciente.
- Fechamento mensal simples e exportação para contabilidade.

**Aceite:** totais conciliam por competência e caixa; conta cancelada não desaparece; estorno gera evento inverso auditável.

### EP-08 — Páginas públicas

**Objetivo:** permitir autosserviço web sem conta de paciente.

- Pré-cadastro e cadastro por link.
- Anamnese por link temporário.
- Agendamento online conforme disponibilidade publicada.
- Página de pagamento hospedada ou redirecionada pelo gateway.
- Contrato/termo para leitura e assinatura.
- Pesquisa de satisfação.
- Identidade visual da clínica e acessibilidade básica.

**Aceite:** links são não enumeráveis, expiram quando aplicável e não revelam dados de terceiros; submissões repetidas são idempotentes.

### EP-09 — CRM comercial

**Objetivo:** acompanhar o lead desde a origem até a conversão.

- Leads, origem, canal de contato, interesse, responsável e etiquetas.
- Funil Kanban configurado inicialmente com cinco etapas.
- Observações, tarefas, lembretes e histórico de contato.
- Agendamento de avaliação diretamente pelo lead.
- Motivo de perda.
- Conversão em paciente preservando dados e histórico.
- Indicadores de origem, estágio, conversão, perdas e tempo de resposta.

**Aceite:** lead convertido não cria paciente duplicado; mudança de estágio fica no histórico; oportunidade perdida exige motivo.

### EP-10 — Comunicação

**Objetivo:** reduzir faltas, inadimplência e trabalho manual.

- E-mail transacional.
- Lembrete de atendimento configurável.
- Aviso de cobrança e vencimento.
- Mensagem individual iniciada pelo cadastro ou agenda.
- WhatsApp Business oficial com templates aprovados.
- Consentimento, preferências e opt-out por canal/finalidade.
- Fila, tentativas, falha permanente e histórico de entrega.

**Aceite:** uma falha do provedor não bloqueia agenda ou financeiro; opt-out é respeitado; conteúdo clínico não é incluído em notificações.

### EP-11 — Contratos, documentos e assinatura

**Objetivo:** formalizar vendas e emitir documentos da clínica.

- Modelos versionados com variáveis.
- Contratos vinculados a paciente, plano e venda.
- Snapshot imutável do conteúdo enviado.
- Link de assinatura com aceite, assinatura, data, IP e evidências técnicas.
- Status rascunho, enviado, visualizado, assinado, expirado e cancelado.
- Reenvio e PDF final.
- Atestado de comparecimento e outros modelos administrativos.

**Aceite:** editar o modelo não altera contratos antigos; documento assinado preserva conteúdo e evidências; reenvio não cria contratos duplicados.

### EP-12 — Relatórios e indicadores

**Objetivo:** substituir planilhas e apoiar decisões.

- Agenda do dia, presença e faltas.
- Ocupação por profissional, sala, dia e horário.
- Pacientes ativos/inativos, sem plano, renovação e inadimplência.
- Sessões vendidas, utilizadas, restantes e expiradas.
- Contas a receber/pagar, caixa e receita por serviço.
- Comissões por profissional.
- Leads, conversão e motivos de perda.
- Contratos pendentes.
- NPS e satisfação.
- Exportação CSV/XLSX e PDF onde fizer sentido.

**Aceite:** cada indicador possui definição registrada; números de relatório reconciliam com as telas operacionais e podem ser reproduzidos por filtros.

### EP-13 — Migração

**Objetivo:** transportar o legado com rastreabilidade e sem perda silenciosa.

- Inventário dos arquivos e formatos recebidos.
- Área de staging imutável.
- Importadores idempotentes e identificador do legado.
- Mapeamento de profissionais, serviços, status e formas de pagamento.
- Importação de pacientes, agenda, planos, saldos e financeiro.
- Importação estruturada ou documental de prontuários e avaliações.
- Anexos e contratos.
- Relatório de erros, avisos e itens não importados.
- Reconciliação de quantidades, valores e amostras clínicas.

**Aceite:** reexecutar a importação não duplica dados; toda exceção é reportada; clínica aprova formalmente os totais e amostras.

### EP-14 — Integrações e módulos opcionais

- Gateway de pagamentos e conciliação.
- NFSe com rejeição, reprocessamento e cancelamento.
- Produtos, movimentos de estoque, vendas e comandas.
- Comissionamento avançado e DRE.
- Wellhub e TotalPass.
- Check-in facial/catraca em escopo separado.

## 7. Cronograma proposto

Cada sprint tem duas semanas. O cronograma pressupõe duas pessoas desenvolvedoras full-stack, apoio parcial de produto/design e QA desde a terceira sprint.

| Sprint | Foco | Entrega homologável |
|---|---|---|
| 0 | Descoberta e dados | Fluxos validados, protótipo, exportação de amostra e backlog fechado do MVP |
| 1 | Fundação | Monorepo, CI/CD, ambientes, autenticação, clínica, usuários e auditoria inicial |
| 2 | Cadastros e pacientes | Profissionais, salas, serviços, pacientes, busca, etiquetas e permissões |
| 3 | Agenda básica | Visões diária/semanal, avulsos, conflitos, bloqueios e salas |
| 4 | Recorrência e presença | Grades, turmas, recorrência, status, faltas, reposições e lista de espera |
| 5 | Prontuário | Avaliação/anamnese, modelos, evolução, autoria e linha do tempo |
| 6 | Arquivos, planos e sessões | Anexos, PDF, avulsos, recorrentes, pacotes, saldos e consumo |
| 7 | Financeiro e migração-piloto | Contas, baixas, recibo, caixa, importador e reconciliação |
| 8 | Hardening e go-live do MVP | Segurança, desempenho, restauração, treinamento, migração final e operação assistida |
| 9 | Páginas públicas | Cadastro, anamnese e agendamento por link |
| 10 | CRM comercial | Leads, funil, tarefas, conversão e métricas |
| 11 | Pagamentos e contratos | Pix/boleto/cartão, recorrência, assinatura e documentos |
| 12 | Comunicação e satisfação | E-mail, WhatsApp oficial, lembretes, cobrança e NPS |
| 13 | Gestão | Comissões, centros de custo e relatórios prioritários |
| 14 | Fiscal e relatórios avançados | NFSe, DRE e indicadores restantes, se aprovados |
| 15+ | Opcionais | Estoque/comanda, Wellhub/TotalPass ou projeto de controle de acesso |

### Marcos

- **Fim da Sprint 2:** base administrativa navegável.
- **Fim da Sprint 4:** recepção homologa a agenda.
- **Fim da Sprint 6:** fisioterapeutas homologam atendimento e prontuário.
- **Fim da Sprint 7:** fluxo completo homologado com dados migrados de teste.
- **Fim da Sprint 8:** MVP em produção, aproximadamente 18 semanas incluindo descoberta e corte.
- **Fim da Sprint 13:** paridade web prioritária, aproximadamente 28 semanas.

O marco de produção pode ser antecipado para 14–16 semanas ao reduzir recorrência complexa, contas a pagar ou parte da migração; essa decisão deve ser explícita, nunca escondida na estimativa.

## 8. Fluxos prioritários de homologação

### Fluxo A — novo paciente avulso

Cadastro → agendamento → lembrete → atendimento → evolução → cobrança → baixa → recibo.

### Fluxo B — paciente recorrente

Venda do plano → geração de horários → geração financeira → presença/falta → consumo ou reposição → renovação.

### Fluxo C — pacote flexível

Venda de sessões → saldo inicial → agendamentos avulsos → consumo → cancelamento/estorno → expiração.

### Fluxo D — lead

Entrada por link/manual → contato → avaliação agendada → atendimento → conversão ou perda com motivo.

### Fluxo E — prontuário

Anamnese → avaliação → diagnóstico/prognóstico → plano terapêutico → evoluções → adendo → alta → exportação PDF.

### Fluxo F — migração

Exportação do legado → staging → importação → validação automática → amostragem humana → correções → delta final → corte.

## 9. Estratégia de testes

### Testes automatizados

- Unitários nas regras de recorrência, saldo de sessões, financeiro, comissão e permissões.
- Integração para banco, filas, armazenamento e webhooks.
- Contrato da API entre frontend e backend.
- End-to-end dos seis fluxos prioritários.
- Testes de autorização por perfil e por registro.
- Testes de idempotência em pagamento, NFSe, recorrência e importação.
- Testes de concorrência na reserva de profissional, sala e vaga de turma.

### Testes manuais

- Homologação quinzenal com roteiros e dados fictícios realistas.
- Compatibilidade nos navegadores suportados e tablet.
- Acessibilidade dos formulários e páginas públicas.
- Conferência clínica dos PDFs e documentos.
- Reconciliação financeira e de migração.
- Teste de restauração de backup antes do go-live.

### Qualidade mínima para produção

- Zero defeito crítico ou alto aberto nos fluxos do MVP.
- Cobertura de regras críticas, sem usar percentual global como único indicador.
- Tempo de resposta aceitável com o volume projetado da clínica.
- Monitoramento e alertas testados.
- Plano de rollback e suporte do corte aprovados.

## 10. Segurança, privacidade e prontuário

- MFA para gestão e perfis privilegiados.
- Senhas com hash forte, rate limiting e proteção contra força bruta.
- TLS e criptografia em repouso.
- Segredos fora do código e com rotação.
- Permissões por função, clínica/unidade e relação assistencial quando necessário.
- Auditoria de leitura, exportação e alteração de dados clínicos e financeiros.
- Evoluções imutáveis após assinatura; correções por adendo.
- Identificação de autor, data/hora e CREFITO.
- Anexos com validação de tipo, limite, antivírus e URL temporária.
- Logs sem anamnese, diagnóstico, evolução ou dados de cartão.
- Retenção e descarte documentados; prontuário guardado pelo prazo regulatório aplicável.
- Processo de solicitação de acesso/cópia pelo titular.
- Registro de consentimentos quando aplicáveis e separação entre assistência, marketing, imagem e biometria.
- Plano de incidentes, contatos responsáveis e procedimento de comunicação.

Antes de produção, realizar revisão jurídica/LGPD e avaliação de segurança independente. Isso não substitui a responsabilidade técnica da clínica nem aconselhamento jurídico.

## 11. Migração e entrada em produção

### Preparação

1. Obter a exportação completa antes de a cliente cancelar o SeuFisio.
2. Guardar a exportação original criptografada e somente leitura.
3. Definir quais registros serão estruturados e quais serão preservados como documento histórico.
4. Criar mapeamento de identificadores e valores do legado.

### Ensaios

1. Importação de amostra pequena durante a Sprint 2.
2. Primeira migração completa até a Sprint 6.
3. Segunda migração completa na Sprint 8.
4. Comparação de pacientes, agenda futura, sessões, contas e amostra de prontuários.

### Corte

1. Comunicar janela e responsáveis.
2. Bloquear novas alterações no legado no horário combinado.
3. Obter exportação final ou delta.
4. Importar, reconciliar e obter aceite da responsável.
5. Liberar usuários por perfil.
6. Acompanhar a operação diariamente por 5 a 10 dias úteis.

### Rollback

O corte só continua se pacientes, agenda futura, saldos, contas abertas e prontuários críticos estiverem conciliados. Caso contrário, a clínica volta temporariamente ao legado, registra as movimentações da janela e agenda novo corte. O plano depende de manter o acesso ao sistema anterior até a estabilização.

## 12. Operação e suporte

- Disponibilidade alvo inicial: 99,5% mensal, excluindo manutenção programada.
- Backup diário automatizado e teste trimestral de restauração.
- RPO inicial de até 24 horas e RTO de até 8 horas; revisar conforme criticidade e orçamento.
- Alertas para indisponibilidade, erros, fila parada, falha de backup e integrações.
- Runbooks de restauração, falha de pagamento, falha de mensagem e incidente de segurança.
- Canal de suporte e classificação de severidade.
- Correções críticas com prioridade imediata; melhorias entram no backlog.
- Exportação periódica entregue à cliente como medida de portabilidade.

## 13. Papéis e rotina do projeto

| Papel | Responsabilidade principal |
|---|---|
| Product owner | Prioridade, regras da clínica e aceite funcional |
| Analista/UX | Descoberta, protótipos, fluxos e critérios de aceite |
| Desenvolvedores | Arquitetura, implementação, testes e revisão de código |
| QA | Estratégia, automação, regressão e apoio à homologação |
| DevOps/segurança | Infraestrutura, observabilidade, backup e revisão técnica |
| Representantes da clínica | Validação de agenda, prontuário, financeiro e migração |

Ritmo sugerido:

- Planejamento no início de cada sprint.
- Reunião curta de acompanhamento três vezes por semana.
- Demonstração e homologação ao final de cada sprint.
- Refinamento semanal do próximo ciclo.
- Registro formal de decisões e mudanças de escopo.

## 14. Definition of Ready

Uma história só entra na sprint quando possui:

- problema e usuário beneficiado;
- regra de negócio confirmada;
- protótipo ou comportamento esperado;
- critérios de aceite testáveis;
- estados de vazio, erro, permissão e cancelamento;
- impacto em auditoria, migração e LGPD avaliado;
- dependências externas identificadas.

## 15. Definition of Done

Uma história só está concluída quando:

- código revisado e integrado;
- migração de banco versionada e reversível quando possível;
- testes críticos automatizados aprovados;
- permissões e auditoria verificadas;
- estados de erro e carregamento tratados;
- logs e métricas adicionados quando necessários;
- documentação funcional/técnica atualizada;
- implantada em homologação;
- aceita pelo responsável de produto.

## 16. Riscos principais

| Risco | Impacto | Mitigação |
|---|---|---|
| Exportação incompleta do SeuFisio | Perda de histórico ou atraso no corte | Solicitar amostra na Sprint 0; preservar PDFs e anexos; reconciliar duas migrações |
| Regras reais não documentadas | Retrabalho | Observar a rotina e homologar a cada sprint |
| Escopo de paridade total no MVP | Prazo e custo excessivos | Bloquear MVP nos épicos EP-01 a EP-07 e migração essencial |
| Erro de recorrência ou saldo | Atendimento/cobrança incorretos | Testes de domínio, idempotência e concorrência |
| Acesso indevido ao prontuário | Dano regulatório e reputacional | RBAC, auditoria, MFA e revisão de segurança |
| Integrações instáveis | Cobrança ou comunicação falha | Filas, retentativas, adaptadores e reconciliação manual |
| NFSe municipal | Atraso na Release 2 | Validar município/provedor na descoberta e manter emissão externa temporária |
| Dupla operação prolongada | Divergência de dados | Janela curta, delta final e data de corte clara |
| Dependência da equipe técnica | Custo operacional | Painéis administrativos, exportação e runbooks desde o MVP |

## 17. Métricas de sucesso

### Implantação

- 100% da agenda futura necessária migrada e conciliada.
- 100% dos pacientes ativos e contas em aberto importados ou justificados.
- Zero perda silenciosa de prontuário; exceções formalmente registradas.
- Todos os usuários críticos treinados antes do corte.

### Operação

- Redução de tempo para cadastrar e agendar paciente.
- Redução de conflitos e ajustes manuais de agenda.
- Percentual de atendimentos com evolução registrada no mesmo dia.
- Taxa de faltas antes e depois dos lembretes.
- Tempo para localizar prontuário ou situação financeira.
- Divergência entre saldo de sessões, agenda e financeiro.
- Quantidade de chamados por módulo nas primeiras quatro semanas.

## 18. Decisões obrigatórias antes da Sprint 1

1. Quantos usuários, profissionais, salas e unidades participarão do MVP?
2. A clínica trabalha com atendimento individual, turmas ou ambos?
3. Quais tipos de plano/pacote são usados hoje?
4. Quais regras de falta, reposição, pausa e cancelamento devem valer?
5. Quais campos e modelos compõem o prontuário real da cliente?
6. Quais dados e arquivos o SeuFisio exportará?
7. Quais funções podem ficar para depois do corte?
8. Qual provedor atual de pagamento e quais meios são indispensáveis?
9. NFSe precisa estar pronta no primeiro dia? Em qual município?
10. Quem, na clínica, aprova agenda, prontuário, financeiro e migração?

## 19. Primeiras ações

1. Agendar oficina de descoberta de duas horas com gestão, recepção e uma fisioterapeuta.
2. Solicitar imediatamente a exportação completa e uma exportação de amostra do SeuFisio.
3. Preencher a matriz “usa / não usa / precisa / pode esperar” para cada módulo.
4. Documentar os seis fluxos prioritários com exemplos reais anonimizados.
5. Confirmar o escopo da Release 1 e nomear os responsáveis pelo aceite.
6. Criar wireframes de pacientes, agenda, atendimento/prontuário e financeiro.
7. Revisar estimativa e iniciar a Sprint 1 somente após validar dados e critérios.
