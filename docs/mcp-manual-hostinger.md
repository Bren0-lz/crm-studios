# MCP do manual — piloto na Hostinger

Implementação para revisão; **não publicada em produção**. Não altera o login do CRM, não faz migração e não cria acesso ao banco. Não precisa de assinatura do ChatGPT, de chamadas ao Sites nem de chave OpenAI.

## Servidor e transporte

O hPanel executa `npm start` na raiz, que inicia `apps/api/dist/site-server.mjs`. `scripts/hostinger-build.mjs` gera esse bundle a partir de `apps/api/src/site-server.ts` e compila o site com `VITE_API_URL=/api`. O servidor encaminha `/api/*` para o Fastify removendo o prefixo; a rota interna `/mcp` vira **`https://crm.organizastudios.com/api/mcp`**. `apps/api/src/app.ts` registra o módulo de ajuda junto das rotas existentes.

SDK oficial TypeScript `@modelcontextprotocol/sdk` 1.32.2, compatível com Node 22+. Transporte **Streamable HTTP**, sem sessão, com respostas JSON. O cliente envia `Accept: application/json, text/event-stream`; GET e DELETE autenticados retornam 405 porque não há stream de notificações nem sessão a encerrar. Na inicialização, o servidor envia **instruções** ao agente: os guias são a base de conhecimento do CRM, não uma lista de perguntas e respostas; o agente interpreta a pergunta, pesquisa com várias formulações, lê os guias pertinentes, adapta e combina os passos, e diz claramente o que os guias não cobrem. São quatro ferramentas de leitura: `buscar_guias` (`consulta` de até 300 caracteres; devolve até 8 guias próximos com aderência alta ou parcial, sem os passos), `ler_guias` (`ids`, de 1 a 10; devolve o texto completo e as referências), `listar_guias` (`area` opcional; índice por área) e `visao_geral_crm` (`modulo` opcional; menu, telas, endereços, conceitos e as operações de cada módulo, montados do código: `navMenu` e o catálogo de permissões de `@crm/contracts`). Não há recursos MCP nem ferramentas de escrita.

## Acesso autorizado no Claude

Escolha: **token Bearer exclusivo do piloto**, configurado no Claude em **Request headers**. A [documentação oficial do Claude](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp), consultada em 23/11/2026, confirma cabeçalhos fixos para API keys/Bearer e a opção **No sign in** quando não há fluxo OAuth. Não usar o token de login nem uma chave de integração do CRM.

Essa escolha evita manter um novo provedor OAuth para um piloto de leitura. O conector precisa oferecer **Request headers** na conta do cliente; essa disponibilidade ainda deve ser conferida nessa conta. Se a opção não existir, não coloque o token na URL e não torne a rota pública: mantenha o piloto desligado até configurar uma alternativa de autenticação suportada.

Gere um token aleatório de 32 bytes em um terminal seguro **fora de logs compartilhados**. Exemplo para execução pelo responsável (a implementação e os testes usam somente credenciais fictícias):

```sh
node --input-type=module -e 'import { randomBytes, createHash } from "node:crypto"; const token = randomBytes(32).toString("base64url"); console.log(JSON.stringify({ token, MCP_ACCESS_TOKEN_SHA256: createHash("sha256").update(token).digest("hex") }, null, 2));'
```

Guarde o token no gerenciador de senhas e no campo protegido de cabeçalhos do Claude. Configure **somente o hash** no servidor. Não coloque credenciais em código, `.env` versionado, `VITE_*`, histórico de comandos, issues ou PR. Nenhuma credencial real foi criada/configurada nesta entrega.

| Variável no app Node do hPanel | Valor |
| --- | --- |
| `MCP_PUBLIC_ORIGIN` | Origem HTTPS exata do CRM, sem `/` final. Produção: `https://crm.organizastudios.com`; homologação: sua origem HTTPS própria. |
| `MCP_ACCESS_TOKEN_SHA256` | Hash SHA-256 hexadecimal minúsculo de 64 caracteres do token aleatório do piloto. |

