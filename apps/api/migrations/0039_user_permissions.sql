-- Cargo informativo e módulos por usuário (T047).
-- modules NULL = o usuário segue o padrão do perfil (roleDefaultModules nos contratos).
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title text NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS modules text[] NULL;
