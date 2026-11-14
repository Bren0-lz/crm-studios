# Plano de correções — relatório de teste de 13/11/2026

Este arquivo é autossuficiente: quem executa não tem o contexto da conversa que o gerou.
Cada tarefa diz o defeito, os arquivos, a mudança exata e os testes a criar.

## 0. Como usar este plano

- Repositório `bren0-lz/crm-studios` (monorepo npm: `packages/contracts`, `apps/api`, `apps/web`).
  Leia `CLAUDE.md` e `AGENTS.md` antes de começar; as regras de lá valem aqui.
- **Uma tarefa por sessão/PR.** Para cada tarefa: `git fetch origin main`, crie o branch a
  partir de `origin/main`, implemente, rode o gate, escreva o diário em
  `diario/<AAAA-MM-DD>-<ID>.md`, faça commit em pt-BR (sem `Co-Authored-By`), `git fetch origin
  main && git merge origin/main`, gate de novo, push e PR com título `<ID>: <título>`.
- **Gate completo** (todos com exit 0):
  `npm run typecheck && npm run lint && npm test && npm run build && node apps/web/scripts/audit-panels.cjs`
- **Teste focado:** `npm exec -w @crm/api -- vitest run src/<arquivo>.test.ts` (idem `@crm/web`,
  `@crm/contracts`).
- **Tarefa que toca `apps/api/src/storage/mysql`** roda também `npm run test:mysql` com
  `TEST_DATABASE_URL` (seção "Banco de dados" do `CLAUDE.md`).
- Nenhuma tarefa deste plano precisa de migração nova nem de dependência npm nova.
- As linhas citadas valem para a `main` em `9ef5ea0`; se o arquivo mudou, localize pelo trecho.
- Ambiguidade não se resolve por chute: marque `BLOCKED` no diário e pare.
- Na interface, "paciente" é sempre **cliente**. Textos em pt-BR.
- Ao abrir cada tarefa, acrescente-a ao `PLAN.md` numa seção nova
  `## Pedido avulso — Correções do relatório de teste (13/11/2026)`, no formato das tarefas
  vizinhas (`### <ID> — título`, **Escopo**, **Gate**, **Status**). Não edite o `STATE.md`.

## 1. Origem e validação

Um teste manual em produção (13/11/2026, usuário admin, só desktop) apontou 4 falhas e várias
observações. Cada item foi conferido contra o código. Resultado:

| Item do relatório | Veredito | Tarefa |
|-------------------|----------|--------|
| 7.4 Venda de plano falha no cadastro guiado ("Opção inválida.") | Válido, alta | RT1 |
| 6.7 Contato do lead sem "Sem resposta"; ligação vira "Mensagem enviada" | Válido, média | RT2 |
| 7.1 Mensagem de dados faltantes ignora o WhatsApp de emergência | Válido, média | RT3 |
| 9.1 Campanha "Só leads" fala em "clientes"; filtro de etiquetas some | Parcial, baixa | RT4 |
| 5.1 Sacola não mostra "Plano pacote" | Parcial, baixa | RT5 |
| 8.4 Ponto duplo "14 de nov.." | Válido, baixa | RT6 |
| 6.5 Data truncada no cartão do lead | Válido, baixa | RT6 |
| 6.9 Datas do lead sem hora | Válido, baixa | RT6 |
| Botão "Salvar e criar plano" na conversão de lead | Válido, baixa | RT6 |
| CPF sem máscara na ficha; telefone sem máscara na lixeira | Válido, baixa | RT6 |
| Sexta-feira Santa como feriado nacional | Não é defeito (roteiro errado) | — |
| Confirmação aceita "excluir" minúsculo | Intencional | — |
| Plano recorrente sem barra "N de M usadas" | Intencional (recorrente não tem saldo) | — |
| Toast com o primeiro nome | Intencional | — |
| Senha do admin com 3 caracteres | Dono decidiu: **sem tamanho mínimo**. Nada a fazer no código | — |

### Decisões do dono (14/11/2026)

- **D1:** plano do catálogo do tipo "Plano pacote" é vendido no cadastro guiado com
  `kind: "custom"`, igual à venda pela ficha do cliente.
- **D2:** senha continua sem tamanho mínimo. Não mexer em `passwordSchema`.
- **D3:** ligação e tentativa sem resposta **não** contam como "envio" de mensagem.

