-- Foto do perfil do usuário (página "Meu perfil"); NULL = sem foto.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data_url text;
