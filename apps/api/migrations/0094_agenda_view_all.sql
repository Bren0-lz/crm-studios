-- Nova operação "Ver agenda de todos os profissionais". Sem ela, a agenda e o painel inicial
-- mostram só o profissional ligado ao usuário. Quem já vê a Agenda mantém a visão de todos.
UPDATE users SET permissions = array_append(permissions, 'agenda.view_all')
WHERE permissions @> ARRAY['agenda.view']::text[]
  AND NOT permissions @> ARRAY['agenda.view_all']::text[];