### Fora deste plano (sem decisão do dono — não implementar)

SOS pré-selecionando o cliente da ficha; botão Excluir plano dentro da ficha; campo de texto
hex nas cores; campo "Observações" no modal de perda do lead; painel de histórico do cartão
do lead cobrindo os botões; texto do card "sessões disponíveis" em Planos e sessões.

## 2. Tarefas

### RT1 — Plano pacote no cadastro guiado — prioridade alta

**Defeito.** Em Clientes › Novo cliente (ou CRM comercial › lead › Converter), ao adicionar um
plano do catálogo cujo tipo é "Plano pacote" e salvar, `POST /api/patients/guided` responde
400 `{"code":"VALIDATION_ERROR","message":"Opção inválida."}`.

**Causa.**
1. `planTypeKind("promotional")` devolve `"custom"`
   (`packages/contracts/src/plans/model.ts`, função `planTypeKind`). "Plano pacote" é o rótulo
   do tipo interno `promotional`.
2. `apps/web/src/features/patients/GuidedPlanFields.tsx` (~linha 158) copia esse `kind` para o
   formulário quando o usuário escolhe o plano do catálogo.
3. `guidedSubscriptionPlanSchema` (`packages/contracts/src/patients/model.ts`, ~linha 450) só
   aceita `z.enum(["recurring", "fixed_package"])`.
4. O seletor "Modelo" em `apps/web/src/features/patients/PatientModal.tsx` (~linha 1416) só
   lista `guidedPlanKinds = ["fixed_package", "recurring"]`
   (`apps/web/src/features/patients/model.ts`, ~linha 296). Com valor `custom` o navegador
   exibe a primeira opção ("Pacote fixo"), mas o estado continua `custom`.

**Mudança.**
- Contrato: `guidedSubscriptionPlanSchema` passa a aceitar
  `z.enum(["recurring", "fixed_package", "custom"])`. Os `refine` existentes continuam.
  Confira que nenhum deles trata "não recorrente" como "pacote fixo" de forma que quebre
  `custom` (ex.: `isRecurringChargeValid`, `renewablePlanPeriod`).
- API: siga `guidedSales` (`apps/api/src/modules/patients/guided-plans.ts`) até os
  repositórios `apps/api/src/storage/memory/patients.ts` e
  `apps/api/src/storage/mysql/patients.ts`. O plano `custom` deve ser gravado com
  `kind: "custom"` e seguir o mesmo caminho que `POST` de plano pela ficha já usa para
  `custom`. `planPackageSessions` já devolve `undefined` para `custom` (não agenda dias fixos);
  não mude isso. Se algum ponto assumir só `recurring | fixed_package` (tipo ou `if`), amplie.
- Web: `guidedPlanKinds` e o tipo `GuidedPlanForm` (`features/patients/types.ts`) aceitam
  `custom`. No seletor "Modelo" do `PatientModal`, a opção "Personalizado"
  (`planKindLabels.custom`, em `apps/web/src/features/plans/model.ts`) aparece **somente**
  quando o valor atual do formulário é `custom`; com outro valor, as opções continuam
  "Pacote fixo" e "Recorrente". O `<select>` nunca pode ficar com valor fora das opções.

**Testes a criar.**
- `packages/contracts/src/contracts.unit.test.ts`: `guidedPatientInputSchema` com
  `next: "plan"` aceita `plan.kind: "custom"` e continua recusando `kind: "single"` nesse passo.
- `apps/api/src/modules/patients/guided-sale.integration.test.ts`: cria modelo de plano com
  `planType: "promotional"`, chama `POST /patients/guided` com `next: "plan"` e
  `plan.kind: "custom"`; espera 201, plano gravado com `kind: "custom"` e cobrança gerada.
- `apps/api/src/modules/patients/guided-lead-conversion.integration.test.ts`: mesmo cenário
  convertendo um lead; espera 201 e lead convertido.
- `apps/api/src/storage/mysql/tests/guided-sale.integration.test.ts`: mesmo cenário no MySQL
  (laço `for (const storage of ["memory", "mysql"])` se o arquivo já usar).
