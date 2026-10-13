# Frontend

- `src/App.tsx` é a entrada compatível; `src/app` compõe providers, navegação e Shell.
- `src/features/<domínio>` reúne páginas, modais, model.ts, types.ts e testes de fluxos. `index.ts` exporta apenas o que outros domínios consomem.
- `src/shared/components`, `hooks`, `lib` e `auth` contêm código reutilizável. `shared/workflows` contém contratos/contextos entre fluxos.
- `src/api.ts` preserva a API do cliente HTTP; implementação em `shared/api`: transporte, sessão e chamadas por domínio.
- `styles.css` importa estilos numerados em `src/styles`, na ordem da cascata. Não reordene imports sem verificar desktop e celular.
- Testes próximos da funcionalidade; utilitários de teste em `src/test-support`; limpeza global em `test-setup.ts`.
- Reaproveite PageHeader, Modal, EmptyState, LoadingBlock, ErrorBanner e as classes/tokens existentes. Modais: fundo não fecha, Esc fecha só o superior, busy bloqueia fechamento.
- Lint bloqueia dependências shared → features e imports internos entre funcionalidades. Arquitetura verifica ciclos de execução.
- Execute testes focados durante a mudança e `npm run check` ao concluir. Auditoria percorre todas as telas/componentes de produção.
