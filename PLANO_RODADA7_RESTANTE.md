# Plano — Rodada 7, itens restantes (Fase 2 a partir do U17 e Fase 3)

> Continuação do plano de correções do teste manual de 16/10/2026.
> Situação em 17/10/2026: **Fase 1 concluída (C1–C11)** e **Fase 2 parcial**: U1–U16 e U29
> concluídos, cada um com commit e gate verde. Este documento cobre o que falta: **29 itens da
> Fase 2, 12 da Fase 3 e a verificação dos itens não testados**.

## Como trabalhar

1. Seguir a ordem dos blocos abaixo, um item por vez (ou um grupo pequeno do mesmo módulo).
2. Antes de cada item, confirmar o comportamento atual no código. Se o item já estiver resolvido,
   marcar no `PLAN.md` com a evidência em vez de reescrever.
3. Cada item precisa de teste: web (Testing Library) e, quando mexer na API, integração com o
   repositório em memória **e** teste PostgreSQL opt-in (fica `skip` sem `TEST_DATABASE_URL`).
4. Gate completo antes de cada commit:
   `npm run typecheck && npm run lint && npm test && npm run build && node apps/web/scripts/audit-panels.cjs`.
   Commit em pt-BR no formato `feat(U17): …` / `fix(V4): …`, sem `Co-Authored-By`.
5. Itens marcados com **Decisão pendente** só começam depois da sua resposta.
6. No fim de cada bloco: resumo do que foi feito, do que ficou pendente e por quê.

### Regras do projeto que valem para todos os itens

- Nada de `style={{}}` no JSX (exceção: cor escolhida pelo usuário, via variável CSS).
- Grade com 2+ colunas precisa de regra no `@media (max-width: 700px)`.
- `font-size` só com tokens `--text-*`; espaçamento só com `--space-*`.
- Todo botão precisa de classe de variante (`primary-button`, `secondary-button`, `text-button`,
  `danger-button`).
- Migração só **nova**, com o próximo número livre: hoje é a **0079**.
- Sem dependências npm novas (arrastar e soltar com a API nativa do navegador).

### Antes de publicar (vale para o que já foi feito)

Rodar `npm run db:setup` no banco de produção: as migrações **0076** (despesa sem centro de
custo), **0077** (pausa de plano) e **0078** (profissionais e salas por serviço) ainda não estão
lá, e a função da Vercel não roda migrações.

---

## Decisões já tomadas (não perguntar de novo)

| Item | Decisão |
|------|---------|
| U37 | Contrato emitido: botão WhatsApp (wa.me com mensagem pronta) + PDF pela impressão do navegador. Sem envio automático de e-mail. |
| U39 | Baixa com desconto e/ou juros; o valor final fica registrado. Pagamento parcial gera nova parcela com o saldo restante. |

## Decisões pendentes (responder antes do bloco correspondente)

| Item | Pergunta | Sugestão |
|------|----------|----------|
| U17 | Arrastar e soltar no quadro comercial com a API nativa funciona mal no celular. Basta desktop, mantendo no celular o select de etapa que já existe? | Sim: arrastar no desktop, select no celular. |
| U31 | Quais ações em lote na fila de mensagens? | "Marcar como enviadas" e "Descartar" para as selecionadas. |
| U33 | Contatos sugeridos agrupados: um cartão por cliente com todos os motivos e uma ação "Registrar contato" que vale para todos os motivos? | Sim. |
| V3 | As etiquetas já têm cor configurável, mas não têm categoria. Criar categorias (financeiro, serviço, status) com cor padrão por categoria, ou só aplicar cores padrão melhores às etiquetas atuais? | Campo "categoria" opcional na etiqueta (migração nova) com paleta por categoria; a cor manual continua valendo. |
| V12 | Pode renomear os clientes de demonstração? Isso só muda o banco de produção se ele for semeado de novo. | Sim, corrigir o gerador; ressemear fica a seu critério. |

---

## Bloco A — CRM comercial (U17–U21)

Arquivos: `features/commercial/CommercialPage.tsx`, `LeadModal.tsx`, `LeadActivityModal.tsx`,
`contracts/src/commercial/model.ts`, API `modules/commercial`.