Sem ambas as variáveis válidas, `/api/mcp` responde **503 `MCP_UNAVAILABLE`** e o restante do CRM continua funcionando. Não há segredo padrão. Com o piloto ligado, requisições sem token, token inválido, token na query string ou JWT do CRM recebem **401**. A IA nunca recebe o segredo. Requests com `Origin` diferente da origem configurada recebem 403; clientes remotos servidor a servidor normalmente não enviam `Origin`.

O limite é 120 requisições autenticadas por minuto por processo, incluindo notificações de inicialização. Não há log de consultas, corpos ou credenciais na rota MCP. O corpo HTTP tem limite de 16 KiB. O limite e a credencial única são próprios de um piloto; para vários clientes, adotar credenciais individuais/revogação por cliente antes de expandir o acesso. Para revogar agora, retire `MCP_ACCESS_TOKEN_SHA256` e reinicie; para rotacionar, substitua o hash, reinicie e atualize o token no Claude. O token não expira automaticamente.

## Material e revisão do CRM

O código salvo do Sites não pôde ser obtido: sua versão 4 foi localizada, mas o download do arquivo de fonte não pôde ser autorizado/resolvido. A busca deste servidor é local e usa exclusivamente os tutoriais permitidos do repositório. Não usa o serviço do Sites nem pesquisa a main pela rede durante as consultas.

O corpus `apps/api/src/modules/manual/manual-data.json` contém os guias verificados de `docs/guias-mcp-fluxos-verificados.md`, a ajuda de clientes e os tutoriais legados ainda válidos (241 em 25/11/2026), referências fixas ao código/testes e hashes dos arquivos conferidos. Nunca contém arquivos brutos dos testes, fixtures, cadastros ou resultados do banco. `search.ts` só lê esse corpus empacotado; `routes.ts` não recebe o repositório do CRM. As referências podem apontar a testes no GitHub como evidência, mas o conteúdo desses arquivos não é servido pela ferramenta. Em repositório privado, a IA usa o trecho retornado; abrir a referência pode exigir acesso ao GitHub.

Nove tutoriais vieram de `docs/manual-crm-organiza-studios.md`: somente os que ainda têm fontes idênticas à revisão auditada foram reaproveitados. Seis tutoriais antigos foram excluídos por mudança nas fontes: agendamento, remarcação, cadastro de cliente, estorno de parcela, evento e relatórios. O cadastro ganhou um tutorial novo em `docs/ajuda-mcp-clientes.md`, conferido contra a revisão `0e3485f61844fd9aa9d2adb79791ed09c0b28409`, inclusive o teste atual que confirma ausência da antiga janela **Cliente cadastrado**. Os outros cinco fluxos não têm tutorial atualizado neste piloto.

Cada resposta inclui `revisao.fontes` (commit das fontes conferidas), `revisao.material` (SHA-256 do corpus), cobertura parcial e referências por trecho. Correspondência de palavras exige cobertura mínima e prioriza títulos. A busca é conservadora, sem modelo de IA: algumas formulações podem precisar de outra consulta. Sem evidência, retorna `evidencia_insuficiente`, `trechos: []` e orientação explícita para não inventar passos.

**A interface publicada foi conferida em 23/11/2026:** o JavaScript e o CSS públicos são idênticos, byte a byte, aos gerados pelo build Hostinger da base inicial `5a0889d0d2a18c1b542c116e949bfd1dd99080bc`. Depois dessa comparação, a branch incorporou a main `8c39314434d6ba8c32c6cb43f86ba9bc12378ac5`; a ajuda de clientes foi revalidada contra a nova versão, que também contém o modo **Consultar cliente**. Os hashes abaixo documentam a versão publicada no momento da inspeção, anterior à atualização final da branch. A comparação foi somente de arquivos estáticos, sem login nem acesso a dados. Evidência:

