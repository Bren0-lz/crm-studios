# Plano de correções — 2ª rodada de teste (13/11/2026, 22:56–23:15)

Arquivo autossuficiente: quem executa não tem o contexto da conversa que o gerou. Complementa
`PLANO_CORRECOES_2026-11-13.md` (tarefas RT1–RT7, 1ª rodada). As tarefas daqui usam o prefixo
`RV` e algumas dependem de tarefas `RT`.

## 0. Como usar este plano

- Repositório `bren0-lz/crm-studios` (monorepo npm: `packages/contracts`, `apps/api`, `apps/web`).
  Leia `CLAUDE.md` e `AGENTS.md` antes; as regras de lá valem aqui.
- **Uma tarefa por sessão/PR.** `git fetch origin main`, branch a partir de `origin/main`,
  implementar, gate, diário em `diario/<AAAA-MM-DD>-<ID>.md`, commit em pt-BR (sem
  `Co-Authored-By`), `git fetch origin main && git merge origin/main`, gate de novo, push e PR
  com título `<ID>: <título>`.
- **Gate completo** (todos com exit 0):
  `npm run typecheck && npm run lint && npm test && npm run build && node apps/web/scripts/audit-panels.cjs`
- **Teste focado:** `npm exec -w @crm/web -- vitest run src/<arquivo>.test.tsx` (idem `@crm/api`,
  `@crm/contracts`).
- Nenhuma tarefa deste plano precisa de migração, de dependência npm nova nem de mudança em
  `apps/api`. Se parecer que precisa, marque `BLOCKED` no diário e pare.
- Linhas citadas valem para a `main` em `9ef5ea0`; se o arquivo mudou, localize pelo trecho.
- Na interface, "paciente" é sempre **cliente**. Textos em pt-BR. CSS novo só com tokens
  (`--space-*`, `--text-*`, `--radius-*`), sem `style={{}}`.
- Ao abrir cada tarefa, acrescente-a ao `PLAN.md` na seção
  `## Pedido avulso — Correções do relatório de teste (13/11/2026)` (crie se não existir), no
  formato das vizinhas. Não edite o `STATE.md`.

## 1. Validação do relatório da 2ª rodada

Teste feito em produção, admin, modo responsivo 440×956. Cada item foi conferido no código.

| Item | Veredito | Tarefa |
|------|----------|--------|
| 7.2 Lead nunca fica "completo": conversão sempre abre a etapa de dados faltantes | **Válido, média** | RV1 |
| 9.4 (obs.) Campanha: destinatário pulado por "Sem atendimento agendado", mas o aviso diz "sem WhatsApp liberado" | **Válido, média** | RV2 |
| 1.3 Nome da clínica some do topo no celular | **Válido, baixa** (hoje é escondido de propósito no CSS) | RV3 |
| Celular: 5 botões empilhados antes do calendário da Agenda | Melhoria — precisa de decisão | seção 4 |
| Celular: Agenda com rolagem dupla (página + grade) | Melhoria — precisa de decisão | seção 4 |
| Celular: "Histórico de contratações" com rolagem lateral | Melhoria — precisa de decisão | seção 4 |
| 10.8 DRE fica em Relatórios, não em Financeiro | Não é defeito (roteiro antigo errado; o `ROTEIRO_TESTE_E2E.md` já aponta Relatórios › DRE) | — |
| 10.3 Remover participante/excluir evento mantém a pessoa como lead | Intencional (a tela avisa) | — |

OK nesta rodada: 4.4, 6.1, 7.7, 10.1, 10.2, 10.3, 10.5, 10.8, 11.1. Continuam sem teste: 1.1,
1.2, 2.3, 2.4, 4.11, 9.5 (senha/outros usuários), 9.4 (fila de envio) e 10.9 (sem venda de
produto) — cobertos pelo `ROTEIRO_TESTE_E2E.md` (Blocos 11, 13, 18 e Parte E).

## 2. Tarefas

### RV1 — Cadastro do lead com CPF, endereço e contato de emergência — prioridade média