| ID | O que fazer | Aceite |
|----|-------------|--------|
| U18 | Colunas com largura mínima fixa e rolagem horizontal visível no quadro (`overflow-x: auto`, barra sempre aparente); nenhuma coluna cortada em 1280px. | Todas as etapas alcançáveis, inclusive "Ganhos" e as seguintes. |
| U17 | Cartão do lead com `draggable` e colunas como alvo (`dragover`/`drop`), chamando a mesma mudança de etapa do select atual. Destacar a coluna sob o cursor e mostrar toast de sucesso/erro. Etapas que pedem dados ("Perdido" pede motivo, "Ganho" pede conversão) abrem o modal correspondente em vez de mover direto. **Decisão pendente.** | Arrastar move o lead e persiste; perdido/ganho abrem o modal. |
| U19 | Formulário de lead com nome, telefone, origem e interesse à vista; o resto fica em "Mais informações", como no cadastro de cliente (U15). Remover CPF, contato de emergência e endereço do lead e pedir esses dados só na conversão (`LeadConvertModal`). Verificar no contrato se esses campos são opcionais; se forem obrigatórios, torná-los opcionais. | Criar lead só com nome e telefone; os campos removidos aparecem na conversão. |
| U20 | "Origem" e "Interesse" viram selects alimentados por `clinicCatalog("lead_source")` e `clinicCatalog("interest")`, com a opção "Outro". Lead antigo com texto livre continua aparecendo como opção. | Selects listam os catálogos de Configurações › Cadastros. |
| U21 | Na aba "Contatos" do lead, unificar "Canal" e "Forma de contato" num campo só. Conferir no contrato qual dos dois é gravado (migração 0066 criou `contact_methods`) e manter compatibilidade com o que já está salvo. | Um único campo de canal, sem perda dos registros antigos. |

## Bloco B — Prontuários (U22–U26)

Arquivos: `features/clinical/ClinicalRecordModal.tsx`, `ClinicalAssessmentModal.tsx`,
`ClinicalWorkspacePanel.tsx`, `ClinicalRecordsPage.tsx`, `patients/PatientTimelineSection.tsx`.

| ID | O que fazer | Aceite |
|----|-------------|--------|
| U22 | Trocar o select de atendimento (164 opções em ordem crescente) por uma busca com sugestões: mais recentes primeiro, filtro por nome ou data e, por padrão, só os últimos 90 dias. Pode reaproveitar o padrão do `PatientPicker`. | O atendimento mais recente aparece primeiro e a busca filtra. |
| U23 | Salvar rascunho sem exigir os campos SOAP; exigir só ao finalizar (`FinalizeRecordModal`). Conferir a validação na API (rascunho não pode reprovar por campo vazio). | Rascunho com só "S" preenchido é salvo; finalizar pede o restante. |
| U24 | Procurar onde códigos internos aparecem (ex.: `CREDITO DEMO-PILATES-02`, ids, chaves de ação) e trocar por rótulos legíveis. Varredura em prontuário, extrato de sessões e histórico. | Nenhum código interno visível nessas telas. |
| U25 | Em "Nova avaliação" sem modelos: texto "Nenhum modelo de avaliação" e botão "Criar modelo", que abre o `AssessmentTemplateModal` e, ao salvar, já seleciona o modelo novo. | Dá para criar o modelo e voltar à avaliação sem sair do modal. |
| U26 | A linha do tempo do cliente lista rascunhos com selo "Rascunho" em vez de dizer "Nenhum evento clínico". Verificar se a API da timeline omite rascunhos de propósito e ajustar nos dois repositórios. | Cliente com rascunho mostra o item marcado. |

## Bloco C — Planos (U27–U28)

Arquivos: `features/plans/PlansPage.tsx`.

| ID | O que fazer | Aceite |
|----|-------------|--------|
| U27 | Busca por cliente (sem acento) e filtros Ativo / Pausado / Esgotado / Vencendo (validade nos próximos 15 dias), usando `planDisplayStatus`. Contador por filtro. | Filtros e busca combinam; contadores batem com a lista. |
| U28 | Subtítulo do cartão sem repetição: quando o nome do plano já contém o serviço, mostrar só o nome ("Dançaterapia 2x"); com vários serviços, mostrar a lista. | "Dançaterapia 2x · Dançaterapia" vira "Dançaterapia 2x". |

## Bloco D — Comunicações e Contatos sugeridos (U30–U34)

Arquivos: `features/communications/CommunicationsPage.tsx`, `ManualMessageActions.tsx`,
`features/relationship/RelationshipPage.tsx`, `contracts/src/communications`, `app/navItems.ts`.

