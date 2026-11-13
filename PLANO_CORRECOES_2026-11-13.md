# Plano de correções — relatório de teste de 13/11/2026 (PRs 09–13/11)

Origem: relatório do Claude in Chrome em `https://crm.organizastudios.com` (13/11/2026, 19:59–20:37).
Cada item foi conferido contra o código da `main` em `9ef5ea0`. Nada foi desenvolvido: este
arquivo é só planejamento. Os IDs `RT1`…`RT9` são sugestão (prefixo livre no `PLAN.md`).

## 1. Validação do relatório

Legenda: **Válido** = defeito confirmado no código · **Parcial** = parte procede · **Por
decisão** = comportamento intencional, só muda se o dono quiser · **Não é defeito**.

### 1.1 Falhas

| Item | Veredito | Causa confirmada no código |
|------|----------|----------------------------|
| 7.4 Venda "Pacote fixo" falha no cadastro guiado | **Válido — Alta** | Ver 2.1. Não é o modelo "Pacote fixo" que falha: é todo plano do catálogo do tipo **Plano pacote** (`promotional`). |
| 6.7 Sem "Sem resposta"; ligação vira "Mensagem enviada" | **Válido — Média** | Ver 2.2. |
| 9.1 Campanha "Só leads": resumo diz "clientes"; sem filtro de etiquetas | **Parcial — Baixa** | Texto: válido. Filtro de etiquetas: existe, mas some quando nenhum lead tem etiqueta. Ver 2.3. |
| 5.1 Sacola não mostra "Plano pacote" | **Parcial — Baixa** | A sacola nunca usou o rótulo do tipo; mostra o rótulo genérico do bloco. Ver 2.4. |

### 1.2 Observações

| Item | Veredito | Evidência |
|------|----------|-----------|
| 2.2 Senha do admin com 3 caracteres | **Válido (segurança)** | `passwordSchema` em `packages/contracts/src/administration/model.ts:116` aceita `min(1)`. Não há tamanho mínimo. |
| 7.1 Mensagem de dados faltantes sem WhatsApp de emergência | **Válido** | `packages/contracts/src/commercial/model.ts:109-112` só confere nome e telefone; a conversão exige `emergencyContactWhatsapp` desde o #354. |
| 8.4 Ponto duplo "14 de nov.." | **Válido** | `apps/web/src/shared/components/TrialHistoryHint.tsx:63`: `shortDate` já termina em "." e o texto acrescenta outro. |
| 6.5 Data truncada no cartão do lead | **Válido** | `10-commercial-communications.css:571`: o `span` do texto tem `text-overflow: ellipsis` e a data fica no fim. |
| 6.9 Datas sem hora nos detalhes do lead | **Válido** | `LeadDetailsModal.tsx:51` usa `shortDate` (sem hora) em "Cadastrado em"/"Atualizado em". |
| 6.11 "Observações: Sem observações" sem campo no modal de perda | **Válido (baixa)** | `LeadLostModal.tsx` só pede o motivo; as observações exibidas são as do cadastro do lead. |
| 6.7/hover Painel de histórico cobre os botões do cartão | **Válido (baixa)** | `LeadCard.tsx:137-138` abre no `mouseenter` do invólucro; o painel fica sobre as ações. |
| 7.4 Botão "Salvar e criar plano" na conversão | **Válido (baixa)** | `guidedSubmitLabels` (`features/patients/model.ts:361`) é o mesmo para cliente novo e conversão. |
| CPF/telefone sem máscara (ficha e lixeira) | **Válido (baixa)** | `PatientRecordTabs.tsx:130` mostra `patient.cpf` cru; a lixeira mostra `detail` (telefone) cru em `TrashModal.tsx:87-91`. |
| "0 sessões disponíveis" com plano recorrente ativo | **Por decisão, texto confuso** | `planHasSessionBalance` exclui recorrente (sem saldo). O card soma só planos com saldo. |
| 10.11 Sem barra "N de M usadas" no recorrente | **Não é defeito** | `planSessionProgress` devolve "Sem limite de sessões" para recorrente. Retestar com pacote depois da RT1. |
| 4.8 Aceita "excluir" em minúsculas | **Por decisão** | `PurgeConfirmModal.tsx:37` faz `toUpperCase()` de propósito. |
| 3.4 Sexta-feira Santa como "Nacional" | **Não é defeito** | `agenda/holidays.ts:83` marca como feriado (não facultativo). O roteiro está errado. |
| 4.2 SOS global não pré-seleciona o cliente da ficha | **Por decisão** | `EmergencyButton.tsx` começa com `patientId` vazio. Melhoria opcional. |
| 4.9 Excluir plano só em Planos e sessões | **Por decisão** | Cartão do plano na ficha tem só Extrato e Cancelar (`PatientRecordTabs.tsx:552-562`). Melhoria opcional. |
| 6.1 Hex só pelo seletor nativo | **Por decisão** | `StageColorWheel.tsx:240` usa `input type="color"`. Melhoria opcional. |
| Toast com o 1º nome | **Não é defeito** | `patientFirstName()` é intencional; o nome de teste começava por "TESTE". |
| 8.5 Card "Aulas experimentais" | **Inconclusivo** | Sem experimental no período. Retestar. |