**Depende de:** RT3 mesclada (mesma função `leadMissingRegistrationFields`).

**Defeito.** CRM comercial › lead › Converter: um lead com todos os campos do cadastro
preenchidos deveria abrir direto o formulário de cliente. Sempre abre a etapa "dados
faltantes" pedindo CPF, Endereço (CEP, rua, número, bairro, cidade/UF) e Contato de
emergência, porque o formulário do lead não tem esses campos.

**Causa.**
- `apps/web/src/features/commercial/LeadConvertModal.tsx` (~linha 23): começa em `"request"`
  quando `leadMissingRegistrationFields(lead).length > 0`
  (`packages/contracts/src/commercial/model.ts`).
- O contrato **já aceita** esses dados no lead: `leadInputSchema` inclui
  `leadPatientProfileSchema` (`cpf`, `whatsapp`, `birthDate`, `emergencyContactName`,
  `emergencyContactPhone`, `emergencyContactWhatsapp` e os campos de endereço de
  `patientProfileSchema`: `postalCode`, `address`, `addressNumber`, `complement`,
  `neighborhood`, `city`, `state`). O backend grava no JSON `profile` do lead (memória e MySQL).
- `apps/web/src/features/commercial/LeadModal.tsx` só mostra: Nome, Telefone, WhatsApp,
  origem/interesse e, em "Mais informações" (~linha 177), E-mail, Nascimento, Responsável,
  Etiquetas e Observações.

**Mudança (só web).**
- No `LeadModal`, novo bloco recolhível `<details className="more-info span-2">` com
  `<summary>Dados para o cadastro de cliente</summary>`, logo depois de "Mais informações",
  fechado no lead novo e aberto na edição quando algum desses campos já tem valor. Campos,
  todos opcionais:
  - CPF: `apps/web/src/shared/components/CpfInput.tsx`;
  - Endereço: CEP, rua, número, complemento, bairro, cidade, UF — reaproveitar a busca de CEP
    e os campos de `apps/web/src/features/patients/PatientProfileFields.tsx` (extraia para um
    componente compartilhado em `shared/components` se o import direto criar dependência
    entre funcionalidades que o lint de arquitetura recuse; o comportamento no cadastro de
    cliente não pode mudar);
  - Contato de emergência: nome, telefone e WhatsApp, com
    `apps/web/src/shared/components/PhoneInput.tsx`.
- O formulário envia e relê esses campos (estado inicial a partir do `lead`; campo vazio vai
  como `""`/ausente conforme o schema já aceita). Validação de CPF e telefone com as mesmas
  mensagens do cadastro de cliente.
- `LeadDetailsModal.tsx`: mostrar os campos novos quando preenchidos (endereço em uma linha,
  emergência em outra), seguindo o padrão `Detail` já usado (só campos preenchidos aparecem).
- `LeadConvertModal`: sem mudança de regra. Com tudo preenchido,
  `leadMissingRegistrationFields` devolve `[]` e o modal abre direto em `"form"`.
- Não tornar nenhum campo obrigatório no lead. Não mexer na importação de leads.
- CSS: reaproveitar `more-info`, `form-grid`; qualquer grid novo de 2+ colunas precisa de
  regra de 1 coluna em `@media (max-width: 700px)`.

**Testes a criar.**
- `apps/web/src/features/commercial/lead-form-conversion.integration.test.tsx`:
  1. editar lead, abrir "Dados para o cadastro de cliente", preencher CPF, endereço completo e
     emergência (nome, telefone, WhatsApp), salvar → o corpo do `PUT /leads/:id` traz todos os
     campos;
  2. lead com tudo preenchido (nome com 2 palavras, CPF, WhatsApp, e-mail, nascimento, endereço
     completo, emergência completa) → clicar em Converter abre **direto** o formulário de
     cliente, sem a etapa de dados faltantes;
  3. lead sem CPF → continua abrindo a etapa de dados faltantes com "CPF" na lista.
- `lead-details.integration.test.tsx`: lead com endereço e emergência mostra os dois blocos;
  lead sem eles não mostra rótulos vazios.
