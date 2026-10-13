# Contratos compartilhados

- `src/<domínio>/model.ts`: schemas Zod e funções puras; `types.ts`: interfaces/tipos; `index.ts`: entrada pública do domínio.
- A entrada raiz preserva os imports `@crm/contracts`; prefira o domínio específico quando ele resolver toda a necessidade.
- Imports internos são direcionados e usam extensão `.js` para NodeNext; não importe o index raiz de dentro do pacote.
- Helpers genéricos ficam em common; regras de planos ficam em plans. Contratos nunca dependem de apps/api ou apps/web.
- Testes validam comportamento: entradas válidas/inválidas, defaults, datas e valores limítrofes. Não replique schemas nos testes.
- Use `npm exec -w @crm/contracts -- vitest run src/...unit.test.ts` e rode typecheck ao alterar tipos públicos.
