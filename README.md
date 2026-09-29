# Movimenta CRM

Primeira versão executável de um CRM web para clínicas de fisioterapia, inspirada no fluxo operacional estudado no SeuFisio e construída sem aplicativo ou portal do cliente.

## O que já funciona

- autenticação com perfis de acesso;
- painel com indicadores operacionais;
- cadastro, edição e pesquisa de clientes;
- importação de clientes por planilha CSV ou XLSX, com prévia, detecção de duplicados e modelo para download;
- histórico do cliente na ficha, reunindo atendimentos, planos, pagamentos, contatos, mensagens e pesquisas;
- profissionais, salas e serviços, com o CREFITO do profissional exibido no prontuário, na impressão e nos documentos emitidos;
- agenda diária e semanal, recorrência, bloqueios e reagendamento individual com histórico e prevenção de conflitos;
- alteração do status dos atendimentos;
- prontuário clínico SOAP, avaliações configuráveis, objetivos, medições seriadas, anexos protegidos, adendos e visão longitudinal;
- bloqueio de prontuários para perfis sem acesso clínico;
- planos, pacotes, validade, saldo e extrato de sessões;
- renovação de planos manual ou automática ao fim do período;
- consumo automático ao finalizar e estorno ao reabrir atendimentos;
- financeiro com contas a receber e pagar, categorias, centros de custo, ajustes, formas de pagamento, recibos e fluxo de caixa mensal;
- renegociação parcelada e comissões profissionais por competência;
- CRM comercial com Kanban, tarefas, contatos e conversão segura de leads;
- central de comunicações com opt-out, outbox e lembretes idempotentes;
- central de relacionamento com contatos sugeridos por situação, prazos e mensagens configuráveis, registro de contatos e aniversariantes, sem envio automático;
- pesquisa de satisfação por atendimento, com NPS em Relatórios e alerta de avaliação baixa na central de relacionamento;
- modelos versionados e documentos com snapshot imutável;
- relatórios gerenciais por período, DRE básica e rentabilidade por serviço/produto com exportação CSV;
- livro mensal de vendas e cancelamentos, comparação com o mês anterior, clientes sem retorno e exportação Excel detalhada;
- trilha inicial de auditoria no modelo de dados;
- interface responsiva para desktop, tablet e celular.

O repositório inclui dois modos de armazenamento: memória, para avaliação imediata, e PostgreSQL, para manter os dados entre reinicializações. No modo PostgreSQL, as migrações são executadas automaticamente e o banco impede conflitos simultâneos de profissional ou sala.

## Executar localmente

Requisitos: Node.js 22 ou mais recente e npm.

```bash
npm install
npm run dev
```

A interface ficará em `http://localhost:5173` e a API em `http://localhost:3333`.

Credenciais de demonstração:

```text
admin@movimenta.local
Admin@123
```

O ambiente de demonstração traz 123 clientes fictícios, incluindo 120 cadastros variados de fisioterapia, depilação, dançaterapia e outros serviços. Há clientes ativos e inativos, com e sem e-mail, além de contatos, datas de nascimento e etiquetas para avaliar listas, buscas e formulários. Os e-mails usam `example.com` e os dados adicionais têm identificadores fixos; no PostgreSQL, executar o seed novamente não duplica esses cadastros.

### Cenários de operação

Com `SEED_DEMO_DATA=true`, a demonstração também inclui 56 planos com preços e parcelas, 160 atendimentos individuais, uma turma de dançaterapia duas vezes por semana e seu histórico de aulas e presenças. Busque as etiquetas abaixo em **Clientes** para examinar cada trajetória:

| Etiqueta | Cenário | Valor simulado |
| --- | --- | --- |
| Frequente / Dançaterapia | 8 clientes em plano ativo de 24 aulas, com presença e próximas aulas | R$ 1.497 em 3 parcelas |
| Frequente / Pilates | 8 clientes com sessões concluídas e retorno agendado | R$ 1.200 em 2 parcelas |
| Em tratamento | 8 clientes com pacote de fisioterapia e saldo de sessões | R$ 1.500 em 2 parcelas |
| Serviço avulso | 8 compras de depilação de pernas ou axilas | R$ 120 ou R$ 55 |
| Assinatura cancelada | 8 ex-alunos de dançaterapia com pagamentos e parcelas canceladas | R$ 1.497 por plano |
| Sem retorno | 8 clientes com pacote vencido e sessões restantes | R$ 1.500 por pacote |
| Pagamento atrasado | 8 clientes de Pilates com plano ativo e parcela vencida | R$ 1.200 em 2 parcelas |

Os planos recorrentes representam períodos contratados com sessões e parcelas. Ao fim da validade, os que têm renovação automática ganham o período seguinte com as mesmas condições; qualquer plano também pode ser renovado manualmente em **Planos**, com valores ajustáveis. As datas são posicionadas em relação ao dia em que a base é carregada pela primeira vez; reiniciar a API preserva os registros e as alterações feitas neles.

## Verificações

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

## Relatório mensal de vendas

Perfis de gestão e financeiro veem no painel o valor vendido, o recebido e os clientes que compareceram no mês anterior sem atendimento concluído no mês atual. A página **Relatórios** permite escolher o mês e baixar um XLSX com resumo, movimentos de vendas e cancelamentos, pagamentos e estornos, clientes sem retorno e definições dos indicadores. O mês em andamento é comparado com os mesmos dias do mês anterior; vendas seguem a data da criação do plano ou do fechamento da comanda, enquanto recebimentos seguem a data do movimento financeiro.

## Banco de dados local

PostgreSQL e Redis podem ser iniciados com:

```bash
docker compose up -d
```

Copie `.env.example` para `.env` e configure:

```text
STORAGE_MODE=postgres
DATABASE_URL=postgresql://crm:crm@localhost:5432/crm
SEED_DEMO_DATA=true
```

Se a porta 5432 já estiver ocupada, defina `CRM_POSTGRES_PORT` e use a mesma porta em `DATABASE_URL` nesse arquivo.

```bash
npm run db:setup
npm run dev
```

`SEED_DEMO_DATA=false` desativa os dados fictícios. As migrações aplicadas ficam registradas em `schema_migrations` e podem ser executadas novamente com segurança.

Para testar a implementação contra um banco exclusivo de testes:

```bash
TEST_DATABASE_URL=postgresql://crm:crm@localhost:5432/crm_test npm run test:postgres
```

Nunca aponte `TEST_DATABASE_URL` para um banco de produção: o teste cria e remove registros próprios.

## Estrutura

```text
apps/api                 API Fastify e regras de negócio
apps/web                 aplicação React responsiva
packages/contracts       contratos e validações compartilhadas
docs                     levantamento funcional e plano do produto
```

## Escopo deliberadamente excluído

Não existe aplicativo, login, portal ou autoatendimento do cliente. Toda a operação é realizada pela equipe da clínica, conforme definido no plano do projeto.