- CPF inválido no formulário do lead → mensagem no campo e nada é enviado.
- Se extrair componente de endereço: os testes existentes de
  `apps/web/src/features/patients/guided-client-registration.integration.test.tsx` continuam
  verdes sem alteração de asserção.

**Gate.** Completo.

### RV2 — Campanha: motivo certo quando ninguém pode receber — prioridade média

**Depende de:** RT4 mesclada (mesmo arquivo e mesmos textos; a RT4 cria o substantivo por
público: "clientes"/"leads"/"pessoas").

**Defeito.** Comunicações › Nova campanha › modo "Escolher clientes" com um lead cuja
mensagem usa `{{data_atendimento}}`: o lead é pulado por "Sem atendimento agendado", mas o
resumo afirma "Nenhum cliente escolhido tem WhatsApp liberado". O mesmo texto fixo aparece no
modo por filtros.

**Causa.** `apps/web/src/features/communications/campaigns/NewCampaignModal.tsx`: três textos
assumem que todo pulado é por falta de WhatsApp —
- ~linha 130: `… será pulado/serão pulados (sem WhatsApp liberado)`;
- ~linha 174: `Nenhum dos clientes encontrados tem WhatsApp liberado.`;
- ~linha 708: `Nenhum cliente escolhido tem WhatsApp liberado. Volte e ajuste os clientes.`

Cada pulado já vem com o motivo (`preview.skipped[].reason`), com rótulos em
`broadcastSkipReasonLabels` (`packages/contracts/src/communications/model.ts`): `opt_out` "Não
autorizou mensagens neste canal", `no_destination` "Sem contato cadastrado para o canal",
`message_too_long` "Mensagem passa de 500 caracteres com o nome", `no_appointment` "Sem
atendimento agendado".

**Mudança (só web).** Helper local que resume os motivos de `preview.skipped`:
- todos com o **mesmo** motivo → usa o rótulo desse motivo em minúsculas na frase;
- motivos diferentes → texto genérico "veja os motivos abaixo" (a lista detalhada de pulados
  com o motivo de cada um já existe em `<details className="campaign-skipped">`).

Textos resultantes (substantivo conforme a RT4):
- contagem: `· 1 será pulado (sem atendimento agendado)` ou, com motivos mistos,
  `· 3 serão pulados (motivos abaixo)`;
- ninguém pode receber, modo filtros: `Nenhum dos leads encontrados pode receber esta
  mensagem: sem atendimento agendado.` (ou `…: veja os motivos abaixo.`);
- ninguém pode receber, modo escolher: `Nenhuma das pessoas escolhidas pode receber esta
  mensagem: <motivo>. Volte e ajuste a lista ou a mensagem.`

Se o modo por filtros não exibir a lista de pulados com motivos, exibir o mesmo
`<details className="campaign-skipped">` também ali. `CampaignFiltersModal.tsx` só mostra a
contagem e não muda.

**Testes a criar.** Em `apps/web/src/features/communications/campaigns.integration.test.tsx`:
1. prévia com 1 pulado `no_appointment` e 0 destinatários → texto contém "sem atendimento
   agendado" e **não** contém "WhatsApp liberado";
2. prévia com pulados `opt_out` e `no_destination` → texto genérico com "motivos abaixo" e a
   lista mostra os dois rótulos;
3. prévia com 2 pulados `no_destination` e 1 destinatário → contagem com o motivo único.
Ajustar asserções antigas que esperavam "(sem WhatsApp liberado)".

**Gate.** Completo.

### RV3 — Nome da clínica visível no celular — prioridade baixa

**Defeito.** Em largura de celular a barra do topo mostra só menu, SOS e sino; o nome
"Studios Aryana" some.

**Causa.** `apps/web/src/styles/11-responsive.css` (~linha 166), dentro do bloco de celular:
`.clinic-label { display: none; }`. O elemento é `<span className="clinic-label">` em
`apps/web/src/app/Shell.tsx` (~linha 231), dentro de `.topbar-context`.

