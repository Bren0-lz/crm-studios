-- Crédito da comanda (QC8): o histórico mostra "Serviço avulso na comanda" em vez de
-- "Plano contratado" e o registro perde o código interno da comanda. Saldos não mudam.
UPDATE audit_events ae
SET action = 'plan.tab_credit',
    description = 'Serviço avulso na comanda',
    metadata = CASE WHEN ae.metadata ? 'subjectName'
      THEN ae.metadata || jsonb_build_object('subjectName',
        (SELECT string_agg(x.service_name, ', ' ORDER BY x.position)
           FROM patient_plan_services x WHERE x.plan_id = p.id) || ' · pago na comanda')
      ELSE ae.metadata END
FROM patient_plans p
WHERE ae.clinic_id = p.clinic_id
  AND ae.source_table = 'patient_plans'
  AND ae.source_id = p.id
  AND ae.action = 'plan.created'
  AND p.source_tab_id IS NOT NULL;