- `apps/web/src/features/patients/guided-client-registration.integration.test.tsx`: com um
  modelo `planType: "promotional"` no catálogo mockado, escolher o plano e salvar; o corpo do
  `fetch` para `/patients/guided` tem `plan.kind === "custom"` e o seletor "Modelo" mostra
  "Personalizado".

**Gate.** Completo + `npm run test:mysql`.

### RT2 — Contato do lead: "Sem resposta" e rótulo por canal — prioridade média

**Defeito.** No cartão do lead › Atividades › aba Contatos: (a) não há como registrar tentativa
sem resposta; (b) uma ligação registrada como "Realizado" aparece com o selo "Mensagem
enviada" e conta em "N envios"; (c) o cartão do funil mostra "Mensagem enviada" para o lead
que só recebeu uma ligação.

**Estado atual.**
- Contrato já tem `reached?: boolean` em `leadContactInputSchema`
  (`packages/contracts/src/commercial/model.ts`, ~linha 152); `false` = tentativa sem resposta.
  A coluna `lead_contacts.reached` existe (migração `0049`, `TINYINT(1) NOT NULL DEFAULT 1`).
- `apps/web/src/features/commercial/LeadContactTimeline.tsx` já mostra o selo "Sem resposta"
  quando `reached === false`, mas rotula todo `direction: "outbound"` como "Mensagem enviada".
- `apps/web/src/features/commercial/LeadActivityModal.tsx`: o formulário (~linhas 395–470) tem
  Canal, Direção ("Realizado"/"Recebido"/"Registro interno"), Data e hora e Registro; não envia
  `reached`. `LeadMessageSummary` (mesmo arquivo, ~linha 26) conta todo `outbound` como envio.
- Modelo a copiar para o campo: `apps/web/src/features/events/EventContactModal.tsx`
  (campo `reached` "yes"/"no").
- `lead.lastMessageSentAt` é calculado no backend como o último contato `outbound`, qualquer
  canal: `apps/api/src/storage/mysql/mappers/commercial.ts` (~linha 92, subconsulta
  `MAX(lc.occurred_at) ... lc.direction = 'outbound'`) e
  `apps/api/src/storage/memory/commercial.ts` (~linha 140).
- Canais (`leadContactChannelSchema`): `phone`, `whatsapp`, `email`, `in_person`, `note`. Canal
  com nome livre (ex.: "Instagram") é gravado como `note` com `contactMethod` preenchido.

**Regra única (D3).** "Mensagem enviada" (envio) = contato com `direction === "outbound"`,
`channel` diferente de `phone` e de `in_person`, e `reached !== false`. Crie essa regra como
função exportada em `packages/contracts/src/commercial/model.ts`
(ex.: `isLeadMessageSent(contact)`) e use-a em todos os pontos abaixo. O total de contatos
(`contactCount`, "N contatos") continua contando tudo.

**Mudança.**
- `LeadActivityModal`: quando a Direção é "Realizado", mostrar o campo "Conseguiu falar?"
  (`<select>` Sim/Não, padrão Sim). "Não" envia `reached: false`; "Sim" não envia o campo.
  Nas outras direções o campo some e nada é enviado. Reaproveitar `form-grid`; sem CSS novo
  se possível.
- `LeadContactTimeline`: rótulo de `outbound` conforme o canal — `phone` → "Ligação
  realizada"; `in_person` → "Atendimento presencial"; demais → "Mensagem enviada". `inbound`
  e `internal` não mudam. O selo "Sem resposta" continua.
- `LeadMessageSummary`: `sent` passa a filtrar pela regra única. Textos mantidos.
- Backend, `lastMessageSentAt` pela regra única nos dois repositórios: no MySQL, a subconsulta
  ganha `AND lc.channel NOT IN ('phone','in_person') AND lc.reached = 1`; na memória, o `find`
  usa a função do contrato.
- `apps/web/src/features/commercial/CommercialPage.tsx` (~linha 349): depois de registrar um
  contato, só atualiza `lastMessageSentAt` local se o contato satisfaz a regra única.
- `apps/web/src/features/commercial/lead-contact-history.ts`: sem mudança de regra (o contato
  sintético é WhatsApp/`contactMethod` do lead); só confira que continua coerente.
- O atalho "Marcar enviada agora" não muda.