**Mudança (só CSS).** Remover o `display: none` e, no mesmo bloco de celular, deixar o nome
em uma linha com reticências: `.topbar-context { min-width: 0; flex: 1 1 auto; }` e
`.clinic-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size:
var(--text-sm); }`. Os botões de `.top-actions` não podem encolher nem quebrar linha
(`flex-shrink: 0`). Conferir com seletor de filial visível (clínica com mais de uma filial):
o nome cede espaço e os botões continuam inteiros. Sem rolagem horizontal em 360px.

**Testes.**
- Se existir teste do shell que afirme o nome escondido no celular
  (`apps/web/src/app/shell-navigation.integration.test.tsx`, `e2e/shell-navigation.spec.ts`
  ou `e2e/navigation.spec.ts`), ajustar para o nome visível.
- Criar/estender um caso no e2e de navegação, perfil celular: o texto "Studios Aryana" está
  visível no topo e `document.documentElement.scrollWidth <= clientWidth`. Rodar
  `npm run test:e2e` além do gate.

**Gate.** Completo + `npm run test:e2e`.

## 3. Ordem de desenvolvimento

Considerando também as tarefas RT do primeiro plano:

| Ordem | Tarefa | Observação |
|-------|--------|------------|
| 1 | RT1, RT3, RT2, RT4 | Como no primeiro plano. |
| 2 | **RV3** | Independente de tudo; pode ir em paralelo desde já. |
| 3 | **RV1** | Depois da RT3 mesclada. Toca `LeadModal.tsx` e `LeadDetailsModal.tsx`; a RT6 também toca `LeadDetailsModal.tsx` — não abrir as duas ao mesmo tempo. |
| 4 | **RV2** | Depois da RT4 mesclada. |
| 5 | RT5, RT6 | Como no primeiro plano; RT6 depois da RV1. |
| 6 | Reteste | `ROTEIRO_TESTE_E2E.md`, acrescido dos passos da seção 5. |

Nenhuma tarefa toca os arquivos quentes do `CLAUDE.md`.

## 4. Pendente de decisão do dono (não implementar)

Melhorias de celular apontadas como observação. Cada uma com a proposta, para aprovar ou não:

| # | Observação | Proposta |
|---|------------|----------|
| M1 | Agenda: cinco botões empilhados (Concluídos, Compartilhar agenda, Nova nota, Bloquear horário, Novo atendimento) ocupam a primeira tela | No celular, manter "Novo atendimento" visível e juntar os outros quatro num menu "Mais" (mesmo padrão do "Mais" de Clientes) |
| M2 | Agenda: rolagem dupla (página + grade) | No celular, a grade ocupa a altura restante da tela e só ela rola |
| M3 | Relatórios › Vendas › "Histórico de contratações": rolagem lateral para ver Tipo/Movimento/Valor | No celular, cada linha vira cartão empilhado (rótulo + valor), sem rolagem lateral |

## 5. Passos de reteste a acrescentar ao `ROTEIRO_TESTE_E2E.md`

- **[8.13b] (RV1)** Editar `TESTE Lead Um` › "Dados para o cadastro de cliente": preencher
  CPF, endereço e emergência (nome, telefone, WhatsApp); salvar; Converter. → Abre direto o
  formulário de cliente, pré-preenchido, sem a etapa de dados faltantes.
- **[11.6b] (RV2)** Campanha no modo "Escolher clientes" só com um lead sem atendimento,
  usando mensagem com `{{data_atendimento}}`. → Aviso cita "sem atendimento agendado"; nada de
  "WhatsApp liberado". Não criar a campanha.
- **[Parte E, celular] (RV3)** Nome "Studios Aryana" visível no topo em 390px, sem rolagem
  horizontal.

## 6. Dados de teste desta rodada (limpeza pelo dono)

- Lead `TESTE Participante` (etapa Novos, origem "Evento: TESTE Evento").
- Planilha de participantes baixada na pasta Downloads do computador usado no teste.
- O evento `TESTE Evento` já foi excluído.
