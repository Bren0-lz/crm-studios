-- A permissão genérica "Exportar relatórios" vira uma permissão por planilha. Quem já exportava
-- mantém a exportação de cada relatório que consegue consultar.
UPDATE users SET permissions = permissions || ARRAY(
  SELECT export_key FROM (VALUES
    ('reports.dre', 'reports.dre_export'),
    ('reports.management', 'reports.management_export'),
    ('reports.clients', 'reports.clients_export'),
    ('reports.sales', 'reports.sales_export')
  ) AS spreadsheet(report_key, export_key)
  WHERE report_key = ANY(users.permissions) AND NOT export_key = ANY(users.permissions)
)
WHERE 'reports.export' = ANY(permissions);
UPDATE users SET permissions = array_remove(permissions, 'reports.export')
WHERE 'reports.export' = ANY(permissions);