### 1.3 Cobertura

43 OK, 4 falhas, 21 não testados. Os 21 não testados seguem sem validação: login/senha (1.1,
1.2, 2.3), usuário não admin (2.4, 4.11, 9.5), upload (6.13), eventos (7.7, 10.2, 10.3), fila de
envio (9.4), exportação (10.1), Telegram (10.4), DRE (10.8), turmas (10.12) e todo o celular
(1.3, 4.4, 6.1, 10.5, 10.9, 11.1). Ver seção 5.

## 2. Problemas confirmados — detalhe

### 2.1 Plano do tipo "Plano pacote" não vende pelo cadastro guiado (7.4)

- `planTypeKind("promotional")` devolve `"custom"` (`packages/contracts/src/plans/model.ts:89-97`).
- `GuidedPlanFields.tsx:158` copia esse `kind` para o formulário ao escolher o plano do catálogo.
- O seletor "Modelo" do `PatientModal.tsx:1416` só tem `fixed_package` e `recurring`
  (`guidedPlanKinds`). Com valor `custom`, o navegador exibe a primeira opção ("Pacote fixo"),
  mas o estado continua `custom`. Por isso o relatório fala em "Pacote fixo".
- `guidedSubscriptionPlanSchema` (`packages/contracts/src/patients/model.ts:451`) só aceita
  `recurring` ou `fixed_package` → 400 "Opção inválida.".
