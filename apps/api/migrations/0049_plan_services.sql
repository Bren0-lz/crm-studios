CREATE UNIQUE INDEX services_clinic_id_key ON services(clinic_id, id);
CREATE UNIQUE INDEX patient_plans_clinic_id_key ON patient_plans(clinic_id, id);
-- The legacy quantity now holds the sum of all service quantities.
ALTER TABLE plan_templates DROP CONSTRAINT plan_templates_total_sessions_check;
ALTER TABLE plan_templates ADD CONSTRAINT plan_templates_total_sessions_check CHECK (total_sessions > 0);

CREATE TABLE plan_template_services (
  clinic_id uuid NOT NULL,
  template_id uuid NOT NULL,
  service_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  total_sessions integer NOT NULL CHECK (total_sessions BETWEEN 1 AND 1000),
  total_value_in_cents integer NOT NULL CHECK (total_value_in_cents >= 0),
  PRIMARY KEY (clinic_id, template_id, service_id),
  UNIQUE (template_id, position),
  FOREIGN KEY (clinic_id, template_id) REFERENCES plan_templates(clinic_id, id) ON DELETE CASCADE,
  FOREIGN KEY (clinic_id, service_id) REFERENCES services(clinic_id, id)
);

CREATE TABLE patient_plan_services (
  clinic_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  service_id uuid NOT NULL,
  service_name text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  total_sessions integer NOT NULL CHECK (total_sessions > 0),
  remaining_sessions integer NOT NULL CHECK (remaining_sessions >= 0),
  total_value_in_cents integer NOT NULL CHECK (total_value_in_cents >= 0),
  PRIMARY KEY (clinic_id, plan_id, service_id),
  UNIQUE (plan_id, position),
  FOREIGN KEY (clinic_id, plan_id) REFERENCES patient_plans(clinic_id, id) ON DELETE CASCADE,
  FOREIGN KEY (clinic_id, service_id) REFERENCES services(clinic_id, id)
);

INSERT INTO plan_template_services
SELECT pt.clinic_id, pt.id, pt.service_id, 0, pt.total_sessions, pt.total_value_in_cents
FROM plan_templates pt JOIN services s ON s.id=pt.service_id AND s.clinic_id=pt.clinic_id
WHERE pt.total_sessions IS NOT NULL;

UPDATE plan_templates pt SET active=false
WHERE NOT EXISTS (SELECT 1 FROM plan_template_services x WHERE x.template_id=pt.id);

INSERT INTO patient_plan_services
SELECT pp.clinic_id, pp.id, pp.service_id, s.name, 0, pp.total_sessions, pp.remaining_sessions, pp.total_value_in_cents
FROM patient_plans pp JOIN services s ON s.id=pp.service_id AND s.clinic_id=pp.clinic_id;

ALTER TABLE session_movements ADD COLUMN service_id uuid;
UPDATE session_movements sm SET service_id=pp.service_id FROM patient_plans pp WHERE pp.id=sm.plan_id;
ALTER TABLE session_movements ADD CONSTRAINT session_movements_plan_service_fk
  FOREIGN KEY (clinic_id, plan_id, service_id) REFERENCES patient_plan_services(clinic_id, plan_id, service_id);
-- Nullable only for compatibility with older binaries during deployment. New
-- code always records the service and maintains parent aggregate columns.
