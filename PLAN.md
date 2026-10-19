# Plano — Studios Aryana CRM

Plano vivo do loop autodev (`/next`, `/loop /next`). Rodadas 1–7 concluídas; o detalhe delas
está no histórico do git (este arquivo antes do commit "chore: handoff da rodada 8").

## Definição de pronto (global)

- Cada tarefa `DONE` com commit próprio e verifier PASS.
- Tarefas `**Tipo:** manual` são revisadas pelo dono.
- `npm run typecheck && npm run lint && npm test && npm run build && node apps/web/scripts/audit-panels.cjs`
  retorna 0 na `main`.

## Fora de escopo

- O que depende de provedor externo: pagamentos, NFSe, envio real de WhatsApp ou e-mail.
- Portal ou app do cliente.
- Dependências npm novas, `git push`, edição de migrações existentes, `.env` e `compose.yaml`
  sem autorização do dono.

## Rodada 8 — Correções do QA ponta a ponta (pedido do dono, 17/10/2026)

Origem: QA em produção (modo Demonstração, admin) de 17/10/2026. IDs com prefixo `Q` para não
colidir com a rodada 7 (QC1 = C1 do relatório do QA, QM = M, QV = V). Branch `main`
(push só com autorização do dono). Commits `fix(QC6): …` em pt-BR. Próxima migração livre: **0084**.

Ordem da Fase 1 (métricas depois dos dados): QC6 → QC2 → QC3 → QC4 → QC5 → QC8 → QC1 → QC7 →
QC9 → QC10. Depois Fase 2 (QM), Fase 3 (QV) e regressão (QR).

### Decisões do dono (18/10/2026)

- **QC8/QC3 comanda:** mantém o crédito pré-pago preso ao atendimento (pré-venda de atendimento
  futuro continua permitida); corrigir só exibição e prioridade de consumo.
- **QC3 tolerância:** realizado/falta a partir de **15 min antes** do início (constante, sem
  configuração).
- **QC7 "Pagamento atrasado":** vira etiqueta **automática** (parcela vencida e em aberto), não
  editável à mão.
- **QM9 estoque:** aba "Estoque" no Financeiro (sem item novo no menu lateral).
- Fora desta rodada: job diário de lembrete (QC2 item 5, infraestrutura) e remoção dos dados de
  teste do QA em produção (Anexo A — feita pelo dono).

### Triagem no código (18/10/2026)

- QC1 confirmado: `sales-report.ts` divide por `previousComparable.netSalesInCents` negativo.
- QC3 confirmado: `PATCH /appointments/:id/status` não compara com a hora atual.
- QC4: `group_enrollments.enrolled_at` já existe; falta usá-lo nos participantes e gravar o fim.
- QC5 confirmado: `bookReplacement` não exige sessão futura.
- QC6: web sem React Query/SWR; cada tela recarrega pelo próprio `useEffect`.
- QC7 confirmado: card conta `status === "active"` (inclui esgotados); filtros sem Expirado/Cancelado.
- QC8: não é cobrança dupla — `tab-service-credits.ts` cria plano `single` com 1 sessão e
  `sourceAppointmentId`, consumido quando o atendimento é realizado. Problemas reais: rótulo
  "Plano contratado"/"1 de 1 sessões", nome com código ("Comanda E2CD5FDF") e `consumeSession`
  ordena por validade, então outro plano pode ser consumido antes do crédito da comanda.
- QC9 confirmado: texto fixo em `AppointmentRescheduleHistoryModal.tsx`.
- QC10 confirmado: `inline-validation.ts` só limpa o erro em `input`/`change`; escolher na lista
  não dispara nenhum dos dois. Sem texto digitado, a lista mostra os `patients` pré-carregados.
- QM15: ainda há "movimenta" em 8 arquivos de src (login demo, inventário, DRE, conciliação…).
- QV1: `html { scrollbar-gutter: stable }` + `useBodyScrollLock` somando `padding-right` no body
  — suspeita de compensação dupla.

### Fase 1 — Críticos

### QC6 — Dados atualizados sem recarregar após mutações

- **Escopo:** mapear mutações → telas afetadas (fechar comanda → aba Financeiro do cliente,
  contas a receber, estoque, planos, histórico; criar plano → planos, contas a receber, ficha;
  baixa/estorno → financeiro, dashboard, caixa do dia; status do atendimento → agenda, dashboard,
  ficha). Sem dependência nova: um mecanismo único em `shared` (ex.: versão de dados por domínio
  que as telas assinam e que as mutações em `shared/api` incrementam). Contadores das abas (ex.:
  "Contas a receber (N)") vêm da mesma consulta da lista ou recarregam junto. Testes web: fechar
  comanda atualiza a aba Financeiro da ficha sem remontar; contador atualiza.
- **Gate:** gate completo
- **Depende de:** —
- **Status:** DONE

### QC2 — Atendimentos passados "Pendente de finalização"

