-- Unified history projection; original domain records are left untouched.
ALTER TABLE audit_events ADD COLUMN module text NOT NULL DEFAULT 'settings';
ALTER TABLE audit_events ADD COLUMN description text NOT NULL DEFAULT 'Alteração registrada';
ALTER TABLE audit_events ADD COLUMN source_table text;
ALTER TABLE audit_events ADD COLUMN source_id uuid;
CREATE UNIQUE INDEX audit_events_source_idx ON audit_events (clinic_id, source_table, source_id)
  WHERE source_table IS NOT NULL;
UPDATE audit_events ae SET module=c.module,description=c.label FROM (VALUES
  ('user.created','settings','Usuário cadastrado'),
  ('user.updated','settings','Usuário atualizado'),
  ('user.password_reset','settings','Senha redefinida'),
  ('users.permissions_updated','settings','Permissões de acesso alteradas'),
  ('users.commission_updated','settings','Comissão alterada'),
  ('users.professional_updated','settings','Vínculo com profissional alterado'),
  ('clinic.updated','settings','Dados da clínica atualizados'),
  ('patient_tag.created','settings','Etiqueta criada'),
  ('patient_tag.updated','settings','Etiqueta alterada'),
  ('patient_tag.deleted','settings','Etiqueta excluída'),
  ('patients.exported','patients','Lista de clientes exportada'),
  ('financial.created','finance','Conta a receber criada'),
  ('financial.payment','finance','Pagamento recebido'),
  ('financial.payment_reversal','finance','Recebimento estornado'),
  ('financial.cancellation','finance','Recebível cancelado'),
  ('payable.created','finance','Conta a pagar criada'),
  ('payable.payment','finance','Conta paga'),
  ('payable.payment_reversal','finance','Pagamento estornado'),
  ('payable.cancellation','finance','Conta a pagar cancelada'),
  ('appointment.rescheduled','agenda','Atendimento reagendado'),
  ('lead.stage_changed','crm','Lead movimentado no funil'),
  ('clinical.revision','clinical','Versão de prontuário registrada'),
  ('session.movement','plans','Saldo de sessões movimentado'),
  ('stock.movement','patients','Estoque movimentado'),
  ('lead.contact','crm','Contato com lead registrado'),
  ('relationship.contact','relationship','Contato com cliente registrado'),
  ('message.created','communications','Mensagem registrada'),
  ('satisfaction.created','agenda','Pesquisa de satisfação registrada'),
  ('patient.created','patients','Cliente cadastrado'),
  ('appointment.created','agenda','Atendimento agendado'),
  ('plan.created','plans','Plano contratado'),
  ('lead.created','crm','Lead cadastrado'),
  ('lead.task_created','crm','Tarefa de lead criada'),
  ('product.created','patients','Produto cadastrado'),
  ('tab.created','patients','Comanda aberta'),
  ('group.created','groups','Turma criada'),
  ('group.enrolled','groups','Cliente matriculado em turma'),
  ('group.session_created','groups','Aula de turma criada'),
  ('schedule.block_created','agenda','Bloqueio de agenda criado'),
  ('professional.created','agenda','Profissional cadastrado'),
  ('room.created','agenda','Sala cadastrada'),
  ('service.created','agenda','Serviço cadastrado'),
  ('clinical.record_created','clinical','Prontuário criado'),
  ('clinical.attachment_created','clinical','Anexo clínico registrado'),
  ('clinical.addendum_created','clinical','Adendo clínico registrado'),
  ('clinical.template_created','clinical','Modelo de avaliação criado'),
  ('clinical.assessment_created','clinical','Avaliação clínica registrada'),
  ('clinical.goal_created','clinical','Objetivo terapêutico criado'),
  ('clinical.measurement_created','clinical','Medida clínica registrada'),
  ('clinical.closure_created','clinical','Encerramento clínico registrado'),
  ('finance.renegotiated','finance','Recebíveis renegociados'),
  ('commission.rule_created','finance','Regra de comissão criada'),
  ('commission.created','finance','Comissão gerada'),
  ('recurring_payable.created','finance','Conta recorrente criada'),
  ('contract.template_created','contracts','Modelo de contrato criado'),
  ('contract.created','contracts','Contrato registrado'),
  ('holiday.created','settings','Feriado cadastrado')) AS c(action,module,label) WHERE ae.action=c.action;

