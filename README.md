# Movimenta CRM

Primeira versão executável de um CRM web para clínicas de fisioterapia, inspirada no fluxo operacional estudado no SeuFisio e construída sem aplicativo ou portal do paciente.

## O que já funciona

- autenticação com perfis de acesso;
- painel com indicadores operacionais;
- cadastro, edição e pesquisa de pacientes;
- profissionais, salas e serviços;
- agenda diária e semanal, recorrência, bloqueios e reagendamento individual com histórico e prevenção de conflitos;
- alteração do status dos atendimentos;
- prontuário clínico SOAP, avaliações configuráveis, objetivos, medições seriadas, anexos protegidos, adendos e visão longitudinal;
- bloqueio de prontuários para perfis sem acesso clínico;
- planos, pacotes, validade, saldo e extrato de sessões;
- consumo automático ao finalizar e estorno ao reabrir atendimentos;
- financeiro com contas a receber e pagar, categorias, centros de custo, ajustes, formas de pagamento, recibos e fluxo de caixa mensal;
- renegociação parcelada e comissões profissionais por competência;
- CRM comercial com Kanban, tarefas, contatos e conversão segura de leads;
- central de comunicações com opt-out, outbox e lembretes idempotentes;
- modelos versionados e documentos com snapshot imutável;
- relatórios gerenciais por período, DRE básica e rentabilidade por serviço/produto com exportação CSV;
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

## Verificações

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

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

Não existe aplicativo, login, portal ou autoatendimento do paciente. Toda a operação é realizada pela equipe da clínica, conforme definido no plano do projeto.