**Testes a criar.**
- `contracts.unit.test.ts`: tabela de casos da função nova (whatsapp outbound → true; phone
  outbound → false; in_person → false; note outbound → true; whatsapp com `reached: false` →
  false; inbound → false).
- `apps/api/src/modules/commercial/lead-board.integration.test.ts` (ou arquivo novo ao lado) e
  `apps/api/src/storage/mysql/tests/lead-message-sent.integration.test.ts`: lead só com ligação
  `outbound` → sem `lastMessageSentAt` e `contactCount: 1`; depois de um WhatsApp `outbound`
  com `reached: false` → ainda sem; depois de um WhatsApp `outbound` normal → com a data dele.
- `apps/web/src/features/commercial/lead-contact-channel.integration.test.tsx` (ou
  `lead-message-sent.integration.test.tsx`): registrar contato Telefone + Realizado + "Não" →
  corpo do `fetch` tem `reached: false`; a linha do tempo mostra "Ligação realizada" e "Sem
  resposta"; o resumo não soma envio. Direção "Recebido" → campo "Conseguiu falar?" ausente.
- Ajustar testes existentes que esperavam "Mensagem enviada" para ligação.

**Gate.** Completo + `npm run test:mysql`.

### RT3 — Dados faltantes do lead incluem o WhatsApp de emergência — prioridade média

**Defeito.** Na conversão do lead, a lista "falta no cadastro" e a mensagem para o lead pedem
"Contato de emergência (nome e telefone)". O cadastro de cliente exige também o WhatsApp de
emergência (`emergencyContactWhatsapp`), então a lista diz "completo" e a conversão recusa.

**Arquivo.** `packages/contracts/src/commercial/model.ts`: interface `LeadRegistrationData`
(~linha 60) e `leadMissingRegistrationFields` (~linha 86).

**Mudança.**
- `LeadRegistrationData` ganha `emergencyContactWhatsapp?: string | undefined`.
- O item de emergência só some quando nome, telefone **e** WhatsApp estão preenchidos. O
  texto lista só o que falta, na ordem nome, telefone, WhatsApp: ex.
  `"Contato de emergência (WhatsApp)"`, `"Contato de emergência (nome e WhatsApp)"`,
  `"Contato de emergência (nome, telefone e WhatsApp)"`.
- Confira quem chama (`apps/web/src/features/commercial/LeadConvertModal.tsx`): o lead
  passado precisa incluir `emergencyContactWhatsapp` (o campo já existe no lead).

**Testes a criar.**
- `contracts.unit.test.ts`: os três textos acima; lead com os três campos → item ausente;
  `leadRegistrationRequestMessage` contém o item novo.
- `apps/web/src/features/commercial/lead-form-conversion.integration.test.tsx`: lead com nome
  e telefone de emergência, sem WhatsApp → o modal de conversão lista
  "Contato de emergência (WhatsApp)". Atualizar asserções antigas do texto "(nome e telefone)".

**Gate.** Completo.

### RT4 — Campanha para leads: textos e filtro de etiquetas — prioridade baixa

**Defeito.** Em Comunicações › Nova campanha › Por filtros › "Só leads": (a) o resumo diz
"0 clientes vão receber esta campanha · 1 cliente encontrado"; (b) o filtro "Etiquetas do
lead" não aparece quando nenhum lead tem etiqueta.

**Arquivos.** `apps/web/src/features/communications/campaigns/NewCampaignModal.tsx`
(~linhas 95–180), `CampaignFiltersModal.tsx` (~linhas 39–61), `LeadAudienceFields.tsx`
(componente `Choices`, ~linha 28, e o uso em ~linha 140). O público vem de
`audience` (`"patients" | "patients_and_leads" | "leads"`,
`campaignAudienceKindSchema` em `packages/contracts/src/communications/model.ts`).

**Mudança.**
- Substantivo conforme o público, singular/plural: `patients` → "cliente/clientes";
  `leads` → "lead/leads"; `patients_and_leads` → "pessoa/pessoas". Aplicar em: "… vão receber
  esta campanha", "… encontrado(s)", "Buscando …", "Não foi possível buscar os …",
  `aria-label` da seção e da busca, "Nenhum dos … encontrados tem WhatsApp liberado.",
  "Nenhum … com esses filtros.", subtítulo e contagem do `CampaignFiltersModal`. Com
  `leads`, tirar o trecho "· N leads" (redundante). Um helper local resolve; sem contrato novo.