| Arquivo público | SHA-256, igual no publicado e no build local |
| --- | --- |
| `index-DlKDLrOf.js` | `b864a6c8953f799eb69d9deada6d8bfbb605d288a5a82b887030d958e4d77801` |
| `index-DDNK18Dp.css` | `963f8a8ba8338547cc85c9fc33628cd3389067f9f9bd9257145cf0a9342d710b` |

**O commit da API publicada ainda não foi confirmado.** Uma segunda leitura pública depois da atualização da branch já mostrou `index-BsX9uZ-h.js`, enquanto o build integrado gerou `index-Dx6S13Mq.js` e `index-CBUH1cKP.css`. Portanto, os hashes da tabela registram a primeira inspeção, não garantem a versão que o domínio serve depois dela. O material atual corresponde ao artefato integrado da branch; sua ativação deve acompanhar a publicação desse artefato completo. Para usar o MCP, publique o **CRM e o manual juntos no mesmo artefato revisado**; não ative este manual como se representasse um deploy antigo não identificado. O build verifica os hashes dos documentos e das fontes diretas antes de empacotar. Guia cuja fonte mudou depois da revisão fica fora do pacote publicado, com aviso no build; o restante continua disponível. O hash do material retornado pelo teste remoto deve ser igual ao do corpus aprovado.

### Atualizar em novos deploys

1. Atualize a branch a partir da main que será publicada. Revise os tutoriais cujos campos, botões, permissões ou resultados mudaram, consultando interface e testes da mesma revisão.
2. Para clientes, atualize `docs/ajuda-mcp-clientes.md` e seus links/commit após conferir os passos. Para os tutoriais legados, revise `docs/manual-crm-organiza-studios.md` e suas referências; não troque apenas o SHA sem rever as instruções.
3. Com o histórico Git disponível, execute `node scripts/prepare-mcp-manual.mjs --write`. A geração só reaproveita tutoriais cujas fontes citadas correspondem à revisão auditada; a ajuda de clientes falha se suas fontes não conferirem. Examine a lista de exclusões e o diff do JSON. Não edite o JSON manualmente.
4. Rode os testes relevantes dos fluxos alterados, os testes MCP, `npm run check` e `npm run hostinger-build`. Registre no PR as exclusões, os testes e a revisão do corpus. O build normal apenas verifica os hashes; ele não atualiza nem promove material automaticamente e não precisa de Git em execução.

   Quando um PR do CRM altera uma fonte citada sem revisar o guia, o build **não falha**: `node scripts/prepare-mcp-manual.mjs` avisa quais guias ficaram desatualizados e o `hostinger-build` os tira do pacote, recalculando o hash do material servido. Para exigir o catálogo completo (antes de liberar o piloto, por exemplo), use `node scripts/prepare-mcp-manual.mjs --strict`. Edição à mão do JSON ou dos documentos de guias sem `--write` continua falhando o build.
5. Aprove o PR/artefato e publique o site e a API juntos. Confira o teste remoto e o conector na conta do cliente antes de liberar o piloto. Para restaurar, volte ao artefato completo anterior ou desligue o MCP.

A verificação de hashes cobre as fontes diretas citadas, não substitui testes nem revisão de dependências/componentes compartilhados quando eles mudarem.

## Publicação a revisar no hPanel

1. Revise o PR e valide o artefato em uma aplicação de homologação separada. Não aponte testes ao banco da produção. Esta entrega não alterou branch de produção, não executou migrações e não publicou o site.
2. Na aplicação Node existente, mantenha a configuração atual do CRM e Node 22+. O comando de instalação é `npm ci`, o de build é **`npm run hostinger-build`** e o de início é **`npm start`**. O proxy deve preservar `/api/mcp`, `Authorization`, `Accept`, `Content-Type` e `MCP-Protocol-Version`.
3. Após aprovação do deploy, selecione o commit revisado, configure as duas variáveis do piloto e publique/reinicie. As variáveis existentes do CRM continuam necessárias (`STORAGE_MODE=mysql`, banco, `JWT_SECRET` etc.); não as substitua pelas do MCP. A inicialização existente do CRM aplica migrações conforme o fluxo atual do projeto; esta mudança não adiciona migrações.
4. Confira HTTPS, login, `/api/health` e navegação do CRM. Sem credencial, `POST /api/mcp` deve retornar 401; desligando a configuração, 503.
5. Execute o smoke test abaixo. Compare `revisao` com o corpus aprovado. Uma página HTML, um redirecionamento para login ou um 404 indicam que o proxy está encaminhando a rota incorretamente.

