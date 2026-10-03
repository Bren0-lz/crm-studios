-- Nível "editar" por módulo e por usuário (T048).
-- edit_modules NULL = o usuário segue o padrão do perfil (roleDefaultEditModules nos contratos).
-- Editar implica ver: módulos com edição fora dos visíveis são descartados pela aplicação.
ALTER TABLE users ADD COLUMN IF NOT EXISTS edit_modules text[] NULL;
