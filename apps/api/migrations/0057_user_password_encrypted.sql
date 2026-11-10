-- Cópia cifrada (AES-256-GCM, formato `v1:<nonce>:<tag>:<cifra>`) da senha do usuário, que o
-- admin pode consultar. Usuários existentes ficam com NULL até a próxima troca de senha.
ALTER TABLE `users` ADD COLUMN `password_encrypted` LONGTEXT NULL;