- `Choices` ganha prop opcional `emptyHint`. Só em "Etiquetas do lead", lista vazia mostra o
  rótulo e `<span className="span-2 field-hint">Nenhum lead tem etiqueta ainda.</span>`. Os
  outros usos de `Choices` continuam sumindo quando vazios.
- Campanha "Escolher clientes" (modo manual) não muda.

**Testes a criar.** Em `apps/web/src/features/communications/campaigns.integration.test.tsx`:
- público "Só leads" com prévia de 1 → texto "lead vai receber esta campanha" e nenhum
  "cliente" no resumo;
- público "Clientes e leads" → "pessoas vão receber esta campanha";
- opções de lead sem etiquetas → "Etiquetas do lead" e "Nenhum lead tem etiqueta ainda." visíveis;
- público "Só clientes" → textos atuais intactos.

**Gate.** Completo.

### RT5 — Sacola mostra o tipo do plano — prioridade baixa

**Depende de:** RT1 mesclada (mesmo arquivo `PatientModal.tsx`).

**Defeito.** No cadastro guiado, a "Sacola" mostra "Plano · 1 cobrança" para um plano do tipo
"Plano pacote"; o esperado é o rótulo do tipo.

**Arquivo.** `apps/web/src/features/patients/PatientModal.tsx`, montagem de `orderPlans`
(~linhas 444–480): `detail` usa `item.label` (`planLabel()` → "Plano"/"Plano 2").

**Mudança.** Para planos do passo "plano" (não os avulsos): se o modelo do catálogo
(`form.planTemplateId`) tem `planType`, o `detail` usa `planTypeLabels[planType]`
(`@crm/contracts`: "Plano mensal", "Plano pacote"…) no lugar de "Plano"; com mais de um plano,
manter o número ("Plano pacote 2" não — use `"<rótulo do tipo> · <cobranças>"` e deixe a
distinção para o nome do plano, que já é o título da linha). Sem `planType`, mantém o
comportamento atual. O modal precisa ter acesso à lista de modelos; se ela só existir dentro
de `GuidedPlanFields`, suba o `planType` escolhido para o formulário em vez de buscar o
catálogo de novo. Não alterar `features/patients/order.ts`.

**Testes a criar.** `guided-client-registration.integration.test.tsx`: plano de catálogo
`promotional` na sacola → "Plano pacote · 1 cobrança"; plano sem `planType` → "Plano · 1 cobrança".

**Gate.** Completo.

### RT6 — Acabamento de textos e formatos — prioridade baixa

**Depende de:** RT1, RT2 e RT5 mescladas (mesmos arquivos). Só web; um PR.

1. **Ponto duplo.** `apps/web/src/shared/components/TrialHistoryHint.tsx` (~linha 63): o
   texto termina em `{items}.` e `shortDate` já termina em "." ("14 de nov."). Tirar o ponto
   final do JSX. Resultado: "Já tem aula experimental: Pilates em 14 de nov."
2. **Data truncada no cartão do lead.** `apps/web/src/features/commercial/LeadCard.tsx`
   (~linha 161) e `.lead-message-status > span:first-of-type` em
   `apps/web/src/styles/10-commercial-communications.css` (~linha 571): o texto inteiro
   "Mensagem enviada · <data>" leva reticências e a data some. Separar em dois elementos:
   rótulo "Enviada" (pode truncar) e `<time>` com `flex-shrink: 0` e `white-space: nowrap`.
   Usar tokens (`--space-*`, `--text-*`); nada de px soltos.
3. **Datas do lead com hora.** `apps/web/src/features/commercial/LeadDetailsModal.tsx`
   (~linhas 51 e 239–240): "Cadastrado em" e "Atualizado em" passam a usar `shortDateTime`
   (`apps/web/src/shared/lib/formatting.ts`). Outros usos de `dateText` (ex.: nascimento)
   ficam só com data.
4. **Botão da conversão.** `guidedSubmitLabels`
   (`apps/web/src/features/patients/model.ts`, ~linha 361) serve cliente novo e conversão de
   lead. Na conversão (o `PatientModal` recebe o lead de origem), usar: "Converter e agendar
   aula experimental", "Converter e criar plano", "Converter e criar serviço avulso",
   "Converter e colocar na lista de espera", "Converter em cliente". Cliente novo não muda.
