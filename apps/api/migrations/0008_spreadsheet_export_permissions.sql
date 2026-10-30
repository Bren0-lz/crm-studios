-- A permissão genérica "Exportar relatórios" vira uma permissão por planilha. Quem já exportava
-- mantém a exportação de cada relatório que consegue consultar.
UPDATE `users` SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'reports.dre_export')
WHERE JSON_CONTAINS(permissions, '"reports.export"') AND JSON_CONTAINS(permissions, '"reports.dre"')
  AND NOT JSON_CONTAINS(permissions, '"reports.dre_export"');
UPDATE `users` SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'reports.financial_export')
WHERE JSON_CONTAINS(permissions, '"reports.export"') AND JSON_CONTAINS(permissions, '"reports.dre"')
  AND NOT JSON_CONTAINS(permissions, '"reports.financial_export"');
UPDATE `users` SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'reports.management_export')
WHERE JSON_CONTAINS(permissions, '"reports.export"') AND JSON_CONTAINS(permissions, '"reports.management"')
  AND NOT JSON_CONTAINS(permissions, '"reports.management_export"');
UPDATE `users` SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'reports.clients_export')
WHERE JSON_CONTAINS(permissions, '"reports.export"') AND JSON_CONTAINS(permissions, '"reports.clients"')
  AND NOT JSON_CONTAINS(permissions, '"reports.clients_export"');
UPDATE `users` SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'reports.sales_export')
WHERE JSON_CONTAINS(permissions, '"reports.export"') AND JSON_CONTAINS(permissions, '"reports.sales"')
  AND NOT JSON_CONTAINS(permissions, '"reports.sales_export"');
UPDATE `users` SET permissions = JSON_REMOVE(permissions, JSON_UNQUOTE(JSON_SEARCH(permissions, 'one', 'reports.export')))
WHERE JSON_CONTAINS(permissions, '"reports.export"');
