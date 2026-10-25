-- WhatsApp do usuário (só dígitos, com DDD), usado para compartilhar a agenda do profissional.
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp text NULL;
