# Cadastrar um novo cliente sem contratar um plano

Revisão conferida no código e nos testes: `0e3485f61844fd9aa9d2adb79791ed09c0b28409`.

- **Também perguntam:** Como cadastrar um novo cliente? Como faço só a ficha do cliente? Como cadastro um aluno?
- **Onde começar:** Menu lateral → [Clientes](https://crm.organizastudios.com/clientes).
- **Antes de começar:** Seu acesso deve permitir cadastrar clientes. Separe os dados do cliente e do contato de emergência. Este tutorial cobre somente o cadastro, sem adicionar plano, serviço, produto ou aula experimental.

1. Clique em **Novo cliente**, no topo da tela.
2. Preencha **Nome completo**.
3. Informe um **CPF** válido. Se ele já estiver cadastrado, busque a ficha existente em **Clientes**.
4. Na seção **Contato**, preencha **Telefone** e **WhatsApp**.
5. Na seção **Contato de emergência**, preencha **Nome**, **Telefone** e **WhatsApp**. Se o contato for o próprio cliente, use **Usar os dados do cliente**.
6. Se aparecer a seção **O que o cliente vai fazer?**, deixe-a sem itens. Ela mostra **Nada adicionado: só o cadastro do cliente será salvo.**
7. Clique em **Salvar cliente**.

**Como saber se deu certo:** O formulário fecha e aparece um aviso de cadastro criado. Para localizar o cadastro, use **Buscar por nome, CPF ou telefone** e clique em **Buscar**. O teste confirma que o cliente pode ser encontrado e editado após salvar. Este fluxo não exige clicar em Concluir nem abre a antiga confirmação Cliente cadastrado.

**Se o botão não aparecer:** Confira se seu acesso permite cadastrar clientes. Em um perfil só de consulta, a lista oferece **Ver**, abre **Consultar cliente** com os campos bloqueados e não oferece salvar alterações. Se **Salvar cliente** estiver desabilitado, confira os campos obrigatórios.

**Verificação:** Rótulos, permissão do botão, modo de consulta e aviso conferidos no código e no teste de perfil só de consulta. Cadastro, fechamento do formulário, busca e ausência da antiga confirmação conferidos no teste de ponta a ponta da mesma revisão. Não houve envio de formulário na produção nesta implementação.

**Fontes:** [PatientsPage.tsx](https://github.com/Bren0-lz/crm-studios/blob/0e3485f61844fd9aa9d2adb79791ed09c0b28409/apps/web/src/features/patients/PatientsPage.tsx) · [PatientModal.tsx](https://github.com/Bren0-lz/crm-studios/blob/0e3485f61844fd9aa9d2adb79791ed09c0b28409/apps/web/src/features/patients/PatientModal.tsx) · [patient-nickname.integration.test.tsx](https://github.com/Bren0-lz/crm-studios/blob/0e3485f61844fd9aa9d2adb79791ed09c0b28409/apps/web/src/features/patients/patient-nickname.integration.test.tsx) · [patients.spec.ts](https://github.com/Bren0-lz/crm-studios/blob/0e3485f61844fd9aa9d2adb79791ed09c0b28409/e2e/patients.spec.ts) · [view-only-modules.integration.test.tsx](https://github.com/Bren0-lz/crm-studios/blob/0e3485f61844fd9aa9d2adb79791ed09c0b28409/apps/web/src/features/settings/view-only-modules.integration.test.tsx)
