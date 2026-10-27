# Plano de unificação dos PRs abertos — CRM Aryana

> Base: revisão dos 16 PRs abertos (#126 a #141) contra a `main` (`a8e69e8`) e o quadro do Trello
> **CRM Aryana** (https://trello.com/b/x6iyIw1F/crm-aryana), lido em 26/10/2026.
> Objetivo: juntar os PRs com ideias parecidas **mantendo o que cada um tem de bom**, guiado
> pelo que está escrito nos cards.

---

## 1. De onde vem cada PR (card do Trello → PR)

| Card do Trello (lista) | PR(s) | Situação |
|---|---|---|
| #65 Despesas fixas: valor variável, aviso de dias antes, **folha de pagamento** + verificar comissão (Fazendo) | **#137** e **#141** | Dois PRs para o mesmo card → **unir** |
| #68 Remover campo de estoque mínimo (Fazendo) | **#126** | Conflita com #127 → **unir** |
| #69 Tamanhos de produto (PP…GG, único, baby look) (Fazendo) | **#127** | Conflita com #126 → **unir** |
| #71 Relatórios: tudo que entrou/saiu, por profissional, pró-labore, filtros, filiais (Fazendo) | **#133** | Depende do #138 |
| #80 Uma permissão para cada exportação/importação de planilha (Fazendo) | **#138** | Precisa cobrir a planilha nova do #133 → **unir** |
| #52 Dia preferido de vencimento (1º pagamento proporcional) (Fazendo) | **#130** | Mesmo formulário de #129/#131/#136 → **unir em sequência** |
| #53 Modal para configurar o desconto (Fazendo) | **#129** | idem |
| #54 Múltiplos planos no modal inicial do cliente (Fazendo) | **#131** | idem |
| #85 Parcelas por pagamento nas configurações (Fazendo) | **#136** | idem |
| #83 Comprovante de pagamento ao pagar a parcela (Fazendo) | **#134** | Divide o `SettleModal` com #136 → **alinhar** |
| #86 Mensagem do Pix com os modelos verdes (Fazendo) | **#128** | Divide o editor com #139 → **alinhar** |
| #78 Aba de campanhas automáticas com liberdade de edição (Fazendo) | **#139** | idem |
| #75 Fornecedor: datas, valores, pedidos, pagamento, contratos, telefone e WhatsApp (Fazendo) | **#132** | Independente (ver ponte com #136) |
| #59 Aba para criar modelos de prontuário (Fazendo) | **#135** | Independente |
| #50 Botão de WhatsApp para enviar contrato com link de assinatura (A fazer) | **#140** | Independente (o card ainda está em "A fazer") |

---

## 2. Grupos para unificar

### Grupo A — Despesas fixas, avisos e folha de pagamento (#137 + #141) · card #65

**O que o card pede:** (1) despesa fixa de valor fixo **ou** variável; (2) aviso N dias antes do
vencimento; (3) **folha de pagamento** com salário fixo + comissão; (4) na descrição: **verificar a
comissão** quando a regra muda no meio do mês.

**O que cada PR tem de melhor**

| Tema | #141 | #137 | Fica no unificado |
|---|---|---|---|
| Modelo de dados | `amount_type` ('fixed'/'variable') + `payables.amount_pending` | `variable_amount` (bool) + `payables.amount_estimated` | **#141** (enum é extensível) |
| Pagar sem o valor real | Bloqueia (`PAYABLE_AMOUNT_PENDING`) | Deixa pagar o estimado | **#141**, com a mensagem/rótulo "Valor estimado" do #137 na lista |
| Conta vencida e não paga | Continua no sino | **Some do sino** (bug) | **#141** |
| Mês seguinte ainda não gerado | Avisa | Avisa | Igual |
| Antecedência | 0 a 30 dias | 0 a 28 dias | 0 a 30 (#141) |
| Editar despesa fixa | Sim | Sim | Igual |
| Bloco "Avisos de vencimento" dentro de Despesas fixas | Mostra na linha | Bloco próprio com "Vence em N dias" e "Informar valor" | **Os dois**: linha do #141 + bloco do #137 no topo da seção |
| Informar valor | Qualquer conta de despesa fixa | Só a conta variável | **#137** (só variável) — evita mudar o valor de conta fixa por engano |
| **Folha de pagamento** | — | Aba nova, colaboradores, salário + comissões, permissões `finance.payroll_view/manage` | **PR separado** (seção 8) |
| Verificar comissão (descrição do card) | — | — | **Nenhum fez** → PR próprio (seção 7) |

**Como unir (passo a passo)** — atualizado com as decisões da seção 5
1. Partir do branch do **#141** (`claude/determined-tesla-8xtz9r`), que tem as regras de aviso corretas
   e **só deixa pagar pelo valor real** (decisão 2).
2. Trazer do **#137** (`claude/amazing-gauss-nquqqo`) o bloco "Avisos de vencimento" e o rótulo
   "Valor estimado" (só exibição/previsão), adaptando para `amountPending`.
3. **A folha de pagamento não entra aqui:** vai para um PR separado (decisão 5, seção 8).
4. Ajustes que nenhum dos dois fez:
   - registrar na auditoria a troca do valor do mês;
   - ao mudar uma despesa de fixa para variável, marcar como pendente a conta do mês ainda aberta (ou perguntar na tela).
5. **Recálculo de comissão retroativa (descrição do card #65)**: PR próprio, com a regra da **seção 7**
   (recalcula todas no período coberto pela nova data, e as já pagas geram ajuste).

**Ideia para depois (card #70 "Vale para funcionário")**: a folha do #137 é o lugar natural para o
vale: lançamento por colaborador, recibo assinado e desconto na competência escolhida. Pode
aproveitar a assinatura por link do #140.

---

### Grupo B — Estoque: remover mínimo + tamanhos (#126 + #127) · cards #68 e #69

**Conflito:** o #126 apaga `minimum_stock`; o #127 mantém o alerta de estoque mínimo pelo total.
Os dois cards estão em "Fazendo", então a intenção é **ter tamanhos E não ter estoque mínimo**.

**Como unir**
1. Mergear o **#126** primeiro (é pequeno: 1 migração, sem a coluna, "Sem estoque" = saldo zerado).
2. Rebasear/atualizar o **#127** em cima dele:
   - tirar `minimum_stock`/`minimumStock` de todas as consultas, do `productInputSchema` e da tela
     (o #127 ainda tem ~40 referências);
   - renumerar as migrações do #127 para **depois** da do #126 (ex.: 0102 tamanhos, 0103 estoque por tamanho).
3. Juntar as duas ideias na regra de alerta:
   - "Sem estoque" no produto = **total** zerado (regra do #126);
   - **novo**: com tamanhos, mostrar "Esgotado: P, GG" na lista de estoque (tamanho configurado com saldo 0). Assim a ideia de alerta do #127 fica, mas sem o campo de mínimo.
4. Melhoria sugerida no #127: ação "Distribuir estoque sem tamanho" para mover o saldo antigo
   (sem tamanho) para os tamanhos, em vez de obrigar uma saída e depois uma entrada.

---

### Grupo C — Relatório financeiro + permissões de planilha (#133 + #138) · cards #71 e #80

**Conflito:** o #133 usa `reports.export` para o CSV do extrato; o #138 apaga essa permissão e cria
uma por planilha. O card #80 pede exatamente **uma permissão por exportação**.

**Como unir**
1. Mergear o **#138** primeiro.
2. No **#133**, criar `reports.financial_export` ("Exportar planilha do relatório financeiro"),
   dependente de `reports.dre` (mesmo padrão `reportSpreadsheetExports` do #138), e somar na
   migração do #138: quem tinha `reports.export` + `reports.dre` ganha também `reports.financial_export`.
3. Trocar o CSV montado no navegador por uma rota `GET /reports/financial/export` protegida por
   essa permissão. Hoje a permissão só esconde o botão.
4. Do card #71 ("pesquise como grandes empresas fazem", "extremamente detalhada"): o #133 já segue
   Omie/QuickBooks. Falta limitar o período (ex.: até 12 meses) para não carregar o financeiro
   inteiro a cada consulta.

---

### Grupo D — Venda de plano no cadastro do cliente (#129 + #130 + #131 + #136) · cards #52, #53, #54, #85

Os quatro mexem no mesmo fluxo (Novo cliente → plano → cobrança Pix) e nos mesmos arquivos
(`PatientModal.tsx`, `GuidedPlanFields.tsx`, `PlanForm.tsx`, `guided-client-registration`).
A ideia é tratar a venda de **cada item** (plano ou avulso) sempre do mesmo jeito:

```
item do cadastro (plano principal, plano adicional ou avulso)
  ├─ desconto do cliente (#129) .......... decidir se aplica (pergunta 1)
  ├─ 1º pagamento proporcional (#130) .... só recorrente com turma, calculado NO SERVIDOR
  ├─ limite de parcelas (#136) ........... forma de pagamento × plano do catálogo
  └─ cobrança Pix única (#131) ........... soma dos itens pagos no Pix
```

**Ordem de merge sugerida e o que ajustar em cada um**
1. **#136 (parcelamento)** primeiro, porque é a regra de validação que os outros precisam respeitar.
   - Ajuste: buscar o plano do catálogo pelo próprio plano/serviço, sem depender do `planTemplateId` enviado pelo navegador.
2. **#131 (vários planos)** em cima do #136.
   - Ajuste: chamar `assertInstallmentsAllowed` para **cada** item de `additionalPlans`, não só para o principal.
3. **#130 (1º pagamento proporcional)** em cima do #131.
   - Ajuste obrigatório: o servidor **recalcula** `firstInstallmentInCents` com
     `planFirstChargeProration` a partir da turma escolhida e recusa valor diferente (ou ignora o
     enviado). Hoje a API aceita qualquer valor.
   - Aplicar também aos planos adicionais do #131, cada um com a sua turma.
   - A mensagem Pix única do #131 passa a somar o 1º pagamento proporcional de cada item.
4. **#129 (desconto)** por último, ampliado conforme a **seção 6** (desconto aplicado de verdade:
   só agora, recorrente em parcelas/renovações escolhidas ou permanente, e visível nos relatórios).

> Card relacionado ainda em "A fazer": #74 "Adicionar botão para adicionar o serviço direto". O
> botão "Adicionar serviço avulso" do #131 provavelmente já resolve; vale conferir e fechar o card.

---

### Grupo E — Editor de mensagem verde + campanhas automáticas (#128 + #139) · cards #86 e #78

Os dois mexem em `features/communications/index.ts` e no `MessageBodyEditor`.

**Como unir**
1. Mergear o **#128** primeiro (deixa o editor genérico, com `variables`, `toolbarLabel`, etc.).
2. No **#139**, usar o mesmo editor nas mensagens de cada momento da campanha automática, passando
   os códigos do evento (`{{nome}}`, `{{data}}`, `{{idade}}`, `{{plano}}`, `{{sessoes}}`…). Assim
   fica tudo igual: Pix, campanhas manuais e automáticas com as etiquetas verdes.
3. A página antiga de Relacionamento **fica por enquanto** (decisão 3) e será apagada depois, num PR próprio.
4. Ajustes no #139: auditoria ao criar, editar e excluir campanha.
5. Card relacionado em "A fazer": #61 "Relatório de mensagens campanhas". A tabela
   `auto_campaign_deliveries` do #139 já tem tudo (enviada, não enviada, motivo, quem, quando).
   O relatório pode sair dela.

---

### Grupo F — Baixa de pagamento: comprovantes + parcelas no cartão (#134 + #136) · card #83

Os dois mexem no `SettleModal` e no `09-finance.css`.

**Como unir:** no modal "Dar baixa na parcela", usar sempre esta ordem: forma de pagamento →
**parcelamento na forma** (#136) → valores → **Comprovantes** (#134, no fim). Na lista de contas
pagas, juntar a linha "Pago: Cartão · 3x" (#136) com o botão "Comprovantes" (#134).

Ajustes no #134: filtrar os comprovantes por filial (card #77), permitir excluir um comprovante
enviado por engano (com auditoria) e decidir o que acontece com eles no estorno.

---

## 3. PRs que seguem sozinhos (com ajustes)

| PR | Card | Ajuste antes do merge |
|---|---|---|
| #132 Fornecedores | #75 | Validar CPF/CNPJ também na API. Opcional: usar as formas de pagamento do #136. Card #76 ("separar DDD do número") pode reaproveitar os campos de telefone/WhatsApp novos |
| #135 Modelos de avaliação | #59 | Ok. Rever a edição no `STATE.md` (regra de docs do CLAUDE.md) |
| #140 Contrato por WhatsApp | #50 (+ #63 "pesquisar assinar automático") | Ligar `trustProxy` no Fastify (senão o IP gravado é o do proxy), validar dígitos do CPF, prazo de validade do link, limite de requisições na rota pública. Mover o card #50 para "Fazendo/verificar" |

---

## 4. Ordem geral de merge

1. Consertar o **GitHub Actions** (todos os jobs falham em ~2s sem log, então hoje nenhum PR tem CI de verdade).
2. Base pequena e sem dependência: **#128 → #138 → #126 → #132 → #135**.
3. Grupo A unificado (#141 + bloco de avisos do #137). Depois, o **recálculo de comissão** (seção 7)
   e, em seguida, o **PR da folha de pagamento** (seção 8).
4. Grupo D em sequência: **#136 → #131 → #130 → #129**.
5. **#134** (alinhado ao #136), **#127** (sobre o #126), **#133** (sobre o #138), **#139** (sobre o #128).
6. **#140** depois das correções de segurança.
7. A cada merge, atualizar os PRs seguintes com a `main` e **renumerar as migrações** para não
   repetir números (hoje 11 PRs usam `0101` e dois usam `0102`).

---

## 5. Decisões do dono (26/10/2026)

1. **Desconto do cliente (#129): aplicado de verdade no valor.** Especificação na seção 6.
2. **Despesa variável: só se paga pelo valor real.** Vale o bloqueio do #141
   (`PAYABLE_AMOUNT_PENDING`). O "Valor estimado" do #137 serve só para previsão e exibição.
3. **Campanhas automáticas (#139):** a página antiga de Relacionamento **fica por enquanto**. Ela
   será apagada depois, num PR próprio.
4. **Comissão retroativa (card #65): recalcula todas, inclusive as pagas, olhando a data.**
   Especificação na seção 7.
5. **Folha de pagamento: PR separado.** O Grupo A fica só com as despesas fixas (#141 + o que
   aproveitar do #137). A folha sai do #137 para um PR próprio (seção 8).

---

## 6. Especificação — desconto do cliente aplicado (substitui o #129 "só informativo")

**Onde se configura:** no modal "Desconto do cliente" do #129 (porcentagem ou valor), com uma nova
escolha de **alcance**:

| Alcance | O que acontece |
|---|---|
| **Só no pagamento de agora** | O desconto entra só na próxima cobrança gerada para o cliente (1ª parcela do plano ou venda atual). Depois de usado, fica marcado como consumido. |
| **Recorrente — escolher parcelas/renovações** | A equipe escolhe quais parcelas (ex.: 1ª a 3ª) e/ou quantas renovações (ex.: as 2 próximas) recebem o desconto. |
| **Permanente** | Vale para todas as parcelas e renovações até a equipe remover. |

**Regras de cálculo**
- Ordem no valor de cada item vendido: **valor do plano → desconto → 1º pagamento proporcional
  (#130) → divisão em parcelas (#136)**. O desconto não pode deixar o valor abaixo de zero
  (`applyPatientDiscount` já garante isso).
- Desconto em **valor (R$)** recorrente vale por parcela/renovação, não sobre o total do plano. O
  modal deve explicar isso.
- Cada cobrança gerada **grava o desconto aplicado**: valor cheio, valor do desconto, tipo (%/R$) e
  origem (desconto do cliente). Assim, mudar ou remover o desconto depois **não altera** cobranças
  já geradas.
- Remover o desconto encerra o alcance para as próximas cobranças. As já geradas ficam como estão.
- Plano recorrente: a renovação automática consulta o alcance (renovações restantes ou permanente)
  ao gerar a nova cobrança.

**Dados (migração nova)**
- No cliente: tipo, valor, alcance (`once` | `selected` | `permanent`), parcelas/renovações escolhidas
  e quantas já foram usadas. O #129 hoje guarda no JSON `profile`; para os relatórios, é melhor uma
  tabela ou colunas próprias.
- Em `receivables`: `gross_amount_in_cents`, `discount_in_cents` e a origem do desconto.

**Relatórios (obrigatório)**
- DRE e relatório financeiro (#133): linha **"Descontos concedidos"** (receita bruta − descontos =
  receita líquida).
- Relatório de clientes e de vendas: coluna de desconto por cliente/venda e filtro "com desconto".
- Ficha do cliente: total de desconto já concedido.
- Recibo e mensagem Pix: "Valor R$ 400,00 · Desconto R$ 40,00 · Total R$ 360,00".

**Testes:** os três alcances; desconto + proporcional + parcelas juntos; renovação consumindo o
desconto; remover o desconto sem mexer em cobranças antigas; números da DRE e dos relatórios.

---

## 7. Especificação — recálculo de comissão retroativa (card #65)

**Regra:** ao criar ou alterar uma regra de comissão com `effectiveFrom` numa data passada, o sistema
procura os atendimentos/vendas **a partir dessa data**:
- **Nenhum atendimento/venda no período** → nada a recalcular, só grava a regra.
- **Há atendimentos/vendas no período** → recalcula **todas** as comissões desse intervalo (do
  `effectiveFrom` até o `effectiveUntil` ou até hoje), abertas ou pagas:
  - **em aberto:** o valor é atualizado direto;
  - **já pagas:** o valor pago não é alterado. Gera um **ajuste de comissão** (crédito ou débito)
    com a diferença, que entra no próximo pagamento/conciliação do profissional. Usar o mecanismo de
    `commissionAdjustments` que já existe.
- Atendimentos **antes** do `effectiveFrom` continuam com a regra antiga (a `main` já faz isso com
  `selectCommissionRule`).
- Antes de salvar, a tela mostra uma prévia: "Esta mudança recalcula N comissões de dd/mm a dd/mm
  (diferença: R$ X; R$ Y em ajustes de comissões já pagas)", e a equipe confirma.
- Tudo numa transação e registrado na auditoria (regra antiga, regra nova, comissões afetadas).

**Testes:** regra nova sem atendimento no período (nada muda); regra no dia 15 (antes = antiga,
depois = nova); regra com início no dia 1 criada no dia 15 (recalcula de 1 a 15); comissão já paga
gerando ajuste; memória e PostgreSQL.

---

## 8. PR separado — Folha de pagamento

- Sai do #137: `payroll.ts`, `PayrollSection.tsx`, `PayrollEmployeeModal.tsx`, rotas
  `/finance/payroll*`, permissões `finance.payroll_view`/`finance.payroll_manage`, tabela
  `payroll_employees` (migração própria) e os testes.
- Ajustes: filtrar por filial; somar os **ajustes de comissão** da competência (inclusive os gerados
  pelo recálculo da seção 7). Por isso, convém entrar **depois** do recálculo de comissão.
- Próximo passo natural: card #70 "Vale para funcionário" (vale descontado na competência, com
  recibo assinado, que pode usar o link de assinatura do #140).