CREATE FUNCTION system_history_action_label(action_code text, fallback text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE action_code
    WHEN 'user.created' THEN 'Usuário cadastrado'
    WHEN 'user.updated' THEN 'Usuário atualizado'
    WHEN 'user.password_reset' THEN 'Senha redefinida'
    WHEN 'users.permissions_updated' THEN 'Permissões de acesso alteradas'
    WHEN 'users.commission_updated' THEN 'Comissão alterada'
    WHEN 'users.professional_updated' THEN 'Vínculo com profissional alterado'
    WHEN 'clinic.updated' THEN 'Dados da clínica atualizados'
    WHEN 'patient_tag.created' THEN 'Etiqueta criada'
    WHEN 'patient_tag.updated' THEN 'Etiqueta alterada'
    WHEN 'patient_tag.deleted' THEN 'Etiqueta excluída'
    WHEN 'patients.exported' THEN 'Lista de clientes exportada'
    WHEN 'financial.created' THEN 'Conta a receber criada'
    WHEN 'financial.payment' THEN 'Pagamento recebido'
    WHEN 'financial.payment_reversal' THEN 'Recebimento estornado'
    WHEN 'financial.cancellation' THEN 'Recebível cancelado'
    WHEN 'financial.adjustment' THEN 'Recebível ajustado'
    WHEN 'payable.created' THEN 'Conta a pagar criada'
    WHEN 'payable.payment' THEN 'Conta paga'
    WHEN 'payable.payment_reversal' THEN 'Pagamento estornado'
    WHEN 'payable.cancellation' THEN 'Conta a pagar cancelada'
    WHEN 'appointment.rescheduled' THEN 'Atendimento reagendado'
    WHEN 'lead.stage_changed' THEN 'Lead movimentado no funil'
    WHEN 'clinical.revision' THEN 'Versão de prontuário registrada'
    WHEN 'session.movement' THEN 'Saldo de sessões movimentado'
    WHEN 'stock.movement' THEN 'Estoque movimentado'
    WHEN 'lead.contact' THEN 'Contato com lead registrado'
    WHEN 'relationship.contact' THEN 'Contato com cliente registrado'
    WHEN 'message.created' THEN 'Mensagem registrada'
    WHEN 'satisfaction.created' THEN 'Pesquisa de satisfação registrada'
    WHEN 'patient.created' THEN 'Cliente cadastrado'
    WHEN 'appointment.created' THEN 'Atendimento agendado'
    WHEN 'plan.created' THEN 'Plano contratado'
    WHEN 'lead.created' THEN 'Lead cadastrado'
    WHEN 'lead.task_created' THEN 'Tarefa de lead criada'
    WHEN 'product.created' THEN 'Produto cadastrado'
    WHEN 'tab.created' THEN 'Comanda aberta'
    WHEN 'group.created' THEN 'Turma criada'
    WHEN 'group.enrolled' THEN 'Cliente matriculado em turma'
    WHEN 'group.session_created' THEN 'Aula de turma criada'
    WHEN 'schedule.block_created' THEN 'Bloqueio de agenda criado'
    WHEN 'professional.created' THEN 'Profissional cadastrado'
    WHEN 'room.created' THEN 'Sala cadastrada'
    WHEN 'service.created' THEN 'Serviço cadastrado'
    WHEN 'clinical.record_created' THEN 'Prontuário criado'
    WHEN 'clinical.attachment_created' THEN 'Anexo clínico registrado'
    WHEN 'clinical.addendum_created' THEN 'Adendo clínico registrado'
    WHEN 'clinical.template_created' THEN 'Modelo de avaliação criado'
    WHEN 'clinical.assessment_created' THEN 'Avaliação clínica registrada'
    WHEN 'clinical.goal_created' THEN 'Objetivo terapêutico criado'
    WHEN 'clinical.measurement_created' THEN 'Medida clínica registrada'
    WHEN 'clinical.closure_created' THEN 'Encerramento clínico registrado'
    WHEN 'finance.renegotiated' THEN 'Recebíveis renegociados'
    WHEN 'commission.rule_created' THEN 'Regra de comissão criada'
    WHEN 'commission.created' THEN 'Comissão gerada'
    WHEN 'recurring_payable.created' THEN 'Conta recorrente criada'
    WHEN 'contract.template_created' THEN 'Modelo de contrato criado'
    WHEN 'contract.created' THEN 'Contrato registrado'
    WHEN 'holiday.created' THEN 'Feriado cadastrado'
    WHEN 'clinical.access.read' THEN 'Prontuário consultado'
    WHEN 'clinical.access.export' THEN 'Prontuário exportado'
    WHEN 'clinical.access.upload' THEN 'Anexo clínico enviado'
    WHEN 'clinical.access.download' THEN 'Anexo clínico baixado'
    WHEN 'clinical.access.addendum' THEN 'Adendo clínico registrado'
    ELSE fallback END;
$$;

CREATE FUNCTION project_system_history(source_name text, area text, action_name text,
  label text, is_event boolean, row_data jsonb, imported boolean) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  event_time timestamptz;
  target_id uuid;
  author_id uuid;
  event_metadata jsonb;
  action_code text := action_name;
BEGIN
  -- Do not manufacture timestamps or past changes from current state.
  event_time := COALESCE(row_data->>'created_at', row_data->>'enrolled_at',row_data->>'recorded_at')::timestamptz;
  target_id := (row_data->>'id')::uuid;
  IF event_time IS NULL OR target_id IS NULL THEN RETURN; END IF;
  IF source_name IN ('financial_events','payable_events') THEN
    action_code := action_name || '.' || (row_data->>'kind');
    label := CASE row_data->>'kind'
      WHEN 'payment' THEN CASE WHEN source_name='financial_events' THEN 'Pagamento recebido' ELSE 'Conta paga' END
      WHEN 'payment_reversal' THEN 'Pagamento estornado'
      WHEN 'cancellation' THEN 'Conta cancelada'
      ELSE 'Conta registrada' END;
  ELSIF source_name='clinical_access_events' THEN
    action_code := action_name || '.' || (row_data->>'action');
  END IF;
  label := system_history_action_label(action_code,label);
  -- An existing creation timestamp proves creation, not its original author or values.
  author_id := CASE WHEN is_event THEN COALESCE(row_data->>'actor_user_id',row_data->>'author_user_id',row_data->>'recorded_by_user_id')::uuid ELSE NULL END;
  event_metadata := jsonb_build_object('sourceTable',source_name,'sourceId',target_id,'importedHistory',imported,'actorUnavailable',author_id IS NULL);
  IF NOT imported AND area <> 'clinical' THEN
    event_metadata := event_metadata || jsonb_strip_nulls(jsonb_build_object('subjectName',COALESCE(row_data->>'full_name',row_data->>'name',row_data->>'title')));
  END IF;
  IF is_event AND area <> 'clinical' THEN
    event_metadata := event_metadata || (row_data - ARRAY['clinic_id','id','password_hash','body','snapshot_body','idempotency_key']);
  ELSIF area='clinical' THEN
    -- Never copy clinical contents into the general journal, even for privileged users.
    event_metadata := event_metadata || jsonb_strip_nulls(jsonb_build_object(
      'patientId',row_data->>'patient_id','clinicalRecordId',row_data->>'clinical_record_id',
      'version',row_data->'version','entityType',row_data->>'entity_type','entityId',row_data->>'entity_id'));
  END IF;
  INSERT INTO audit_events (clinic_id,actor_user_id,action,entity_type,entity_id,metadata,created_at,module,description,source_table,source_id)
  VALUES ((row_data->>'clinic_id')::uuid,author_id,action_code,source_name,target_id,event_metadata,event_time,area,label,source_name,target_id)
  ON CONFLICT (clinic_id,source_table,source_id) WHERE source_table IS NOT NULL DO NOTHING;
END;
$$;
CREATE FUNCTION append_system_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb;
BEGIN
  IF TG_TABLE_NAME='clinical_record_revisions' THEN
    row_data := jsonb_build_object('id',NEW.id,'clinic_id',NEW.clinic_id,'created_at',NEW.created_at,
      'clinical_record_id',NEW.clinical_record_id,'author_user_id',NEW.author_user_id,'version',NEW.version);
  ELSE
    row_data := to_jsonb(NEW);
  END IF;
  PERFORM project_system_history(TG_TABLE_NAME,TG_ARGV[0],TG_ARGV[1],TG_ARGV[2],true,row_data,false);
  RETURN NEW;
END;
$$;
SELECT project_system_history('financial_events','finance','financial','Movimentação de recebível registrada',true,to_jsonb(t),true) FROM financial_events t;
CREATE TRIGGER financial_events_system_history AFTER INSERT ON financial_events FOR EACH ROW EXECUTE FUNCTION append_system_history('finance','financial','Movimentação de recebível registrada');
SELECT project_system_history('payable_events','finance','payable','Movimentação de conta a pagar registrada',true,to_jsonb(t),true) FROM payable_events t;
CREATE TRIGGER payable_events_system_history AFTER INSERT ON payable_events FOR EACH ROW EXECUTE FUNCTION append_system_history('finance','payable','Movimentação de conta a pagar registrada');
SELECT project_system_history('appointment_reschedules','agenda','appointment.rescheduled','Atendimento reagendado',true,to_jsonb(t),true) FROM appointment_reschedules t;
CREATE TRIGGER appointment_reschedules_system_history AFTER INSERT ON appointment_reschedules FOR EACH ROW EXECUTE FUNCTION append_system_history('agenda','appointment.rescheduled','Atendimento reagendado');
SELECT project_system_history('lead_stage_history','crm','lead.stage_changed','Lead movimentado no funil',true,to_jsonb(t),true) FROM lead_stage_history t;
CREATE TRIGGER lead_stage_history_system_history AFTER INSERT ON lead_stage_history FOR EACH ROW EXECUTE FUNCTION append_system_history('crm','lead.stage_changed','Lead movimentado no funil');
SELECT project_system_history('clinical_record_revisions','clinical','clinical.revision','Versão de prontuário registrada',true,jsonb_build_object('id',t.id,'clinic_id',t.clinic_id,'created_at',t.created_at,'clinical_record_id',t.clinical_record_id,'author_user_id',t.author_user_id,'version',t.version),true) FROM clinical_record_revisions t;
CREATE TRIGGER clinical_record_revisions_system_history AFTER INSERT ON clinical_record_revisions FOR EACH ROW EXECUTE FUNCTION append_system_history('clinical','clinical.revision','Versão de prontuário registrada');
SELECT project_system_history('clinical_access_events','clinical','clinical.access','Acesso a prontuário registrado',true,to_jsonb(t),true) FROM clinical_access_events t;
CREATE TRIGGER clinical_access_events_system_history AFTER INSERT ON clinical_access_events FOR EACH ROW EXECUTE FUNCTION append_system_history('clinical','clinical.access','Acesso a prontuário registrado');
SELECT project_system_history('session_movements','plans','session.movement','Saldo de sessões movimentado',true,to_jsonb(t),true) FROM session_movements t;
CREATE TRIGGER session_movements_system_history AFTER INSERT ON session_movements FOR EACH ROW EXECUTE FUNCTION append_system_history('plans','session.movement','Saldo de sessões movimentado');
SELECT project_system_history('stock_movements','patients','stock.movement','Estoque movimentado',true,to_jsonb(t),true) FROM stock_movements t;
CREATE TRIGGER stock_movements_system_history AFTER INSERT ON stock_movements FOR EACH ROW EXECUTE FUNCTION append_system_history('patients','stock.movement','Estoque movimentado');
SELECT project_system_history('lead_contacts','crm','lead.contact','Contato com lead registrado',true,to_jsonb(t),true) FROM lead_contacts t;
CREATE TRIGGER lead_contacts_system_history AFTER INSERT ON lead_contacts FOR EACH ROW EXECUTE FUNCTION append_system_history('crm','lead.contact','Contato com lead registrado');
SELECT project_system_history('contact_activities','relationship','relationship.contact','Contato com cliente registrado',true,to_jsonb(t),true) FROM contact_activities t;
CREATE TRIGGER contact_activities_system_history AFTER INSERT ON contact_activities FOR EACH ROW EXECUTE FUNCTION append_system_history('relationship','relationship.contact','Contato com cliente registrado');
SELECT project_system_history('outbound_messages','communications','message.created','Mensagem registrada',true,to_jsonb(t),true) FROM outbound_messages t;
CREATE TRIGGER outbound_messages_system_history AFTER INSERT ON outbound_messages FOR EACH ROW EXECUTE FUNCTION append_system_history('communications','message.created','Mensagem registrada');
SELECT project_system_history('satisfaction_surveys','agenda','satisfaction.created','Pesquisa de satisfação registrada',true,to_jsonb(t),true) FROM satisfaction_surveys t;
CREATE TRIGGER satisfaction_surveys_system_history AFTER INSERT ON satisfaction_surveys FOR EACH ROW EXECUTE FUNCTION append_system_history('agenda','satisfaction.created','Pesquisa de satisfação registrada');
SELECT project_system_history('patients','patients','patient.created','Cliente cadastrado',false,to_jsonb(t),true) FROM patients t;
SELECT project_system_history('appointments','agenda','appointment.created','Atendimento agendado',false,to_jsonb(t),true) FROM appointments t;
SELECT project_system_history('patient_plans','plans','plan.created','Plano contratado',false,to_jsonb(t),true) FROM patient_plans t;
SELECT project_system_history('leads','crm','lead.created','Lead cadastrado',false,to_jsonb(t),true) FROM leads t;
SELECT project_system_history('lead_tasks','crm','lead.task_created','Tarefa de lead criada',false,to_jsonb(t),true) FROM lead_tasks t;
SELECT project_system_history('products','patients','product.created','Produto cadastrado',false,to_jsonb(t),true) FROM products t;
SELECT project_system_history('patient_tabs','patients','tab.created','Comanda aberta',false,to_jsonb(t),true) FROM patient_tabs t;
SELECT project_system_history('group_classes','groups','group.created','Turma criada',false,to_jsonb(t),true) FROM group_classes t;
SELECT project_system_history('group_enrollments','groups','group.enrolled','Cliente matriculado em turma',false,to_jsonb(t),true) FROM group_enrollments t;
SELECT project_system_history('group_sessions','groups','group.session_created','Aula de turma criada',false,to_jsonb(t),true) FROM group_sessions t;
SELECT project_system_history('schedule_blocks','agenda','schedule.block_created','Bloqueio de agenda criado',false,to_jsonb(t),true) FROM schedule_blocks t;
SELECT project_system_history('professionals','agenda','professional.created','Profissional cadastrado',false,to_jsonb(t),true) FROM professionals t;
SELECT project_system_history('rooms','agenda','room.created','Sala cadastrada',false,to_jsonb(t),true) FROM rooms t;
SELECT project_system_history('services','agenda','service.created','Serviço cadastrado',false,to_jsonb(t),true) FROM services t;
SELECT project_system_history('clinical_records','clinical','clinical.record_created','Prontuário criado',false,to_jsonb(t),true) FROM clinical_records t;
SELECT project_system_history('clinical_attachments','clinical','clinical.attachment_created','Anexo clínico registrado',false,jsonb_build_object('id',t.id,'clinic_id',t.clinic_id,'created_at',t.created_at),true) FROM clinical_attachments t;
SELECT project_system_history('clinical_addenda','clinical','clinical.addendum_created','Adendo clínico registrado',false,to_jsonb(t),true) FROM clinical_addenda t;
SELECT project_system_history('assessment_templates','clinical','clinical.template_created','Modelo de avaliação criado',false,to_jsonb(t),true) FROM assessment_templates t;
SELECT project_system_history('clinical_assessments','clinical','clinical.assessment_created','Avaliação clínica registrada',false,to_jsonb(t),true) FROM clinical_assessments t;
SELECT project_system_history('therapeutic_goals','clinical','clinical.goal_created','Objetivo terapêutico criado',false,to_jsonb(t),true) FROM therapeutic_goals t;
SELECT project_system_history('clinical_measurements','clinical','clinical.measurement_created','Medida clínica registrada',false,to_jsonb(t),true) FROM clinical_measurements t;
SELECT project_system_history('treatment_closures','clinical','clinical.closure_created','Encerramento clínico registrado',false,to_jsonb(t),true) FROM treatment_closures t;
SELECT project_system_history('receivable_renegotiations','finance','finance.renegotiated','Recebíveis renegociados',false,to_jsonb(t),true) FROM receivable_renegotiations t;
SELECT project_system_history('commission_rules','finance','commission.rule_created','Regra de comissão criada',false,to_jsonb(t),true) FROM commission_rules t;
SELECT project_system_history('commission_entries','finance','commission.created','Comissão gerada',false,to_jsonb(t),true) FROM commission_entries t;
SELECT project_system_history('recurring_payables','finance','recurring_payable.created','Conta recorrente criada',false,to_jsonb(t),true) FROM recurring_payables t;
SELECT project_system_history('document_templates','contracts','contract.template_created','Modelo de contrato criado',false,to_jsonb(t),true) FROM document_templates t;
SELECT project_system_history('issued_documents','contracts','contract.created','Contrato registrado',false,to_jsonb(t),true) FROM issued_documents t;
SELECT project_system_history('holidays','settings','holiday.created','Feriado cadastrado',false,to_jsonb(t),true) FROM holidays t;

ALTER TABLE audit_events ADD COLUMN search_document tsvector GENERATED ALWAYS AS (
  to_tsvector('portuguese'::regconfig,action || ' ' || description || ' ' ||
    CASE WHEN module='clinical' THEN '' ELSE metadata::text END)
) STORED;
CREATE INDEX audit_events_search_idx ON audit_events USING gin (search_document);
CREATE INDEX audit_events_module_page_idx ON audit_events (clinic_id,module,created_at DESC,id DESC);
CREATE INDEX audit_events_action_page_idx ON audit_events (clinic_id,action,created_at DESC,id DESC);
CREATE INDEX audit_events_actor_page_idx ON audit_events (clinic_id,actor_user_id,created_at DESC,id DESC);

-- Capture future row changes atomically, including background jobs. Record names
-- of changed fields, never old/new clinical contents or credential values.
CREATE FUNCTION append_system_row_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb;
  previous_data jsonb;
  field_names jsonb;
  changed_action text;
  activity_label text;
BEGIN
  IF TG_TABLE_NAME='clinical_attachments' THEN
    IF TG_OP='DELETE' THEN
      row_data := jsonb_build_object('id',OLD.id,'clinic_id',OLD.clinic_id,'created_at',OLD.created_at);
    ELSE
      row_data := jsonb_build_object('id',NEW.id,'clinic_id',NEW.clinic_id,'created_at',NEW.created_at);
    END IF;
  ELSE
    row_data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  END IF;
  IF TG_OP='INSERT' THEN
    PERFORM project_system_history(TG_TABLE_NAME,TG_ARGV[0],TG_ARGV[1],TG_ARGV[2],false,row_data || jsonb_build_object('created_at',now()),false);
    RETURN NEW;
  END IF;
  previous_data := to_jsonb(OLD);
  IF TG_OP='UPDATE' AND previous_data=row_data THEN RETURN NEW; END IF;
  SELECT COALESCE(jsonb_agg(key ORDER BY key),'[]'::jsonb) INTO field_names
    FROM jsonb_object_keys(previous_data || row_data) key
    WHERE (previous_data->key) IS DISTINCT FROM (row_data->key)
      AND key NOT IN ('password_hash','updated_at');
  IF TG_OP='UPDATE' AND field_names='[]'::jsonb THEN RETURN NEW; END IF;
  changed_action := TG_TABLE_NAME || CASE WHEN TG_OP='DELETE' THEN '.deleted' ELSE '.updated' END;
  activity_label := CASE WHEN TG_OP='DELETE' THEN 'Registro excluído: ' ELSE 'Registro atualizado: ' END || TG_ARGV[3];
  INSERT INTO audit_events (clinic_id,action,entity_type,entity_id,module,description,metadata)
  VALUES ((row_data->>'clinic_id')::uuid,changed_action,TG_TABLE_NAME,(row_data->>'id')::uuid,TG_ARGV[0],activity_label,
    jsonb_build_object('sourceTable',TG_TABLE_NAME,'sourceId',row_data->>'id','changedFields',field_names,'actorUnavailable',true));
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER patients_row_history AFTER INSERT OR UPDATE OR DELETE ON patients FOR EACH ROW EXECUTE FUNCTION append_system_row_change('patients','patient.created','Cliente cadastrado','Cliente');
CREATE TRIGGER appointments_row_history AFTER INSERT OR UPDATE OR DELETE ON appointments FOR EACH ROW EXECUTE FUNCTION append_system_row_change('agenda','appointment.created','Atendimento agendado','Atendimento');
CREATE TRIGGER patient_plans_row_history AFTER INSERT OR UPDATE OR DELETE ON patient_plans FOR EACH ROW EXECUTE FUNCTION append_system_row_change('plans','plan.created','Plano contratado','Plano');
CREATE TRIGGER leads_row_history AFTER INSERT OR UPDATE OR DELETE ON leads FOR EACH ROW EXECUTE FUNCTION append_system_row_change('crm','lead.created','Lead cadastrado','Lead');
CREATE TRIGGER lead_tasks_row_history AFTER INSERT OR UPDATE OR DELETE ON lead_tasks FOR EACH ROW EXECUTE FUNCTION append_system_row_change('crm','lead.task_created','Tarefa de lead criada','Tarefa');
CREATE TRIGGER products_row_history AFTER INSERT OR UPDATE OR DELETE ON products FOR EACH ROW EXECUTE FUNCTION append_system_row_change('patients','product.created','Produto cadastrado','Produto');
CREATE TRIGGER patient_tabs_row_history AFTER INSERT OR UPDATE OR DELETE ON patient_tabs FOR EACH ROW EXECUTE FUNCTION append_system_row_change('patients','tab.created','Comanda aberta','Comanda');
CREATE TRIGGER group_classes_row_history AFTER INSERT OR UPDATE OR DELETE ON group_classes FOR EACH ROW EXECUTE FUNCTION append_system_row_change('groups','group.created','Turma criada','Turma');
CREATE TRIGGER group_enrollments_row_history AFTER INSERT OR UPDATE OR DELETE ON group_enrollments FOR EACH ROW EXECUTE FUNCTION append_system_row_change('groups','group.enrolled','Cliente matriculado em turma','Matrícula');
CREATE TRIGGER group_sessions_row_history AFTER INSERT OR UPDATE OR DELETE ON group_sessions FOR EACH ROW EXECUTE FUNCTION append_system_row_change('groups','group.session_created','Aula de turma criada','Aula');
CREATE TRIGGER schedule_blocks_row_history AFTER INSERT OR UPDATE OR DELETE ON schedule_blocks FOR EACH ROW EXECUTE FUNCTION append_system_row_change('agenda','schedule.block_created','Bloqueio de agenda criado','Bloqueio de agenda');
CREATE TRIGGER professionals_row_history AFTER INSERT OR UPDATE OR DELETE ON professionals FOR EACH ROW EXECUTE FUNCTION append_system_row_change('agenda','professional.created','Profissional cadastrado','Profissional');
CREATE TRIGGER rooms_row_history AFTER INSERT OR UPDATE OR DELETE ON rooms FOR EACH ROW EXECUTE FUNCTION append_system_row_change('agenda','room.created','Sala cadastrada','Sala');
CREATE TRIGGER services_row_history AFTER INSERT OR UPDATE OR DELETE ON services FOR EACH ROW EXECUTE FUNCTION append_system_row_change('agenda','service.created','Serviço cadastrado','Serviço');
CREATE TRIGGER clinical_records_row_history AFTER INSERT OR UPDATE OR DELETE ON clinical_records FOR EACH ROW EXECUTE FUNCTION append_system_row_change('clinical','clinical.record_created','Prontuário criado','Prontuário');
CREATE TRIGGER clinical_attachments_row_history AFTER INSERT OR UPDATE OR DELETE ON clinical_attachments FOR EACH ROW EXECUTE FUNCTION append_system_row_change('clinical','clinical.attachment_created','Anexo clínico registrado','Anexo clínico');
CREATE TRIGGER clinical_addenda_row_history AFTER INSERT OR UPDATE OR DELETE ON clinical_addenda FOR EACH ROW EXECUTE FUNCTION append_system_row_change('clinical','clinical.addendum_created','Adendo clínico registrado','Adendo clínico');
CREATE TRIGGER assessment_templates_row_history AFTER INSERT OR UPDATE OR DELETE ON assessment_templates FOR EACH ROW EXECUTE FUNCTION append_system_row_change('clinical','clinical.template_created','Modelo de avaliação criado','Modelo de avaliação');
CREATE TRIGGER clinical_assessments_row_history AFTER INSERT OR UPDATE OR DELETE ON clinical_assessments FOR EACH ROW EXECUTE FUNCTION append_system_row_change('clinical','clinical.assessment_created','Avaliação clínica registrada','Avaliação clínica');
CREATE TRIGGER therapeutic_goals_row_history AFTER INSERT OR UPDATE OR DELETE ON therapeutic_goals FOR EACH ROW EXECUTE FUNCTION append_system_row_change('clinical','clinical.goal_created','Objetivo terapêutico criado','Objetivo terapêutico');
CREATE TRIGGER clinical_measurements_row_history AFTER INSERT OR UPDATE OR DELETE ON clinical_measurements FOR EACH ROW EXECUTE FUNCTION append_system_row_change('clinical','clinical.measurement_created','Medida clínica registrada','Medida clínica');
CREATE TRIGGER treatment_closures_row_history AFTER INSERT OR UPDATE OR DELETE ON treatment_closures FOR EACH ROW EXECUTE FUNCTION append_system_row_change('clinical','clinical.closure_created','Encerramento clínico registrado','Encerramento clínico');
CREATE TRIGGER receivable_renegotiations_row_history AFTER INSERT OR UPDATE OR DELETE ON receivable_renegotiations FOR EACH ROW EXECUTE FUNCTION append_system_row_change('finance','finance.renegotiated','Recebíveis renegociados','Renegociação');
CREATE TRIGGER commission_rules_row_history AFTER INSERT OR UPDATE OR DELETE ON commission_rules FOR EACH ROW EXECUTE FUNCTION append_system_row_change('finance','commission.rule_created','Regra de comissão criada','Regra de comissão');
CREATE TRIGGER commission_entries_row_history AFTER INSERT OR UPDATE OR DELETE ON commission_entries FOR EACH ROW EXECUTE FUNCTION append_system_row_change('finance','commission.created','Comissão gerada','Comissão');
CREATE TRIGGER recurring_payables_row_history AFTER INSERT OR UPDATE OR DELETE ON recurring_payables FOR EACH ROW EXECUTE FUNCTION append_system_row_change('finance','recurring_payable.created','Conta recorrente criada','Conta recorrente');
CREATE TRIGGER document_templates_row_history AFTER INSERT OR UPDATE OR DELETE ON document_templates FOR EACH ROW EXECUTE FUNCTION append_system_row_change('contracts','contract.template_created','Modelo de contrato criado','Modelo de contrato');
CREATE TRIGGER issued_documents_row_history AFTER INSERT OR UPDATE OR DELETE ON issued_documents FOR EACH ROW EXECUTE FUNCTION append_system_row_change('contracts','contract.created','Contrato registrado','Contrato');
CREATE TRIGGER holidays_row_history AFTER INSERT OR UPDATE OR DELETE ON holidays FOR EACH ROW EXECUTE FUNCTION append_system_row_change('settings','holiday.created','Feriado cadastrado','Feriado');
SELECT project_system_history('group_attendance','groups','group.attendance','Presença em turma registrada',false,to_jsonb(t),true) FROM group_attendance t;
CREATE TRIGGER group_attendance_row_history AFTER INSERT OR UPDATE OR DELETE ON group_attendance FOR EACH ROW EXECUTE FUNCTION append_system_row_change('groups','group.attendance','Presença em turma registrada','Presença em turma');
SELECT project_system_history('replacement_credits','groups','group.replacement_created','Crédito de reposição criado',false,to_jsonb(t),true) FROM replacement_credits t;
CREATE TRIGGER replacement_credits_row_history AFTER INSERT OR UPDATE OR DELETE ON replacement_credits FOR EACH ROW EXECUTE FUNCTION append_system_row_change('groups','group.replacement_created','Crédito de reposição criado','Crédito de reposição');
SELECT project_system_history('financial_categories','finance','finance.category_created','Categoria financeira criada',false,to_jsonb(t),true) FROM financial_categories t;
CREATE TRIGGER financial_categories_row_history AFTER INSERT OR UPDATE OR DELETE ON financial_categories FOR EACH ROW EXECUTE FUNCTION append_system_row_change('finance','finance.category_created','Categoria financeira criada','Categoria financeira');
SELECT project_system_history('cost_centers','finance','finance.cost_center_created','Centro de custo criado',false,to_jsonb(t),true) FROM cost_centers t;
CREATE TRIGGER cost_centers_row_history AFTER INSERT OR UPDATE OR DELETE ON cost_centers FOR EACH ROW EXECUTE FUNCTION append_system_row_change('finance','finance.cost_center_created','Centro de custo criado','Centro de custo');
SELECT project_system_history('communication_preferences','communications','communication.preference_created','Preferência de comunicação registrada',false,to_jsonb(t),true) FROM communication_preferences t;
CREATE TRIGGER communication_preferences_row_history AFTER INSERT OR UPDATE OR DELETE ON communication_preferences FOR EACH ROW EXECUTE FUNCTION append_system_row_change('communications','communication.preference_created','Preferência de comunicação registrada','Preferência de comunicação');