| ID | O que fazer | Aceite |
|----|-------------|--------|
| U30 | Variável `{{nome}}` sempre com o primeiro nome, na geração de lembretes e comunicados (API) e nas mensagens da tela. Revisar `fillMessageTemplate` e quem o chama. | "Olá, Viviane" em todas as mensagens geradas. |
| U31 | Fila: filtros por tipo e status, seleção em lote (**decisão pendente**) e linha compacta, com ações num menu "…" e o chip de status na mesma linha. | Até 4 ações por linha viram 1 botão principal + menu. |
| U32 | Um botão "Enviar pelo WhatsApp" abre o wa.me e, ao voltar para a aba (`visibilitychange`), pergunta "Mensagem enviada para {nome}?" com Sim/Não. Sim registra o envio manual. | Fluxo único; a confirmação cita o nome do cliente. |
| U33 | Em "Todas", agrupar por cliente: um cartão com todos os motivos (selos) e uma ação de contato. **Decisão pendente.** | Cliente em duas categorias aparece uma vez. |
| U34 | Nome único "Contatos sugeridos": menu, título da página, link do painel ("Ver contatos sugeridos") e eyebrow. A rota `/relacionamento` continua funcionando (aliases são invariantes do projeto). | Nenhum "relacionamento" visível ao usuário. |

## Bloco E — Contratos (U35–U37)

Arquivos: `features/contracts/DocumentsPage.tsx`, `TemplateVersionModal.tsx`, `contracts/src/contracts`.

| ID | O que fazer | Aceite |
|----|-------------|--------|
| U35 | Botões "Inserir campo" (Nome do cliente, CPF, Plano, Valor, Data de hoje, Profissional…) inserem `{{variavel}}` na posição do cursor; prévia ao lado com um cliente de exemplo. Usar a lista de variáveis que a API já aceita. | Modelo criado sem digitar chaves; a prévia mostra o texto final. |
| U36 | Limpar o formulário depois de "Criar modelo" e mostrar toast. | Não dá para criar duplicado por clique repetido. |
| U37 | No contrato emitido: botão WhatsApp (mensagem pronta com o título do contrato) e "Salvar PDF", que abre a impressão já existente com o diálogo do navegador (o usuário escolhe "Salvar como PDF"). | Os dois botões aparecem só em contratos emitidos. |

## Bloco F — Financeiro (U38–U41)

Arquivos: `features/finance/FinancePage.tsx`, `ReceivablesList.tsx`, `SettleModal.tsx`,
`ReceiptModal.tsx`, `contracts/src/finance`, API `storage/*/finance*.ts`.

| ID | O que fazer | Aceite |
|----|-------------|--------|
| U38 | Contadores das abas calculados sobre a lista já filtrada pela busca. Investigar "Todas 123 ≠ 11 + 18 + 78": provavelmente faltam as canceladas. Criar a aba "Canceladas" ou explicar a diferença na tela. | Soma das abas = Todas, sempre. |
| U39 | **Maior item do bloco (API + banco).** Na baixa: campos desconto e juros (`MoneyInput`) e "valor recebido". Valor final = valor − desconto + juros. Se o recebido for menor que o final, a parcela é paga pelo recebido e nasce uma nova parcela com o saldo (mesmo vencimento ou escolhido). Migração **0079** com colunas de desconto/juros no evento de pagamento; os dois repositórios e os relatórios (DRE, caixa do dia) passam a considerar o valor efetivamente recebido. | Baixa com desconto, com juros e parcial; saldo vira nova parcela; DRE e caixa batem. |
| U40 | Recibo com forma de pagamento capitalizada (Pix, Cartão, Dinheiro), CNPJ e endereço da clínica (de Dados da clínica) e botão "Enviar por WhatsApp". | Recibo completo; WhatsApp com mensagem pronta. |
| U41 | Ícone de ajuda com explicação curta em Competência, Lançamento, Centro de custo e Disponibilidade no caixa. Componente único `HelpTip` (botão com `aria-describedby`; abre ao clicar e ao focar, não só no hover). | Os quatro termos têm ajuda acessível por teclado. |

## Bloco G — Relatórios, Configurações e Painel (U42–U46)

| ID | O que fazer | Aceite |
|----|-------------|--------|
| U42 | Variação percentual com seta ↑/↓, sinal e cor (verde para melhora, vermelho para piora, cinza para estável) num componente `TrendBadge`. Revisar o caso "~102,1%" (sem base anterior: mostrar "novo"). | Nenhum "~" sem explicação. |
| U43 | Datas do DRE em formato brasileiro ("01/10/2026 a 16/10/2026") com `formatIsoDate`. Varrer os outros relatórios. | Nenhuma data AAAA-MM-DD visível. |
| U44 | "Serviços, salas e profissionais" sai do acordeão de Cadastros e vira aba própria em Configurações. O link `?secao=` antigo continua funcionando. | Aba visível; link antigo abre a aba nova. |
| U45 | Validar CPF/CNPJ (dígitos verificadores) em Dados da clínica, no contrato (zod) e na tela, com máscara. Verificar se já existe validador de CPF em `contracts/src/common`. | CNPJ inválido é recusado com mensagem em pt-BR. |
| U46 | "Sem retorno neste mês" no painel: link "Ver todos (30)" para a lista completa, em Contatos sugeridos já filtrado pelo motivo. | A contagem e a lista batem. |

