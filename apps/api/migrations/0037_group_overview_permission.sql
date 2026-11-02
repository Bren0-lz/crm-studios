-- A aba "Visão geral" de Turmas ganha permissão própria. Quem já abria Turmas continua vendo a aba;
-- o administrador pode retirá-la depois em Administração > Usuários.
UPDATE `users` SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'groups.overview')
WHERE JSON_CONTAINS(permissions, '"groups.view"')
  AND NOT JSON_CONTAINS(permissions, '"groups.overview"');