### Smoke test com SDK oficial

Após `npm ci`, em terminal Bash seguro, use variáveis transitórias. O script não imprime a credencial e usa apenas consultas ao manual:

```sh
export MCP_TEST_URL='https://crm.organizastudios.com/api/mcp'
read -r -s -p 'Token do piloto: ' MCP_TEST_TOKEN
export MCP_TEST_TOKEN
node scripts/test-mcp-remote.mjs
unset MCP_TEST_TOKEN
```

Execute o script a partir do checkout que gerou o artefato. Ele exige que a revisão das fontes e o hash retornados pelo servidor coincidam com o corpus desse checkout. Também valida o 401 sem credencial, a inicialização com as instruções, as quatro ferramentas, a busca e a leitura do guia de cadastro e de GR04 (quando estão no pacote), a falta de guia sobre nota fiscal e a visão geral. A verificação rejeita redirecionamentos. HTTP só é aceito em localhost.

Para testar o artefato em memória, execute `npm run hostinger-build` e `node scripts/test-mcp-remote.mjs --local`. O CI usa esses comandos com Node 22. O modo local cria uma credencial descartável e também verifica o 503 com o piloto desativado, o acesso à saúde da API, a autenticação de Clientes e a entrega da interface pelo servidor da Hostinger.

### Conector na conta do cliente no Claude

Os nomes podem variar conforme idioma/versão da conta; os rótulos abaixo são os confirmados na documentação atual do Claude, não na conta do cliente.

1. Abra **Settings → Connectors** e **Add custom connector** (em organizações, pode ser necessário o administrador).
2. Nomeie **Manual do CRM Organiza Studios**. Informe a URL HTTPS **`https://crm.organizastudios.com/api/mcp`** ou a URL de homologação aprovada.
3. Em **Authentication**, selecione **No sign in**: a autenticação será feita pelo cabeçalho fixo. Em **Request headers**, adicione o nome **Authorization** e o valor **Bearer TOKEN_DO_PILOTO**. Não configure OAuth e não inclua o token na URL.
4. Salve e habilite o conector em uma conversa. Pergunte, com suas palavras: **Chegou uma aluna nova, como coloco ela no sistema?** O agente deve buscar e ler os guias antes de responder. Confira português do Brasil, passos curtos, **Novo cliente**, **Salvar cliente**, fontes e revisão. O fluxo simples deve fechar após salvar, sem exigir a antiga confirmação.
5. Pergunte como emitir nota fiscal eletrônica. A resposta deve informar que o material não confirma os passos. Revogue/rotacione o token de homologação e confirme que o conector perde o acesso.

Não confunda independência do ChatGPT com disponibilidade de um recurso/plano do Claude: a conta do cliente ainda precisa permitir o conector remoto e os cabeçalhos fixos. Nenhuma ação foi feita nessa conta nesta entrega.

## Evidência de validação

O relatório do PR e `diario/2026-11-23-MCP1.md` registram os comandos realmente executados e seus resultados. Testes locais usam memória/credenciais fictícias e o cliente oficial MCP. O domínio HTTPS foi lido somente para comparar os arquivos estáticos acima. A validação do novo endpoint no domínio, do proxy hPanel, do commit da API publicada e da conta do cliente permanece pendente até o deploy aprovado. Testes MySQL só cabem com `TEST_DATABASE_URL` de banco isolado; esta funcionalidade não acessa nem altera SQL.