---

## Fase 3 — Visual (V1–V12)

| ID | O que fazer | Observação |
|----|-------------|------------|
| V1 | Coluna "Ações" e etiquetas com "+N" na lista de clientes. | **Parcialmente feito no U13**: falta só revisar alinhamento e quebra no celular. |
| V2 | Botões do topo de Clientes sem quebra (`white-space: nowrap`); ações secundárias (Mesclar, Inativar antigos, Importar, Exportar) num menu "Mais" (`ActionMenu`). | — |
| V3 | Etiquetas com cor por categoria e estado selecionado visível no filtro (sem a "bolinha vazia"). | **Decisão pendente.** |
| V4 | Cores de status na agenda: agendado, confirmado, realizado (verde), falta (âmbar), cancelado (cinza riscado), com legenda. Aplicar na grade do Dia (U5), na Semana, no Mês e na lista. | O cancelado riscado já existe (C3). |
| V5 | Contato de emergência em vermelho só quando não informado; preenchido em estilo neutro (detalhes do atendimento e ficha). | — |
| V6 | Padronizar os campos de data: decidir entre o nativo e o seletor customizado e aplicar em todo o sistema. | Sugestão: nativo em todo lugar, exceto o agendamento (que mostra a ocupação). |
| V7 | Rótulos com o mesmo tamanho (Cliente em Contratos/Novo atendimento, "Assinantes sem turma"); select "Direção" do CRM sem esticar; fieldset do plano no cadastro com borda e raio do padrão. | — |
| V8 | Textos truncados: nome da turma nos cards da agenda (quebra em 2 linhas + `title`), select de etapa do lead. | — |
| V9 | `scrollbar-gutter: stable` no contêiner principal para a página não "pular" ao trocar a visão. | — |
| V10 | Cor do profissional nos avatares e nos cards (borda esquerda via variável CSS, permitida pela regra). Incluir a grade do Dia. | — |
| V11 | Estados vazios com ilustração (ícone grande do lucide) e ação principal: Turmas, Comissões, Prontuários. Estender o `EmptyState` com `icon` e `action`. | — |
| V12 | Dados de demonstração: nomes realistas e variados (sem "Azevedo Azevedo" nem "Cliente Relacionamento") e nenhuma data futura em criação/histórico. | **Decisão pendente.** As datas futuras do cadastro já foram corrigidas no C11. |

---

## Verificação dos itens não testados

Sem disparar nada real. Em ambiente local com o repositório em memória:

| Item | Como verificar |
|------|----------------|
| SOS | Ler o fluxo do `EmergencyButton`: o que dispara, para quem, se pede confirmação. Testar em ambiente local sem provedor real configurado. |
| Importar CSV / Exportar clientes / Exportar Excel | Testes automatizados com arquivo de exemplo; conferir colunas, acentos (UTF-8 com BOM para o Excel) e nome do arquivo. |
| Mesclar clientes / Inativar antigos | Teste de integração na API (memória + PostgreSQL) cobrindo plano, atendimentos e financeiro do cliente mesclado. |
| Celular | Rodar `npm run test:e2e` (Playwright desktop/celular) e revisar as telas alteradas na Rodada 7 em 390px. |

---

## Ordem e esforço estimado

| Ordem | Bloco | Itens | Esforço |
|-------|-------|-------|---------|
| 1 | G — Relatórios, Configurações, Painel | U42–U46 | Baixo |
| 2 | C — Planos | U27–U28 | Baixo |
| 3 | B — Prontuários | U22–U26 | Médio |
| 4 | D — Comunicações | U30–U34 | Médio |
| 5 | E — Contratos | U35–U37 | Médio |
| 6 | A — CRM comercial | U17–U21 | Médio/alto (arrastar e soltar) |
| 7 | F — Financeiro | U38–U41 | Alto (U39 mexe em banco e relatórios) |
| 8 | Fase 3 — Visual | V1–V12 | Médio |
| 9 | Verificação dos não testados | — | Baixo/médio |

A ordem coloca primeiro os itens rápidos e independentes, deixa por último os que dependem de
decisão (U17, U31, U33, V3, V12) e isola o U39, que é o de maior risco (dados financeiros), para
ser feito com atenção e teste PostgreSQL.