- **Escopo:** estado derivado em contracts/agenda (`scheduled`/`confirmed` com fim < agora, fuso
  da clínica). Dashboard: card "Atendimentos a finalizar (N)" com link para lista filtrada. Agenda:
  selo nos blocos pendentes (Dia, Semana, Mês, lista). Lista filtrada com seleção e ação em lote
  "Marcar como realizados" / "Marcar falta" (rota em lote nova ou chamadas existentes, respeitando
  `agenda.attendance`). "Clientes atendidos no mês" e "sem retorno" seguem contando só realizados,
  com `HelpTip` explicando. Testes contracts, API (lote, se houver) e web.
- **Gate:** gate completo
- **Depende de:** QC6
- **Status:** DONE

### QC3 — Bloquear ações clínicas em atendimento futuro

- **Escopo:** API: `completed` e `no_show` só com `startsAt − 15 min <= agora`, senão
  `DomainError("APPOINTMENT_NOT_STARTED", "Disponível a partir de <data hora>.", 409)`; mesma
  regra no lote da QC2. Evolução clínica: listar e aceitar só atendimentos iniciados (API recusa).
  Comanda continua aceitando atendimento futuro (decisão do dono). Web: botões desativados com
  dica "Disponível a partir de 19/10 às 10:00". Constante compartilhada em contracts. Testes API
  (memória; PG se tocar SQL) e web.
- **Gate:** gate completo
- **Depende de:** QC2
- **Status:** DONE

### QC4 — Matrícula não aparece em sessões anteriores

- **Escopo:** `enrolled_at` (data da clínica) vira o início; a matrícula ganha data de início
  editável (padrão hoje) e o cancelamento grava o fim (migração nova 0081: `ended_at`, preenchida
  nas canceladas com `updated_at`). Participantes da sessão = início ≤ data da sessão e (sem fim
  ou fim ≥ data). Vale também para lotação e presença. Memória + PG; teste PG opt-in.
- **Gate:** gate completo
- **Depende de:** QC3
- **Status:** DONE

### QC5 — Reposição só em sessão futura, com vagas e retorno

- **Escopo:** API `bookReplacement` recusa sessão já iniciada e a sessão de origem. Web: opções
  só futuras, com vaga e diferentes da origem, rótulo "20/10 · 18:00 · 3 vagas"; sem crédito,
  estado vazio "Nenhum crédito de reposição disponível"; sucesso/erro por toast (U1) e resultado
  "Bruna reservada em 20/10". Testes API e web.
- **Gate:** gate completo
- **Depende de:** QC4
- **Status:** DONE

### QC8 — Crédito da comanda com rótulo e consumo corretos