5. **Máscaras.** `apps/web/src/features/patients/PatientRecordTabs.tsx` (~linha 130): CPF com
   `formatCpf`. `apps/web/src/features/trash/TrashModal.tsx` (~linhas 87–91): quando o tópico
   é de clientes ou de leads (o `detail` é telefone), exibir com `formatPhone`. Os dois
   formatadores estão em `@crm/contracts` (`packages/contracts/src/common/model.ts`). Datas e
   nomes em `detail` de outros tópicos não mudam.

**Testes a criar/ajustar.**
- Teste de `TrialHistoryHint` (ou o teste de agenda que já o cobre): texto sem "..".
- `lead-details.integration.test.tsx`: "Cadastrado em" com hora.
- `lead-form-conversion.integration.test.tsx`: botão "Converter e criar plano" na conversão;
  `guided-client-registration.integration.test.tsx`: "Salvar e criar plano" no cliente novo.
- `apps/web/src/features/trash/trash.integration.test.tsx`: telefone do cliente formatado.
- Teste da ficha do cliente: CPF formatado.
- `lead-message-sent.integration.test.tsx`: `<time>` do cartão presente com data e hora.

**Gate.** Completo (o `audit-panels.cjs` confere o CSS do item 2).

### RT7 — Reteste em produção — sem código

Só depois de RT1–RT6 em produção. Não é tarefa de desenvolvimento; é roteiro para quem testa.

Pré-requisitos, criados pelo dono: usuário comum sem CRM; usuário só com `trash.view`; um
evento; uma turma; um lead com todos os dados; um plano "Plano pacote" vendido; uma aula
experimental dentro do período do relatório. Celular: aparelho real ou
`npm run test:e2e` (perfil celular).

Refazer: 7.4, 6.7, 7.1, 9.1, 5.1 e os itens de RT6. Testar o que ficou sem validação: 1.1, 1.2,
2.3, 2.4, 4.11, 6.13, 7.2, 7.7, 8.5, 9.4, 9.5, 10.1–10.6, 10.8, 10.9, 10.11 (com plano pacote),
10.12 e todos os itens de celular. Defeito novo vira tarefa nova.

## 3. Ordem de desenvolvimento

| Ordem | Tarefa | Observação |
|-------|--------|------------|
| 1 | RT1 | Único bloqueio de venda. |
| 2 | RT3 | Pequena, só contrato + um teste web. Pode ir em paralelo à RT1. |
| 3 | RT2 | Toca API (memória e MySQL) e web do CRM. Pode ir em paralelo à RT1 e à RT3\*. |
| 4 | RT4 | Isolada em campanhas. Paralela a qualquer outra. |
| 5 | RT5 | Só depois da RT1 mesclada. |
| 6 | RT6 | Só depois de RT1, RT2 e RT5 mescladas. |
| 7 | RT7 | Com tudo em produção. |

\* RT2 e RT3 editam `packages/contracts/src/commercial/model.ts` em blocos diferentes (RT3 em
`leadMissingRegistrationFields`, RT2 junto de `leadContactInputSchema`). Coloque o código novo
junto do bloco relacionado, não no fim do arquivo; a segunda a mesclar faz
`git merge origin/main` antes do push.

Nenhuma tarefa toca os arquivos quentes do `CLAUDE.md`.

## 4. Limpeza dos dados de teste em produção

Feita pelo dono na tela, depois da RT7 (o reteste reaproveita os dados):
- Usuário Daniel Freitas: desligar "Realiza atendimentos" e remover o profissional
  `TESTE-0001`, se não deveria ficar.
- Excluir: clientes `TESTE Cliente A` (PAC-00002) e `TESTELead2` (PAC-00004 — cancelar antes a
  cobrança de R$ 100,00 em aberto), leads `TESTE Lead 1` e `TESTELead2`, serviço `TESTE
  Pilates`, sala `TESTE Sala`, plano `TESTE Plano Pacote`, etapa `TESTE Etapa`, origem `TESTE
  Origem`.
- Esvaziar a lixeira da Agenda (experimental de `TESTELead2` em 14/11/2026 09:00).
