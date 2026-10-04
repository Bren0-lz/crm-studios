-- Permissões livres (T055): o tipo de usuário passa a ser só 'admin' (acesso total, inclusive
-- Administração) ou 'user' (usuário comum: só os módulos gravados em modules/edit_modules;
-- NULL = nenhum). Acabam os padrões por perfil.
--
-- Ninguém ganha nem perde acesso: recepção, fisioterapeuta e financeiro viram 'user' com os
-- módulos EFETIVOS de hoje gravados — o ajuste que já tinham ou, quando NULL, o padrão do
-- perfil (roleDefaultModules/roleDefaultEditModules dos contratos até a T055, conferidos em
-- apps/api/src/legacy-roles.ts e legacy-roles.test.ts). Editar fora dos módulos vistos já era
-- descartado e continua sendo descartado pela aplicação. 'owner' vira 'admin' sem lista.
--
-- Roda dentro de uma transação (runMigrations): por isso a coluna vira text + CHECK em vez de
-- ganhar valores novos no ENUM (valor novo de ENUM não pode ser usado na mesma transação).
-- Todos os passos podem ser repetidos sem erro. O tipo user_role (0001) fica sem uso.

-- 1) ENUM user_role → text (sem efeito se a coluna já for text).
ALTER TABLE users ALTER COLUMN role TYPE text USING role::text;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- 2) Grava os módulos efetivos de hoje de cada perfil comum (mantém o ajuste já gravado).
UPDATE users
  SET modules = COALESCE(modules, ARRAY['agenda', 'groups', 'patients', 'plans', 'crm', 'relationship', 'communications', 'contracts', 'settings']::text[]),
    edit_modules = COALESCE(edit_modules, ARRAY['agenda', 'groups', 'patients', 'plans', 'crm', 'relationship', 'communications', 'contracts']::text[])
  WHERE role = 'reception';

UPDATE users
  SET modules = COALESCE(modules, ARRAY['agenda', 'groups', 'patients', 'plans', 'clinical']::text[]),
    edit_modules = COALESCE(edit_modules, ARRAY['agenda', 'groups', 'clinical']::text[])
  WHERE role = 'physiotherapist';

UPDATE users
  SET modules = COALESCE(modules, ARRAY['agenda', 'patients', 'plans', 'crm', 'relationship', 'communications', 'contracts', 'finance', 'reports', 'settings']::text[]),
    edit_modules = COALESCE(edit_modules, ARRAY['agenda', 'patients', 'plans', 'crm', 'relationship', 'communications', 'contracts', 'finance']::text[])
  WHERE role = 'finance';

-- 3) A gestora (owner) vira admin: acesso total, sem lista gravada.
UPDATE users SET modules = NULL, edit_modules = NULL WHERE role = 'owner';

-- 4) Troca os perfis antigos pelos tipos novos.
UPDATE users
  SET role = CASE WHEN role = 'owner' THEN 'admin' ELSE 'user' END
  WHERE role IN ('owner', 'reception', 'physiotherapist', 'finance');

ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'));