- Alcance: cliente novo e conversão de lead (#353/#351), para **todo** plano de catálogo com
  tipo "Plano pacote". A venda pela ficha (`PlanForm`, schema com `planKindSchema`) aceita `custom`.
- Não há teste cobrindo plano `promotional` no cadastro guiado (web nem API).
- A mensagem "Opção inválida." não diz qual campo falhou.

### 2.2 Registro de contato do lead (6.7)

- `LeadActivityModal.tsx:421-436`: o formulário não tem campo para `reached`. O contrato
  (`leadContactInputSchema.reached`) e a linha do tempo (`LeadContactTimeline.tsx:62`) já
  suportam "Sem resposta"; só o modal de eventos (`EventContactModal.tsx`) grava `reached: false`.
- `LeadContactTimeline.tsx:5`: direção `outbound` sempre vira "Mensagem enviada", mesmo com
  canal Telefone ou Presencial.
- `LeadMessageSummary` (`LeadActivityModal.tsx:36`) e a faixa do `LeadCard` contam todo
  `outbound` como "envio" — ligação e tentativa sem resposta entram na conta.

### 2.3 Campanha para leads (9.1)

- `NewCampaignModal.tsx:103-175` e `CampaignFiltersModal.tsx:39-61`: todos os textos dizem
  "clientes", inclusive com público "Só leads" ou "Incluir leads".
- `LeadAudienceFields.tsx:140`: o filtro "Etiquetas do lead" existe, mas `Choices` devolve
  `null` com lista vazia. Na base testada nenhum lead tinha etiqueta, então o filtro sumiu.

### 2.4 Sacola (5.1)

- `PatientModal.tsx:444-475`: `detail` usa `planLabel()` ("Plano"/"Plano 2"), não o tipo do
  plano do catálogo. `planTypeLabels` só é usado em `PlanForm`, `PlanTemplateModal` e
  `PlanTemplatesContent`.

## 3. Decisões que o dono precisa tomar antes

| # | Pergunta | Recomendação |
|---|----------|--------------|
| D1 | "Plano pacote" no cadastro guiado vende como quê? (a) aceitar `custom` no schema guiado, igual à venda pela ficha; (b) converter para `fixed_package`, que agenda sessões em dias fixos até acabar o pacote. | **(a)**: mantém o mesmo plano igual nos dois caminhos de venda e não muda dado já gravado. O seletor "Modelo" ganha a opção "Personalizado" quando o catálogo define o tipo. |
| D2 | Tamanho mínimo de senha? Vale só para senha nova ou obriga troca das atuais? | Mínimo 8, só para senha nova/troca. A senha do Daniel Freitas é trocada à mão já. |
| D3 | Na direção "Realizado", o resumo "N envios" conta ligações e tentativas sem resposta? | Não: "envio" só para canal de mensagem com `reached !== false`; o total de contatos continua contando tudo. |
| D4 | Entram as melhorias opcionais (SOS com cliente da ficha, Excluir plano na ficha, campo hex, observação no modal de perda)? | Só a observação no modal de perda (RT8). As outras ficam fora. |
| D5 | Card "sessões disponíveis" com plano recorrente: manter a regra e ajustar o texto? | Manter a regra; rótulo "sessões disponíveis em pacotes". |

Sem resposta a D1 e D2, RT1 e RT2 ficam `BLOCKED` (regra do `CLAUDE.md`: ambiguidade não se
resolve por chute).

## 4. Tarefas

Todas: gate completo do `CLAUDE.md`, um PR por tarefa a partir da `origin/main` atual, diário
em `diario/<data>-<ID>.md`. Nenhuma precisa de migração.

### RT1 — Plano pacote no cadastro guiado (7.4) — Alta

- **Escopo (com D1 = a):** `guidedSubscriptionPlanSchema` aceita `custom`
  (`packages/contracts/src/patients/model.ts`); conferir `guidedSales`/`guided-plans.ts` e os
  dois repositórios (`storage/memory/patients.ts`, `storage/mysql/patients.ts`) para `custom`
  seguir o mesmo caminho da venda pela ficha (sem agenda de pacote fixo: `planPackageSessions`
  já devolve `undefined`). Web: `guidedPlanKinds` e o seletor "Modelo" do `PatientModal`
  mostram o valor real do formulário — nunca um valor fora das opções.
- **Testes:** API (`modules/patients/*.integration.test.ts`, memória e MySQL) vendendo plano
  de catálogo `promotional` em `POST /patients/guided`, cliente novo e conversão de lead; web
  (`guided-client-registration.integration.test.tsx`) escolhendo plano `promotional` e
  conferindo o `kind` enviado; contrato em `contracts.unit.test.ts`.
- **Arquivos quentes:** nenhum. Rodar `npm run test:mysql` (toca `storage/mysql`).
- **Depende de:** D1.

### RT2 — Tamanho mínimo de senha (2.2) — Alta (segurança)

- **Escopo (com D2):** `passwordSchema` com mínimo 8 e mensagem pt-BR; vale em criar usuário,
  redefinir (`passwordResetSchema`) e trocar a própria senha (`newPassword`). O login
  (`password: z.string().nonempty()`) não muda, para senhas antigas continuarem entrando.
  Dica de tamanho nos formulários (`field-hint`). Dados demo e fixtures com senha curta
  acompanham.
- **Testes:** contrato (recusa 7, aceita 8); API de usuários e de troca de senha; web do modal
  "Senha de acesso".
- **Ação manual, fora do código:** trocar agora a senha do admin Daniel Freitas.
- **Depende de:** D2.

### RT3 — Contato do lead: "Sem resposta" e rótulo por canal (6.7) — Média

- **Escopo:** `LeadActivityModal`: campo "Conseguiu falar?" (Sim/Não) quando a direção é
  "Realizado", gravando `reached` (mesmo padrão do `EventContactModal`). `LeadContactTimeline`:
  rótulo de `outbound` pelo canal ("Mensagem enviada" para WhatsApp/e-mail/SMS; "Ligação
  realizada" para telefone; "Contato realizado" para os demais). `LeadMessageSummary`, faixa do
  `LeadCard` e `lead-contact-history.ts`: "envio" conforme D3. Só web — o contrato e os
  repositórios já guardam `reached` e `channel`.
- **Testes:** `features/commercial/*.integration.test.tsx` (registrar ligação sem resposta;
  selo e contagem).
- **Depende de:** D3.

### RT4 — Dados faltantes do lead incluem WhatsApp de emergência (7.1) — Média

- **Escopo:** `packages/contracts/src/commercial/model.ts:109-112`: o item de emergência só
  some com nome, telefone **e** WhatsApp preenchidos; o rótulo lista o que falta ("Contato de
  emergência (nome, telefone e WhatsApp)"). Conferir a mensagem gerada para o lead.
- **Testes:** `contracts.unit.test.ts` e o teste web da conversão.
- **Motivo da prioridade:** hoje a mensagem diz que está completo e a conversão recusa depois.

### RT5 — Textos de campanha para leads e filtro de etiquetas sempre visível (9.1) — Baixa

- **Escopo:** `NewCampaignModal` e `CampaignFiltersModal`: substantivo conforme o público —
  "clientes", "leads" ou "pessoas" (misto) — em contagem, busca, vazios e `aria-label`.
  `LeadAudienceFields`: "Etiquetas do lead" aparece mesmo vazio, com
  `field-hint` "Nenhum lead tem etiqueta ainda." (os outros filtros mantêm o comportamento).
- **Testes:** `features/communications/campaigns/*.integration.test.tsx`.

### RT6 — Sacola mostra o tipo do plano (5.1) — Baixa

- **Escopo:** `PatientModal.tsx:444-475`: `detail` usa `planTypeLabels[template.planType]`
  quando o plano veio do catálogo com tipo; sem tipo, mantém "Plano"/"Plano N". Sem mudança em
  `order.ts`.
- **Testes:** `guided-client-registration.integration.test.tsx`.
- **Depende de:** RT1 (mesmo arquivo `PatientModal.tsx`; não abrir os dois PRs em paralelo).

### RT7 — Acabamento de textos e formatos — Baixa

Um PR, só web:
- 8.4: tirar o ponto duplo em `TrialHistoryHint.tsx:63`.
- 6.5: no `LeadCard`, a data não pode sumir — encurtar o rótulo ("Enviada · 13 de nov. às
  14:32") ou truncar só o rótulo, não o `<time>`.
- 6.9: "Cadastrado em"/"Atualizado em" com `shortDateTime` em `LeadDetailsModal.tsx`.
- 7.4: `guidedSubmitLabels` próprio para conversão ("Converter e criar plano" etc.).
- Máscaras: `formatCpf` na ficha (`PatientRecordTabs.tsx:130`) e `formatPhone` no `detail` de
  cliente/lead da lixeira (`TrashModal.tsx`).
- D5: rótulo do card em `PlansPage.tsx:193`.
- **Testes:** ajustar os testes web que leem esses textos.
- **Depende de:** RT1 e RT6 (`PatientModal.tsx`/`model.ts` de clientes), RT3 (`LeadCard.tsx`).

### RT8 — Usabilidade do cartão e do modal de perda — Baixa (opcional, D4)

- **Escopo:** painel de histórico do `LeadCard` não cobre as ações do cartão (abrir só no
  hover/foco da faixa de mensagem, ou posicionar fora da área dos botões). `LeadLostModal`:
  campo opcional "Observações" gravado nas observações do lead — só se já houver campo para
  isso no contrato; se exigir campo novo, marcar `BLOCKED` e perguntar.
- **Testes:** `features/commercial/*.integration.test.tsx`.
- **Depende de:** RT3 e RT7 (`LeadCard.tsx`).

### RT9 — Reteste do que ficou sem validação — sem código

Ver seção 5. Defeito novo vira tarefa nova; não entra nas RT acima.

## 5. Reteste (RT9)

Pré-requisitos que o teste anterior não tinha:
1. Usuários de teste criados à mão pelo dono: um comum sem CRM, um só com `trash.view`.
2. Um evento, uma turma e um lead com todos os dados preenchidos.
3. Um plano **pacote** vendido (depois da RT1) e uma experimental **dentro** do período do relatório.
4. Celular: usar o Playwright do projeto (`npm run test:e2e`, perfil celular) ou um aparelho
   real — a janela do Chrome não redimensionou.

Itens: 1.1, 1.2, 2.3, 2.4, 4.11, 6.13, 7.2, 7.7, 8.5, 9.4, 9.5, 10.1–10.6, 10.8, 10.9, 10.11,
10.12 e todos os 📱. Refazer também 7.4, 6.7, 9.1 e 5.1 depois das correções.

## 6. Ordem de desenvolvimento

| Ordem | Tarefa | Por quê nesta posição |
|-------|--------|-----------------------|
| 0 | Trocar a senha do admin; responder D1–D5 | Ação imediata, sem código. Destrava RT1–RT3. |
| 1 | **RT1** | Único bloqueio de venda. Destrava o reteste de 10.11. |
| 2 | **RT2** | Segurança. Independente da RT1: pode ir em paralelo (arquivos diferentes). |
| 3 | **RT4** | Pequena, só contrato; evita conversão recusada depois da mensagem "completa". Paralela à RT1/RT2. |
| 4 | **RT3** | Corrige o histórico comercial. Paralela à RT1/RT2/RT4. |
| 5 | **RT5** | Isolada no módulo de campanhas. Paralela a qualquer outra. |
| 6 | **RT6** | Depois da RT1 mesclada (`PatientModal.tsx`). |
| 7 | **RT7** | Depois de RT1, RT3 e RT6 mescladas (mexe nos mesmos arquivos). |
| 8 | **RT8** | Opcional; depois da RT7. |
| 9 | **RT9** | Com tudo em produção. |

Paralelismo seguro: {RT1, RT2, RT3, RT4, RT5} podem estar abertos ao mesmo tempo — não
compartilham arquivo nem tocam arquivo quente. RT6 → RT7 → RT8 são sequenciais.

## 7. Limpeza dos dados de teste (produção)

Feita pelo dono na tela, não por código:
- Usuário Daniel Freitas: desligar "Realiza atendimentos" e remover o profissional `TESTE-0001`,
  se não deveria ficar.
- Excluir: clientes `TESTE Cliente A` (PAC-00002) e `TESTELead2` (PAC-00004, com cobrança de
  R$ 100,00 em aberto — cancelar antes), leads `TESTE Lead 1` e `TESTELead2`, serviço
  `TESTE Pilates`, sala `TESTE Sala`, plano `TESTE Plano Pacote`, etapa `TESTE Etapa`, origem
  `TESTE Origem`.
- Esvaziar a lixeira da Agenda (experimental de `TESTELead2` em 14/11/2026 09:00).
- Só depois da RT9, para o reteste reaproveitar os dados.