- **Escopo:** mantém o modelo (decisão do dono). `consumeSession` (memória e PG) prioriza o plano
  com `sourceAppointmentId === appointment.id`. Exibição: nome sem código ("Pilates individual ·
  pago na comanda"), selo "Aguarda atendimento" enquanto não consumido; histórico e linha do tempo
  usam "Serviço avulso na comanda" em vez de "Plano contratado"; créditos de comanda fora do card
  "planos ativos" e do saldo da tela Planos. Sem migração de dados (saldo 1 está certo até o
  atendimento). Testes API (prioridade de consumo, rótulo) e web.
- **Gate:** gate completo
- **Depende de:** QC5
- **Status:** DONE

### QC1 — Variação de vendas sem percentual impossível

- **Escopo:** `changePercent` nulo quando a base anterior ≤ 0, num helper único em contracts
  usado pela API e pelo Excel. `TrendBadge`: seta e cor pelo sinal de `changeInCents`; sem base,
  mostra "Sem base de comparação" e a diferença em R$. Dashboard e Relatórios (Comparação mensal)
  usam o mesmo. Mantém "Vendido líquido" e mostra "Estornos" à parte quando houver. Teste:
  anterior −R$ 7.000 e atual R$ 490 → sem % e sem seta vermelha.
- **Gate:** gate completo
- **Depende de:** QC8
- **Status:** DONE

### QC7 — Contadores consistentes e "Pagamento atrasado" automático

- **Escopo:** Planos: card "ativos" usa `planDisplayStatus` (= filtro Ativo); filtros ganham
  "Expirado" e "Cancelado" para a soma bater com "Todos" ("Vencendo" fica como subconjunto de
  Ativo, sinalizado na interface). "Pagamento atrasado" vira etiqueta automática = cliente com
  parcela vencida e em aberto (mesma regra de `overdue_payment`), calculada na API nos dois
  repositórios, exibida como selo e no filtro de etiquetas, sem edição manual; migração nova
  remove a etiqueta manual dos clientes; demo atualizado. Clientes e Contatos sugeridos dão o
  mesmo número. Testes contracts, API e web.
- **Gate:** gate completo
- **Depende de:** QC1
- **Status:** DONE

### QC9 — Histórico de reagendamentos sem texto do Financeiro

- **Escopo:** remover o parágrafo "Receitas e despesas pela baixa…" de
  `AppointmentRescheduleHistoryModal.tsx`; teste web confere a ausência.
- **Gate:** gate completo
- **Depende de:** QC7
- **Status:** DONE

### QC10 — Busca de cliente sem erro preso

- **Escopo:** `PatientPicker` limpa o erro inline (`aria-invalid`/`.inline-field-error`) ao
  escolher; a seleção é desfeita se o texto for editado; validação só no blur/envio; a lista só
  abre com texto digitado e filtrada por ele (inclusive ao voltar do cadastro rápido). Vale para
  todos os usos (agendamento, matrícula, prontuário, contratos, plano, SOS). Testes web.
- **Gate:** gate completo
- **Depende de:** QC9
- **Status:** DONE

### Fase 2 — Usabilidade

Cada item: confirmar no código antes; se já resolvido na rodada 7, marcar DONE com evidência.
Gate completo em todos, na ordem da tabela.

| ID | Item | Status |
|----|------|--------|
| QM1 | "Novo atendimento" do Dashboard abre o modal (`/agenda?novo=1`) | DONE |
| QM2 | Após agendar, a agenda vai para a data salva e destaca o bloco por 2 s | DONE |
| QM3 | Serviço↔profissional↔sala (U10): vínculos no demo e conferir filtro; `*` em Cliente quando obrigatório | DONE |
| QM4 | Seletor de data fecha ao escolher, nunca cortado, dias passados com estilo próprio | DONE |
| QM5 | Comanda sem layout pulando; destrutivo à esquerda e separado; confirmar "Cancelar comanda" | DONE |
| QM6 | Detalhes do atendimento: rodapé fixo com ações e "Editar" (serviço, sala, observação) | DONE |
| QM7 | "⋯" vira menu (Editar, Remarcar, Histórico, Cancelar) | DONE |
| QM8 | Turmas: turma no topo, sessões próximas/anteriores (4+4) colapsáveis, "Marcar todos presentes", "8 matriculados · 4 vagas livres" | DONE |
| QM9 | Estoque/produtos em aba "Estoque" do Financeiro; ficha mantém só "Comandas" | TODO |
| QM10 | Lead com telefone/e-mail/CPF de cliente existente avisa antes de salvar | TODO |
| QM11 | `useDirtyGuard`: Esc/X em formulário alterado pergunta "Descartar alterações?" | TODO |
| QM12 | "Serviço avulso" lista os serviços avulsos ou orienta onde cadastrar | TODO |
| QM13 | Toast em toda mutação (matrícula, reposição, NPS); sino com aniversários, parcelas vencidas e atendimentos a finalizar, com skeleton | TODO |
| QM14 | "Confirmar" desativado listando etapas faltantes; erro do SOAP uma vez só | TODO |
| QM15 | Sem "movimenta", UUID ou código de seed na interface ("Comanda nº 12") | TODO |
| QM16 | Histórico: um evento por ação, resumo com cliente, valor e objeto | TODO |
| QM17 | Linha de profissionais da agenda fixa ao rolar; botão "Hoje" em todas as visões | TODO |

### Fase 3 — Visual

| ID | Item | Status |
|----|------|--------|
| QV1 | Barra lateral não pula ao abrir modal (compensação dupla gutter + padding?) | TODO |
| QV2 | Abas da ficha com o estilo das abas de Configurações (pílula ativa) | TODO |
| QV3 | Reset de fieldset, `summary` com chevron, tabelas e links do design system | TODO |
| QV4 | Comanda: grade de 3 colunas com `min-width: 0`, valores à direita, botões com gap | TODO |
| QV5 | Textos duplicados ("Sala Sala de Dança", "Cliente / Cliente") | TODO |
| QV6 | Barra de progresso do plano com semântica definida e legenda "0 de 8 usadas" | TODO |
| QV7 | Espaço entre seções em Turmas | TODO |
| QV8 | `PageHeader` igual em Configurações; botões `button-sm` em Serviços e salas, com preço e duração | TODO |
| QV9 | Legenda da agenda em uma linha/popover; colunas do kanban com `min-width` e indicação de rolagem | TODO |

### Fase 4 — Regressão

### QR1 — E2E dos críticos

- **Escopo:** Playwright (`e2e/`): QC1 base negativa, QC3 realizado no futuro recusado, QC4
  matrícula fora de sessão passada, QC5 reposição só futura, QC6 financeiro sem recarregar, QC8
  crédito da comanda consumido uma vez.
- **Gate:** gate completo e `npm run test:e2e -- --workers=1`
- **Depende de:** QV9
- **Status:** TODO

### QR2 — Fluxo do dia a dia e itens não testados (manual)

- **Tipo:** manual
- **Escopo:** agendar → confirmar → realizar → evolução → comanda → baixa → Dashboard,
  Relatórios, Caixa do dia, Histórico; exportar/importar, Excel, PDF/impressão de contrato,
  WhatsApp, logout/sair de todos, mesclar, recorrência, pausar/renovar; celular ≤ 400 px.
- **Depende de:** QR1
- **Status:** TODO
