-- Esquema completo do CRM para MySQL 8.0+ / MariaDB 10.6+ (Hostinger).
-- Consolida as 107 migrações do PostgreSQL anteriores à troca de banco.
--
-- Diferenças em relação ao Postgres:
-- - sem gatilhos, funções ou procedures (a hospedagem compartilhada pode não permitir):
--   filial padrão, conflitos de agenda e histórico automático ficam na aplicação;
-- - UUID em VARCHAR(36) ASCII; datas e horas em DATETIME(6) sempre em UTC;
-- - arrays viram JSON; índices únicos parciais viram colunas geradas;
-- - dia/mês padrão dos lançamentos financeiros usam o fuso fixo da clínica (UTC-03:00).

CREATE TABLE `agenda_notes` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `description` LONGTEXT NOT NULL,
  `starts_at` DATETIME(6) NOT NULL,
  `ends_at` DATETIME(6) NOT NULL,
  `background_color` LONGTEXT NOT NULL,
  `series_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `author_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY agenda_notes_range_idx (`clinic_id`, `branch_id`, `starts_at`),
  KEY agenda_notes_series_idx (`clinic_id`, `series_id`, `starts_at`),
  CONSTRAINT agenda_notes_background_color_check CHECK ((background_color IN ('#64748b', '#276749', '#0d9488', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#facc15'))),
  CONSTRAINT agenda_notes_check CHECK ((ends_at > starts_at)),
  CONSTRAINT agenda_notes_description_check CHECK (((CHAR_LENGTH(TRIM(description)) >= 1) AND (CHAR_LENGTH(TRIM(description)) <= 300)))
);

CREATE TABLE `appointment_reschedules` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `previous_starts_at` DATETIME(6) NOT NULL,
  `previous_ends_at` DATETIME(6) NOT NULL,
  `previous_professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `previous_room_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `starts_at` DATETIME(6) NOT NULL,
  `ends_at` DATETIME(6) NOT NULL,
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `room_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY appointment_reschedules_history_idx (`clinic_id`, `appointment_id`, `created_at`),
  CONSTRAINT appointment_reschedules_check CHECK ((previous_ends_at > previous_starts_at)),
  CONSTRAINT appointment_reschedules_check1 CHECK ((ends_at > starts_at))
);

CREATE TABLE `appointments` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `room_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `starts_at` DATETIME(6) NOT NULL,
  `ends_at` DATETIME(6) NOT NULL,
  `status` ENUM('scheduled','confirmed','completed','no_show','excused_absence','professional_absence','cancelled') NOT NULL DEFAULT 'scheduled',
  `notes` LONGTEXT,
  `legacy_id` LONGTEXT,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `series_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `visit_type` LONGTEXT NOT NULL DEFAULT ('regular'),
  `lead_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `absence_reason` LONGTEXT,
  `predecessor_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `auto_completed_at` DATETIME(6),
  `active_predecessor_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin AS (IF(status <> 'cancelled', predecessor_id, NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY appointments_clinic_identity (clinic_id, id),
  UNIQUE KEY appointments_active_successor_idx (`clinic_id`, `active_predecessor_id`),
  KEY appointments_branch_idx (`clinic_id`, `branch_id`),
  KEY appointments_clinic_period_idx (`clinic_id`, `starts_at`, `ends_at`),
  KEY appointments_lead_idx (`clinic_id`, `lead_id`),
  KEY appointments_open_ends_at_idx (`clinic_id`, `ends_at`),
  KEY appointments_professional_period_idx (`professional_id`, `starts_at`, `ends_at`),
  KEY appointments_room_period_idx (`room_id`, `starts_at`, `ends_at`),
  CONSTRAINT appointments_check CHECK ((ends_at > starts_at)),
  CONSTRAINT appointments_patient_or_lead_check CHECK (((patient_id IS NULL) <> (lead_id IS NULL))),
  CONSTRAINT appointments_visit_type_check CHECK ((visit_type IN ('regular', 'trial', 'evaluation')))
);

CREATE TABLE `assessment_templates` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `specialty` LONGTEXT NOT NULL,
  `fields` JSON NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `status` LONGTEXT NOT NULL DEFAULT ('published'),
  `family_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  PRIMARY KEY (id),
  UNIQUE KEY assessment_templates_clinic_id_name_version_key (clinic_id, name, version),
  KEY assessment_templates_family_idx (`clinic_id`, `family_id`, `version`),
  CONSTRAINT assessment_templates_status_check CHECK ((status IN ('draft', 'published'))),
  CONSTRAINT assessment_templates_version_check CHECK ((version > 0))
);

CREATE TABLE `audit_events` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `action` VARCHAR(191) NOT NULL,
  `entity_type` VARCHAR(191) NOT NULL,
  `entity_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `metadata` JSON NOT NULL DEFAULT ('{}'),
  `ip_address` VARCHAR(45),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `module` VARCHAR(191) NOT NULL DEFAULT 'settings',
  `description` LONGTEXT NOT NULL DEFAULT ('Alteração registrada'),
  `source_table` VARCHAR(191),
  `source_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  PRIMARY KEY (id),
  KEY audit_events_action_page_idx (`clinic_id`, `action`, `created_at`, `id`),
  KEY audit_events_actor_idx (`clinic_id`, `actor_user_id`, `created_at`),
  KEY audit_events_actor_page_idx (`clinic_id`, `actor_user_id`, `created_at`, `id`),
  KEY audit_events_entity_idx (`clinic_id`, `entity_type`, `entity_id`, `created_at`),
  KEY audit_events_history_idx (`clinic_id`, `created_at`, `id`),
  KEY audit_events_module_page_idx (`clinic_id`, `module`, `created_at`, `id`),
  UNIQUE KEY audit_events_source_idx (`clinic_id`, `source_table`, `source_id`)
);

CREATE TABLE `branches` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `postal_code` LONGTEXT,
  `street` LONGTEXT,
  `number` LONGTEXT,
  `complement` LONGTEXT,
  `neighborhood` LONGTEXT,
  `city` LONGTEXT,
  `state` CHAR(2),
  `reference` LONGTEXT,
  `phones` JSON NOT NULL DEFAULT ('[]'),
  `default_key` TINYINT(1) AS (IF(is_default, 1, NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY branches_clinic_id_id_key (clinic_id, id),
  UNIQUE KEY branches_default_idx (`clinic_id`, `default_key`),
  UNIQUE KEY branches_name_idx (`clinic_id`, `name`),
  CONSTRAINT branches_check CHECK (((NOT is_default) OR active)),
  CONSTRAINT branches_name_check CHECK ((CHAR_LENGTH(TRIM(name)) >= 2)),
  CONSTRAINT branches_phones_check CHECK ((JSON_TYPE(phones) = 'ARRAY')),
  CONSTRAINT branches_postal_code_check CHECK ((postal_code REGEXP '^[0-9]{5}-[0-9]{3}$'))
);

CREATE TABLE `clinic_catalogs` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `name` LONGTEXT NOT NULL,
  `name_key` VARCHAR(191) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `parent_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY clinic_catalogs_clinic_id_kind_name_key_key (clinic_id, kind, name_key),
  CONSTRAINT clinic_catalogs_kind_check CHECK ((kind IN ('interest', 'level', 'product_category', 'product_brand', 'muscle_group', 'lead_source', 'lead_channel', 'lead_lost_reason')))
);

CREATE TABLE `clinic_sequences` (
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `last_value` INT NOT NULL,
  PRIMARY KEY (clinic_id, name),
  CONSTRAINT clinic_sequences_last_value_check CHECK ((last_value >= 0)),
  CONSTRAINT clinic_sequences_name_check CHECK ((name IN ('patient_record', 'receipt')))
);

CREATE TABLE `clinical_access_events` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `action` LONGTEXT NOT NULL,
  `entity_type` LONGTEXT NOT NULL,
  `entity_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY clinical_access_events_patient_idx (`clinic_id`, `patient_id`, `created_at`),
  CONSTRAINT clinical_access_events_action_check CHECK ((action IN ('read', 'export', 'upload', 'download', 'addendum'))),
  CONSTRAINT clinical_access_events_entity_type_check CHECK ((entity_type IN ('workspace', 'attachment', 'clinical_record')))
);

CREATE TABLE `clinical_addenda` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clinical_record_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `author_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `content` LONGTEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY clinical_addenda_patient_idx (`clinic_id`, `patient_id`, `created_at`)
);

CREATE TABLE `clinical_alerts` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `author_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `severity` LONGTEXT NOT NULL,
  `text` LONGTEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `archived_at` DATETIME(6),
  PRIMARY KEY (id),
  KEY clinical_alerts_patient_idx (`clinic_id`, `patient_id`),
  CONSTRAINT clinical_alerts_severity_check CHECK ((severity IN ('info', 'warning', 'critical'))),
  CONSTRAINT clinical_alerts_text_check CHECK (((CHAR_LENGTH(text) >= 3) AND (CHAR_LENGTH(text) <= 280)))
);

CREATE TABLE `clinical_assessments` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `template_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `author_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `values` JSON NOT NULL,
  `notes` LONGTEXT,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY clinical_assessments_patient_idx (`clinic_id`, `patient_id`, `created_at`)
);

CREATE TABLE `clinical_attachments` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `author_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `file_name` LONGTEXT NOT NULL,
  `mime_type` LONGTEXT NOT NULL,
  `size_in_bytes` INT NOT NULL,
  `content` LONGBLOB NOT NULL,
  `sha256` LONGTEXT NOT NULL,
  `notes` LONGTEXT,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `duration_in_seconds` INT,
  PRIMARY KEY (id),
  KEY clinical_attachments_patient_idx (`clinic_id`, `patient_id`, `created_at`),
  CONSTRAINT clinical_attachments_duration_check CHECK (((mime_type NOT LIKE 'audio/%') OR ((duration_in_seconds IS NOT NULL) AND ((duration_in_seconds >= 1) AND (duration_in_seconds <= 900))))),
  CONSTRAINT clinical_attachments_mime_type_check CHECK ((mime_type IN ('application/pdf', 'image/png', 'image/jpeg', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'audio/webm', 'audio/ogg', 'audio/mp4'))),
  CONSTRAINT clinical_attachments_sha256_check CHECK ((CHAR_LENGTH(sha256) = 64)),
  CONSTRAINT clinical_attachments_size_in_bytes_check CHECK (((size_in_bytes > 0) AND (size_in_bytes <= CASE WHEN (mime_type LIKE 'audio/%') THEN 16777216 ELSE 5242880 END)))
);

CREATE TABLE `clinical_measurements` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `goal_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `author_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `value` DECIMAL(18,6) NOT NULL,
  `unit` LONGTEXT NOT NULL,
  `measured_at` DATETIME(6) NOT NULL,
  `notes` LONGTEXT,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY clinical_measurements_patient_idx (`clinic_id`, `patient_id`, `measured_at`)
);

CREATE TABLE `clinical_record_revisions` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clinical_record_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `author_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `version` INT NOT NULL,
  `snapshot` JSON NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY clinical_record_revisions_clinical_record_id_version_key (clinical_record_id, version),
  KEY clinical_record_revisions_record_idx (`clinic_id`, `clinical_record_id`, `version`)
);

CREATE TABLE `clinical_records` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `author_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status` ENUM('draft','finalized') NOT NULL DEFAULT 'draft',
  `subjective` LONGTEXT NOT NULL DEFAULT (''),
  `objective` LONGTEXT NOT NULL DEFAULT (''),
  `assessment` LONGTEXT NOT NULL DEFAULT (''),
  `plan` LONGTEXT NOT NULL DEFAULT (''),
  `pain_scale` SMALLINT,
  `version` INT NOT NULL DEFAULT 1,
  `finalized_at` DATETIME(6),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY clinical_records_clinic_id_appointment_id_key (clinic_id, appointment_id),
  KEY clinical_records_patient_idx (`clinic_id`, `patient_id`, `appointment_id`),
  CONSTRAINT clinical_records_pain_scale_check CHECK (((pain_scale >= 0) AND (pain_scale <= 10))),
  CONSTRAINT clinical_records_version_check CHECK ((version > 0))
);

CREATE TABLE `clinical_resources` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `name` LONGTEXT NOT NULL,
  `status` LONGTEXT NOT NULL,
  `family_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `data` JSON NOT NULL,
  `history` JSON NOT NULL DEFAULT ('[]'),
  `template_snapshot` JSON,
  `author_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `origin_starts_at` DATETIME(6),
  PRIMARY KEY (id),
  KEY clinical_resources_patient_idx (`clinic_id`, `patient_id`, `kind`),
  CONSTRAINT clinical_resources_kind_check CHECK ((kind IN ('equipment', 'exercise', 'evolution_template', 'evolution', 'training', 'training_execution', 'clinical_document'))),
  CONSTRAINT clinical_resources_status_check CHECK ((status IN ('draft', 'published', 'finalized', 'active', 'inactive')))
);

CREATE TABLE `clinics` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `name` LONGTEXT NOT NULL,
  `legal_name` LONGTEXT,
  `tax_id` LONGTEXT,
  `timezone` LONGTEXT NOT NULL DEFAULT ('America/Sao_Paulo'),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `phone` LONGTEXT,
  `email` LONGTEXT,
  `address` LONGTEXT,
  `logo_data_url` LONGTEXT,
  `pix_key` LONGTEXT,
  `pix_message_template` LONGTEXT,
  `auto_finalization_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `auto_finalization_delay_minutes` INT NOT NULL DEFAULT 60,
  `auto_finalization_updated_at` DATETIME(6),
  PRIMARY KEY (id),
  CONSTRAINT clinics_auto_finalization_delay_minutes_check CHECK (((auto_finalization_delay_minutes >= 0) AND (auto_finalization_delay_minutes <= 10080)))
);

CREATE TABLE `commission_account_payments` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `commission_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `professional_name` LONGTEXT NOT NULL,
  `amount_in_cents` INT NOT NULL,
  `original_included` TINYINT(1) NOT NULL,
  `adjustment_ids` JSON NOT NULL,
  `actor_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `occurred_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `reversed_at` DATETIME(6),
  PRIMARY KEY (id),
  UNIQUE KEY commission_account_payments_clinic_identity (clinic_id, id)
);

CREATE TABLE `commission_adjustments` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `commission_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `reconciliation_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `professional_name` LONGTEXT NOT NULL,
  `competence` CHAR(7) NOT NULL,
  `amount_in_cents` INT NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `actor_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status` LONGTEXT NOT NULL DEFAULT ('open'),
  `paid_at` DATETIME(6),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY commission_adjustments_root_idx (`clinic_id`, `commission_id`),
  CONSTRAINT commission_adjustments_amount_in_cents_check CHECK ((amount_in_cents <> 0)),
  CONSTRAINT commission_adjustments_status_check CHECK ((status IN ('open', 'paid')))
);

CREATE TABLE `commission_entries` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `rule_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `competence` CHAR(7) NOT NULL,
  `base_amount_in_cents` INT NOT NULL,
  `percentage` DECIMAL(5,2) NOT NULL,
  `amount_in_cents` INT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `paid_at` DATETIME(6),
  `paid_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `group_attendance_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `rule_snapshot` JSON,
  PRIMARY KEY (id),
  UNIQUE KEY commission_entries_clinic_id_appointment_id_key (clinic_id, appointment_id),
  UNIQUE KEY commission_entries_clinic_identity (clinic_id, id),
  UNIQUE KEY commission_entries_attendance_idx (`clinic_id`, `group_attendance_id`),
  KEY commission_entries_competence_idx (`clinic_id`, `competence`, `status`),
  CONSTRAINT commission_entries_amount_in_cents_check CHECK ((amount_in_cents >= 0)),
  CONSTRAINT commission_entries_base_amount_in_cents_check CHECK ((base_amount_in_cents >= 0)),
  CONSTRAINT commission_entries_status_check CHECK ((status IN ('open', 'paid'))),
  CONSTRAINT commission_entry_source CHECK (((appointment_id IS NULL) <> (group_attendance_id IS NULL)))
);

CREATE TABLE `commission_payment_events` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `commission_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `kind` LONGTEXT NOT NULL,
  `amount_in_cents` INT NOT NULL,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `occurred_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `professional_name` LONGTEXT,
  `account_payment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  PRIMARY KEY (id),
  KEY commission_payment_events_scope_idx (`clinic_id`, `commission_id`, `occurred_at`),
  CONSTRAINT commission_payment_events_check CHECK (((account_payment_id IS NOT NULL) OR ((kind = 'payment') AND (amount_in_cents >= 0)) OR ((kind = 'reversal') AND (amount_in_cents <= 0)))),
  CONSTRAINT commission_payment_events_kind_check CHECK ((kind IN ('payment', 'reversal')))
);

CREATE TABLE `commission_reconciliations` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `commission_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `idempotency_key` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `expected_digest` CHAR(64) NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `expected` JSON,
  `actor_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actor_name` LONGTEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY commission_reconciliations_clinic_id_id_key (clinic_id, id),
  UNIQUE KEY commission_reconciliations_clinic_id_idempotency_key_key (clinic_id, idempotency_key),
  CONSTRAINT commission_reconciliations_reason_check CHECK (((CHAR_LENGTH(reason) >= 5) AND (CHAR_LENGTH(reason) <= 1000)))
);

CREATE TABLE `commission_rules` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `percentage` DECIMAL(5,2) NOT NULL,
  `effective_from` DATE NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `kind` LONGTEXT NOT NULL DEFAULT ('percentage'),
  `fixed_amount_in_cents` INT,
  `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `effective_until` DATE,
  `service_scope_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin AS (COALESCE(service_id, '00000000-0000-0000-0000-000000000000')) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY commission_rules_professional_scope_idx (`clinic_id`, `professional_id`, `effective_from`, `service_scope_id`),
  UNIQUE KEY commission_rules_user_scope_idx (`clinic_id`, `user_id`, `effective_from`, `service_scope_id`),
  CONSTRAINT commission_rule_fixed CHECK (((kind <> 'fixed') OR (fixed_amount_in_cents IS NOT NULL))),
  CONSTRAINT commission_rule_period CHECK (((effective_until IS NULL) OR (effective_until >= effective_from))),
  CONSTRAINT commission_rules_fixed_amount_in_cents_check CHECK ((fixed_amount_in_cents >= 0)),
  CONSTRAINT commission_rules_kind_check CHECK ((kind IN ('percentage', 'fixed'))),
  CONSTRAINT commission_rules_owner_check CHECK (((professional_id IS NULL) <> (user_id IS NULL))),
  CONSTRAINT commission_rules_percentage_check CHECK (((percentage >= (0)) AND (percentage <= (100))))
);

CREATE TABLE `communication_preferences` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `channel` VARCHAR(191) NOT NULL,
  `allowed` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY communication_preferences_clinic_id_patient_id_channel_key (clinic_id, patient_id, channel),
  CONSTRAINT communication_preferences_channel_check CHECK ((channel IN ('whatsapp', 'email')))
);

CREATE TABLE `contact_activities` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `reason` VARCHAR(191) NOT NULL,
  `reference_key` VARCHAR(191) NOT NULL,
  `outcome` LONGTEXT NOT NULL,
  `notes` LONGTEXT,
  `snooze_until` DATE,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY contact_activities_reference_idx (`clinic_id`, `patient_id`, `reason`, `reference_key`, `created_at`),
  CONSTRAINT contact_activities_check CHECK (((outcome <> 'snoozed') OR (snooze_until IS NOT NULL))),
  CONSTRAINT contact_activities_outcome_check CHECK ((outcome IN ('contacted', 'no_answer', 'scheduled', 'not_interested', 'snoozed', 'dismissed'))),
  CONSTRAINT contact_activities_reason_check CHECK ((reason IN ('birthday', 'single_no_return', 'plan_expiring', 'low_balance', 'expired_with_balance', 'treatment_paused', 'repeated_no_show', 'former_client', 'overdue_payment', 'nps_detractor')))
);

CREATE TABLE `cost_centers` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY cost_centers_clinic_id_name_key (clinic_id, name)
);

CREATE TABLE `document_signature_links` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `document_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `token` VARCHAR(191) NOT NULL,
  `created_by` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `expires_at` DATETIME(6) NOT NULL,
  `view_count` INT NOT NULL DEFAULT 0,
  `first_viewed_at` DATETIME(6),
  `last_viewed_at` DATETIME(6),
  `views` JSON NOT NULL DEFAULT ('[]'),
  `signed_at` DATETIME(6),
  `signature` JSON,
  `signature_image` LONGTEXT,
  PRIMARY KEY (id),
  UNIQUE KEY document_signature_links_clinic_id_document_id_key (clinic_id, document_id),
  UNIQUE KEY document_signature_links_token_key (token),
  CONSTRAINT document_signature_links_check CHECK ((expires_at > created_at)),
  CONSTRAINT document_signature_links_check1 CHECK (((signed_at IS NULL) = (signature IS NULL))),
  CONSTRAINT document_signature_links_check2 CHECK (((signed_at IS NULL) = (signature_image IS NULL))),
  CONSTRAINT document_signature_links_token_check CHECK ((CHAR_LENGTH(token) >= 32)),
  CONSTRAINT document_signature_links_view_count_check CHECK ((view_count >= 0))
);

CREATE TABLE `document_templates` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `kind` LONGTEXT NOT NULL,
  `version` INT NOT NULL,
  `body` LONGTEXT NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `previous_version_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `content` JSON,
  `active_name` VARCHAR(191) AS (IF(active, name, NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY document_templates_clinic_id_name_version_key (clinic_id, name, version),
  UNIQUE KEY document_templates_one_active_idx (`clinic_id`, `active_name`),
  CONSTRAINT document_templates_body_check CHECK (((CHAR_LENGTH(body) >= 20) AND (CHAR_LENGTH(body) <= 20000))),
  CONSTRAINT document_templates_kind_check CHECK ((kind IN ('contract', 'attendance_declaration', 'consent', 'other'))),
  CONSTRAINT document_templates_version_check CHECK ((version > 0))
);

CREATE TABLE `external_operations` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `counterpart` VARCHAR(191) NOT NULL,
  `reference` VARCHAR(191) NOT NULL,
  `occurred_on` DATE NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `patient_name` LONGTEXT,
  `receivable_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `notes` LONGTEXT NOT NULL DEFAULT (''),
  `file_name` LONGTEXT NOT NULL,
  `mime_type` LONGTEXT NOT NULL,
  `size_in_bytes` INT NOT NULL,
  `sha256` LONGTEXT NOT NULL,
  `content` LONGBLOB NOT NULL,
  `author_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `author_name` LONGTEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (id),
  KEY external_operations_branch_idx (`clinic_id`, `branch_id`),
  KEY external_operations_patient_idx (`clinic_id`, `patient_id`, `occurred_on`),
  UNIQUE KEY external_operations_reference_idx (`clinic_id`, `kind`, `counterpart`, `reference`),
  CONSTRAINT external_operations_kind_check CHECK ((kind IN ('fiscal', 'partner'))),
  CONSTRAINT external_operations_mime_type_check CHECK ((mime_type IN ('application/pdf', 'image/png', 'image/jpeg'))),
  CONSTRAINT external_operations_size_in_bytes_check CHECK (((size_in_bytes >= 1) AND (size_in_bytes <= 5242880)))
);

CREATE TABLE `financial_categories` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `dre_group` LONGTEXT NOT NULL DEFAULT ('unclassified'),
  PRIMARY KEY (id),
  UNIQUE KEY financial_categories_clinic_id_name_kind_key (clinic_id, name, kind),
  CONSTRAINT financial_categories_dre_group_check CHECK ((dre_group IN ('unclassified', 'service_revenue', 'product_revenue', 'tax', 'service_cost', 'product_cost', 'variable_cost', 'fixed_expense', 'depreciation', 'financial_result'))),
  CONSTRAINT financial_categories_kind_check CHECK ((kind IN ('income', 'expense')))
);

CREATE TABLE `financial_date_corrections` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `receivable_event_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `payable_event_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `occurred_at` DATETIME(6) NOT NULL,
  `cash_available_at` DATETIME(6) NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `revision` BIGINT NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (id),
  UNIQUE KEY financial_date_corrections_revision_key (revision),
  KEY financial_date_corrections_payable_idx (`clinic_id`, `payable_event_id`, `created_at`),
  KEY financial_date_corrections_receivable_idx (`clinic_id`, `receivable_event_id`, `created_at`),
  CONSTRAINT financial_date_corrections_check CHECK (((receivable_event_id IS NULL) <> (payable_event_id IS NULL)))
);

CREATE TABLE `financial_events` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `receivable_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `kind` LONGTEXT NOT NULL,
  `amount_in_cents` INT NOT NULL,
  `metadata` JSON NOT NULL DEFAULT ('{}'),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `occurred_at` DATETIME(6),
  `cash_available_at` DATETIME(6),
  `discount_in_cents` INT NOT NULL DEFAULT 0,
  `interest_in_cents` INT NOT NULL DEFAULT 0,
  `balance_receivable_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  PRIMARY KEY (id),
  KEY financial_events_receivable_idx (`clinic_id`, `receivable_id`, `created_at`),
  CONSTRAINT financial_events_discount_in_cents_check CHECK ((discount_in_cents >= 0)),
  CONSTRAINT financial_events_interest_in_cents_check CHECK ((interest_in_cents >= 0)),
  CONSTRAINT financial_events_kind_check CHECK ((kind IN ('created', 'payment', 'payment_reversal', 'cancellation', 'adjustment')))
);

CREATE TABLE `group_attendance` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `session_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status` LONGTEXT NOT NULL,
  `notes` LONGTEXT,
  `recorded_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `recorded_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `accounting_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `outcome` LONGTEXT,
  `replacement_credit_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  PRIMARY KEY (id),
  UNIQUE KEY group_attendance_session_id_patient_id_key (session_id, patient_id),
  CONSTRAINT group_attendance_outcome_check CHECK ((outcome IN ('scheduled', 'present', 'absent', 'excused_absence', 'cancelled'))),
  CONSTRAINT group_attendance_status_check CHECK ((status IN ('present', 'absent', 'excused_absence', 'replacement')))
);

CREATE TABLE `group_classes` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `room_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `capacity` INT NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `weekly_slots` JSON NOT NULL DEFAULT ('[]'),
  `sequence` INT NOT NULL,
  `sessions_generated_until` DATETIME(6),
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY group_classes_service_sequence_key (clinic_id, service_id, sequence),
  KEY group_classes_branch_idx (`clinic_id`, `branch_id`),
  CONSTRAINT group_classes_capacity_check CHECK (((capacity >= 1) AND (capacity <= 100)))
);

CREATE TABLE `group_enrollments` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `group_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status` VARCHAR(191) NOT NULL,
  `queue_position` INT,
  `enrolled_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `ended_at` DATETIME(6),
  `current_patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin AS (IF(status IN ('active', 'waitlisted'), patient_id, NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY group_enrollment_current_idx (`group_id`, `current_patient_id`),
  KEY group_waitlist_idx (`clinic_id`, `group_id`, `status`, `queue_position`),
  CONSTRAINT group_enrollments_status_check CHECK ((status IN ('active', 'waitlisted', 'cancelled')))
);

CREATE TABLE `group_sessions` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `group_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `starts_at` DATETIME(6) NOT NULL,
  `ends_at` DATETIME(6) NOT NULL,
  `status` LONGTEXT NOT NULL DEFAULT ('scheduled'),
  `series_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  PRIMARY KEY (id),
  UNIQUE KEY group_sessions_group_id_starts_at_key (group_id, starts_at),
  KEY group_sessions_period_idx (`clinic_id`, `starts_at`, `ends_at`),
  CONSTRAINT group_sessions_check CHECK ((ends_at > starts_at)),
  CONSTRAINT group_sessions_status_check CHECK ((status IN ('scheduled', 'completed', 'cancelled')))
);

CREATE TABLE `holidays` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `date` DATE NOT NULL,
  `name` LONGTEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY holidays_clinic_id_date_key (clinic_id, date)
);

CREATE TABLE `issued_documents` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `template_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `plan_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `title` LONGTEXT NOT NULL,
  `template_name` LONGTEXT NOT NULL,
  `template_version` INT NOT NULL,
  `snapshot_body` LONGTEXT NOT NULL,
  `status` LONGTEXT NOT NULL DEFAULT ('draft'),
  `issued_at` DATETIME(6),
  `cancelled_at` DATETIME(6),
  `created_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `manual_signature` JSON,
  `manual_signature_content` LONGBLOB,
  `snapshot_content` JSON,
  `branding` JSON,
  PRIMARY KEY (id),
  KEY issued_documents_patient_idx (`clinic_id`, `patient_id`, `created_at`),
  CONSTRAINT issued_document_signature_content CHECK (((manual_signature IS NULL) = (manual_signature_content IS NULL))),
  CONSTRAINT issued_documents_status_check CHECK ((status IN ('draft', 'issued', 'cancelled')))
);

CREATE TABLE `lead_contacts` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `lead_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `channel` LONGTEXT NOT NULL,
  `direction` LONGTEXT NOT NULL,
  `notes` LONGTEXT NOT NULL,
  `occurred_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `contact_method` LONGTEXT,
  PRIMARY KEY (id),
  KEY lead_contacts_timeline_idx (`clinic_id`, `lead_id`, `occurred_at`),
  CONSTRAINT lead_contacts_channel_check CHECK ((channel IN ('phone', 'whatsapp', 'email', 'in_person', 'note'))),
  CONSTRAINT lead_contacts_direction_check CHECK ((direction IN ('inbound', 'outbound', 'internal')))
);

CREATE TABLE `lead_stage_history` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `lead_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `from_stage` LONGTEXT,
  `to_stage` LONGTEXT NOT NULL,
  `reason` LONGTEXT,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY lead_history_idx (`clinic_id`, `lead_id`, `created_at`)
);

CREATE TABLE `lead_stages` (
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `stage` VARCHAR(191) NOT NULL,
  `label` LONGTEXT NOT NULL,
  `position` INT NOT NULL,
  PRIMARY KEY (clinic_id, stage),
  UNIQUE KEY lead_stages_clinic_id_position_key (clinic_id, `position`),
  CONSTRAINT lead_stages_label_check CHECK (((CHAR_LENGTH(TRIM(label)) >= 1) AND (CHAR_LENGTH(TRIM(label)) <= 40))),
  CONSTRAINT lead_stages_position_check CHECK (("position" >= 0)),
  CONSTRAINT lead_stages_stage_check CHECK ((stage REGEXP '^[a-z][a-z0-9_]{0,39}$'))
);

CREATE TABLE `lead_tasks` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `lead_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` LONGTEXT NOT NULL,
  `notes` LONGTEXT,
  `due_at` DATETIME(6) NOT NULL,
  `assigned_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `completed_at` DATETIME(6),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY lead_tasks_due_idx (`clinic_id`, `status`, `due_at`),
  KEY lead_tasks_lead_idx (`clinic_id`, `lead_id`, `due_at`),
  CONSTRAINT lead_tasks_status_check CHECK ((status IN ('open', 'completed', 'cancelled')))
);

CREATE TABLE `leads` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `full_name` LONGTEXT NOT NULL,
  `phone` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191),
  `source` LONGTEXT NOT NULL,
  `interest` LONGTEXT NOT NULL,
  `notes` LONGTEXT,
  `stage` VARCHAR(191) NOT NULL DEFAULT 'new_contact',
  `lost_reason` LONGTEXT,
  `converted_patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `responsible_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `tags` JSON NOT NULL DEFAULT ('[]'),
  `profile` JSON NOT NULL DEFAULT ('{}'),
  `contact_method` LONGTEXT,
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (id),
  KEY leads_branch_idx (`clinic_id`, `branch_id`),
  KEY leads_contact_idx (`clinic_id`, `phone`, `email`),
  KEY leads_pipeline_idx (`clinic_id`, `stage`, `updated_at`),
  CONSTRAINT leads_lost_reason CHECK (((stage <> 'lost') OR (lost_reason IS NOT NULL))),
  CONSTRAINT leads_stage_key CHECK ((stage REGEXP '^[a-z][a-z0-9_]{0,39}$'))
);

CREATE TABLE `message_template_images` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `template_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `position` INT NOT NULL,
  `file_name` LONGTEXT NOT NULL,
  `mime_type` LONGTEXT NOT NULL,
  `size_bytes` INT NOT NULL,
  `data_url` LONGTEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `removed_at` DATETIME(6),
  PRIMARY KEY (id),
  KEY message_template_images_template_idx (`clinic_id`, `template_id`, `position`),
  CONSTRAINT message_template_images_file_name_check CHECK (((CHAR_LENGTH(file_name) >= 1) AND (CHAR_LENGTH(file_name) <= 120))),
  CONSTRAINT message_template_images_mime_type_check CHECK ((mime_type IN ('image/png', 'image/jpeg', 'image/webp'))),
  CONSTRAINT message_template_images_position_check CHECK ((("position" >= 0) AND ("position" <= 2))),
  CONSTRAINT message_template_images_size_bytes_check CHECK (((size_bytes >= 1) AND (size_bytes <= 2097152)))
);

CREATE TABLE `message_templates` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` LONGTEXT NOT NULL,
  `body` LONGTEXT NOT NULL,
  `created_by` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `archived_at` DATETIME(6),
  PRIMARY KEY (id),
  UNIQUE KEY message_templates_clinic_id_id_key (clinic_id, id),
  KEY message_templates_clinic_idx (`clinic_id`, `updated_at`),
  CONSTRAINT message_templates_body_check CHECK (((CHAR_LENGTH(body) >= 1) AND (CHAR_LENGTH(body) <= 1000))),
  CONSTRAINT message_templates_title_check CHECK (((CHAR_LENGTH(title) >= 1) AND (CHAR_LENGTH(title) <= 80)))
);

CREATE TABLE `nav_tab_labels` (
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `tab` VARCHAR(191) NOT NULL,
  `label` LONGTEXT NOT NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (clinic_id, tab),
  CONSTRAINT nav_tab_labels_label_check CHECK (((CHAR_LENGTH(TRIM(label)) >= 1) AND (CHAR_LENGTH(TRIM(label)) <= 30))),
  CONSTRAINT nav_tab_labels_tab_check CHECK ((tab IN ('dashboard', 'agenda', 'groups', 'patients', 'plans', 'clinical', 'crm', 'relationship', 'waitlist', 'communications', 'contracts', 'sales', 'finance', 'reports', 'history', 'settings', 'profile')))
);

CREATE TABLE `outbound_messages` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `receivable_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `channel` LONGTEXT NOT NULL,
  `kind` LONGTEXT NOT NULL,
  `recipient` LONGTEXT NOT NULL,
  `body` LONGTEXT NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
  `scheduled_for` DATETIME(6) NOT NULL,
  `sent_at` DATETIME(6),
  `attempts` INT NOT NULL DEFAULT 0,
  `last_error` LONGTEXT,
  `idempotency_key` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `manual_completion` JSON,
  PRIMARY KEY (id),
  UNIQUE KEY outbound_messages_clinic_id_idempotency_key_key (clinic_id, idempotency_key),
  KEY outbound_messages_patient_idx (`clinic_id`, `patient_id`, `created_at`),
  KEY outbound_messages_queue_idx (`clinic_id`, `status`, `scheduled_for`),
  CONSTRAINT outbound_messages_attempts_check CHECK ((attempts >= 0)),
  CONSTRAINT outbound_messages_body_check CHECK (((CHAR_LENGTH(body) >= 1) AND (CHAR_LENGTH(body) <= 500))),
  CONSTRAINT outbound_messages_channel_check CHECK ((channel IN ('whatsapp', 'email'))),
  CONSTRAINT outbound_messages_kind_check CHECK ((kind IN ('appointment_reminder', 'payment_reminder', 'manual', 'birthday_reminder', 'satisfaction_followup'))),
  CONSTRAINT outbound_messages_status_check CHECK ((status IN ('queued', 'sent', 'failed', 'cancelled')))
);

CREATE TABLE `patient_plan_services` (
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `plan_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `service_name` LONGTEXT NOT NULL,
  `position` INT NOT NULL,
  `total_sessions` INT NOT NULL,
  `remaining_sessions` INT NOT NULL,
  `total_value_in_cents` INT NOT NULL,
  PRIMARY KEY (clinic_id, plan_id, service_id),
  UNIQUE KEY patient_plan_services_plan_id_position_key (plan_id, `position`),
  CONSTRAINT patient_plan_services_position_check CHECK (("position" >= 0)),
  CONSTRAINT patient_plan_services_remaining_sessions_check CHECK ((remaining_sessions >= 0)),
  CONSTRAINT patient_plan_services_total_sessions_check CHECK ((total_sessions > 0)),
  CONSTRAINT patient_plan_services_total_value_in_cents_check CHECK ((total_value_in_cents >= 0))
);

CREATE TABLE `patient_plans` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `kind` ENUM('single','fixed_package','recurring','custom') NOT NULL,
  `total_sessions` INT NOT NULL,
  `remaining_sessions` INT NOT NULL,
  `valid_from` DATE NOT NULL,
  `valid_until` DATE,
  `total_value_in_cents` INT NOT NULL,
  `installments` INT NOT NULL,
  `first_due_date` DATE NOT NULL,
  `status` ENUM('active','paused','expired','cancelled') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `cancelled_at` DATETIME(6),
  `cancelled_value_in_cents` INT NOT NULL DEFAULT 0,
  `auto_renew` TINYINT(1) NOT NULL DEFAULT 0,
  `renewed_from_plan_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `plan_template_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `source_tab_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `source_appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `paused_at` DATETIME(6),
  `pause_reason` LONGTEXT,
  `pause_expected_return` DATE,
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payment_method` LONGTEXT,
  `tab_source_appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin AS (IF(source_tab_id IS NOT NULL, source_appointment_id, NULL)) VIRTUAL,
  PRIMARY KEY (id),
  KEY patient_plans_auto_renew_idx (`clinic_id`, `valid_until`),
  KEY patient_plans_branch_idx (`clinic_id`, `branch_id`),
  UNIQUE KEY patient_plans_clinic_id_key (`clinic_id`, `id`),
  KEY patient_plans_patient_idx (`clinic_id`, `patient_id`, `status`),
  KEY patient_plans_sales_dates_idx (`clinic_id`, `created_at`, `cancelled_at`),
  UNIQUE KEY patient_plans_single_renewal_idx (`renewed_from_plan_id`),
  UNIQUE KEY patient_plans_tab_appointment_idx (`clinic_id`, `tab_source_appointment_id`),
  CONSTRAINT patient_plans_auto_renew_period CHECK (((NOT auto_renew) OR (valid_until IS NOT NULL))),
  CONSTRAINT patient_plans_cancelled_value_in_cents_check CHECK ((cancelled_value_in_cents >= 0)),
  CONSTRAINT patient_plans_check CHECK (((valid_until IS NULL) OR (valid_until >= valid_from))),
  CONSTRAINT patient_plans_installments_check CHECK (((installments >= 1) AND (installments <= 36))),
  CONSTRAINT patient_plans_payment_method_check CHECK ((payment_method IN ('pix', 'card', 'cash', 'bank_transfer', 'boleto', 'other'))),
  CONSTRAINT patient_plans_remaining_sessions_check CHECK ((remaining_sessions >= 0)),
  CONSTRAINT patient_plans_tab_source_pair CHECK (((source_tab_id IS NULL) = (source_appointment_id IS NULL))),
  CONSTRAINT patient_plans_total_sessions_check CHECK ((total_sessions > 0)),
  CONSTRAINT patient_plans_total_value_in_cents_check CHECK ((total_value_in_cents >= 0))
);

CREATE TABLE `patient_tab_items` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `tab_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `quantity` INT NOT NULL,
  `unit_price_in_cents` INT NOT NULL,
  `unit_cost_in_cents` INT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY patient_tab_items_tab_id_product_id_key (tab_id, product_id),
  CONSTRAINT patient_tab_items_quantity_check CHECK ((quantity > 0)),
  CONSTRAINT patient_tab_items_unit_cost_in_cents_check CHECK ((unit_cost_in_cents >= 0)),
  CONSTRAINT patient_tab_items_unit_price_in_cents_check CHECK ((unit_price_in_cents >= 0))
);

CREATE TABLE `patient_tab_services` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `tab_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `service_name` LONGTEXT NOT NULL,
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `professional_name` LONGTEXT NOT NULL,
  `amount_in_cents` INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY patient_tab_services_appointment_id_key (appointment_id),
  KEY patient_tab_services_tab_idx (`clinic_id`, `tab_id`),
  CONSTRAINT patient_tab_services_amount_in_cents_check CHECK ((amount_in_cents >= 0))
);

CREATE TABLE `patient_tabs` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `notes` LONGTEXT,
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `payment_status` LONGTEXT NOT NULL DEFAULT ('pending'),
  `total_in_cents` INT NOT NULL DEFAULT 0,
  `receivable_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `opened_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `opened_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `closed_at` DATETIME(6),
  `cancelled_at` DATETIME(6),
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY patient_tabs_clinic_identity (clinic_id, id),
  KEY patient_tabs_branch_idx (`clinic_id`, `branch_id`),
  KEY patient_tabs_status_idx (`clinic_id`, `status`, `opened_at`),
  CONSTRAINT patient_tabs_payment_status_check CHECK ((payment_status IN ('pending', 'paid', 'receivable', 'cancelled'))),
  CONSTRAINT patient_tabs_status_check CHECK ((status IN ('open', 'closed', 'cancelled'))),
  CONSTRAINT patient_tabs_total_in_cents_check CHECK ((total_in_cents >= 0))
);

CREATE TABLE `patient_tags` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `name_key` VARCHAR(191) NOT NULL,
  `color` LONGTEXT NOT NULL DEFAULT ('#64748b'),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `category` LONGTEXT,
  PRIMARY KEY (id),
  UNIQUE KEY patient_tags_clinic_key_idx (`clinic_id`, `name_key`),
  CONSTRAINT patient_tags_category_check CHECK ((category IN ('financial', 'service', 'status'))),
  CONSTRAINT patient_tags_color_check CHECK ((color REGEXP '^#[0-9a-fA-F]{6}$')),
  CONSTRAINT patient_tags_name_check CHECK ((TRIM(name) <> ''))
);

CREATE TABLE `patients` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `record_number` VARCHAR(191) NOT NULL,
  `full_name` VARCHAR(191) NOT NULL,
  `cpf` VARCHAR(191),
  `email` LONGTEXT,
  `phone` LONGTEXT NOT NULL,
  `birth_date` DATE,
  `emergency_contact_name` LONGTEXT,
  `emergency_contact_phone` LONGTEXT,
  `notes` LONGTEXT,
  `tags` JSON NOT NULL DEFAULT ('[]'),
  `status` ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `legacy_id` LONGTEXT,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `whatsapp` LONGTEXT,
  `profile` JSON NOT NULL DEFAULT ('{}'),
  `inactive_at` DATETIME(6),
  `merged_into_patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  PRIMARY KEY (id),
  UNIQUE KEY patients_clinic_id_cpf_key (clinic_id, cpf),
  UNIQUE KEY patients_clinic_id_record_number_key (clinic_id, record_number),
  KEY patients_clinic_name_idx (`clinic_id`, `full_name`)
);

CREATE TABLE `payable_events` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `payable_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `kind` LONGTEXT NOT NULL,
  `amount_in_cents` INT NOT NULL,
  `metadata` JSON NOT NULL DEFAULT ('{}'),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `occurred_at` DATETIME(6),
  `cash_available_at` DATETIME(6),
  PRIMARY KEY (id),
  KEY payable_events_idx (`clinic_id`, `payable_id`, `created_at`),
  CONSTRAINT payable_events_kind_check CHECK ((kind IN ('created', 'payment', 'payment_reversal', 'cancellation')))
);

CREATE TABLE `payables` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `description` LONGTEXT NOT NULL,
  `supplier` LONGTEXT,
  `category_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `cost_center_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `due_date` DATE NOT NULL,
  `amount_in_cents` INT NOT NULL,
  `notes` LONGTEXT,
  `status` VARCHAR(191) NOT NULL DEFAULT 'open',
  `payment_method` LONGTEXT,
  `paid_at` DATETIME(6),
  `created_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `paid_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `recurring_payable_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `competence` VARCHAR(191),
  `supplier_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `dre_competence` LONGTEXT DEFAULT (COALESCE(competence, DATE_FORMAT(CONVERT_TZ(COALESCE(created_at, UTC_TIMESTAMP(6)), '+00:00', '-03:00'), '%Y-%m'))),
  `commission_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `posted_on` DATE DEFAULT (DATE(CONVERT_TZ(COALESCE(created_at, UTC_TIMESTAMP(6)), '+00:00', '-03:00'))),
  `cash_available_at` DATETIME(6),
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `active_commission_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin AS (IF(status <> 'cancelled', commission_id, NULL)) VIRTUAL,
  PRIMARY KEY (id),
  KEY payables_branch_idx (`clinic_id`, `branch_id`),
  UNIQUE KEY payables_commission_idx (`clinic_id`, `active_commission_id`),
  KEY payables_due_idx (`clinic_id`, `status`, `due_date`),
  UNIQUE KEY payables_recurring_competence_idx (`recurring_payable_id`, `competence`),
  CONSTRAINT payables_amount_in_cents_check CHECK ((amount_in_cents > 0)),
  CONSTRAINT payables_competence_check CHECK ((competence REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$')),
  CONSTRAINT payables_payment_method_check CHECK ((payment_method IN ('pix', 'card', 'cash', 'bank_transfer', 'boleto', 'other'))),
  CONSTRAINT payables_recurring_link_check CHECK (((recurring_payable_id IS NULL) = (competence IS NULL))),
  CONSTRAINT payables_status_check CHECK ((status IN ('open', 'paid', 'cancelled')))
);

CREATE TABLE `plan_catalog` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `total_value_in_cents` INT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY plan_catalog_clinic_idx (`clinic_id`),
  CONSTRAINT plan_catalog_name_check CHECK (((CHAR_LENGTH(TRIM(name)) >= 3) AND (CHAR_LENGTH(TRIM(name)) <= 120))),
  CONSTRAINT plan_catalog_total_value_in_cents_check CHECK ((total_value_in_cents >= 0))
);

CREATE TABLE `plan_purchases` (
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `idempotency_key` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `fingerprint` LONGTEXT NOT NULL,
  `result` JSON NOT NULL,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (clinic_id, idempotency_key)
);

CREATE TABLE `plan_template_services` (
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `template_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `position` INT NOT NULL,
  `total_sessions` INT NOT NULL,
  `total_value_in_cents` INT NOT NULL,
  `sessions_per_week` INT,
  PRIMARY KEY (clinic_id, template_id, service_id),
  UNIQUE KEY plan_template_services_template_id_position_key (template_id, `position`),
  CONSTRAINT plan_template_services_position_check CHECK (("position" >= 0)),
  CONSTRAINT plan_template_services_sessions_per_week_check CHECK (((sessions_per_week >= 1) AND (sessions_per_week <= 7))),
  CONSTRAINT plan_template_services_total_sessions_check CHECK (((total_sessions >= 1) AND (total_sessions <= 1000))),
  CONSTRAINT plan_template_services_total_value_in_cents_check CHECK ((total_value_in_cents >= 0))
);

CREATE TABLE `plan_templates` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `total_value_in_cents` INT NOT NULL,
  `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `kind` LONGTEXT,
  `total_sessions` INT,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `plan_type` LONGTEXT,
  PRIMARY KEY (id),
  UNIQUE KEY plan_templates_clinic_id_id_key (clinic_id, id),
  KEY plan_templates_clinic_idx (`clinic_id`),
  CONSTRAINT plan_templates_kind_check CHECK ((kind IN ('single', 'fixed_package', 'recurring', 'custom'))),
  CONSTRAINT plan_templates_name_check CHECK (((CHAR_LENGTH(TRIM(name)) >= 3) AND (CHAR_LENGTH(TRIM(name)) <= 120))),
  CONSTRAINT plan_templates_plan_type_check CHECK ((plan_type IN ('single', 'monthly', 'quarterly', 'semiannual', 'annual', 'promotional'))),
  CONSTRAINT plan_templates_total_sessions_check CHECK ((total_sessions > 0)),
  CONSTRAINT plan_templates_total_value_in_cents_check CHECK ((total_value_in_cents >= 0))
);

CREATE TABLE `products` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `sku` VARCHAR(191) NOT NULL,
  `unit` LONGTEXT NOT NULL DEFAULT ('un'),
  `cost_in_cents` INT NOT NULL,
  `sale_price_in_cents` INT NOT NULL,
  `current_stock` INT NOT NULL DEFAULT 0,
  `minimum_stock` INT NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `category_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `brand_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY products_branch_sku_key (clinic_id, branch_id, sku),
  KEY products_branch_idx (`clinic_id`, `branch_id`),
  CONSTRAINT products_cost_in_cents_check CHECK ((cost_in_cents >= 0)),
  CONSTRAINT products_current_stock_check CHECK ((current_stock >= 0)),
  CONSTRAINT products_minimum_stock_check CHECK ((minimum_stock >= 0)),
  CONSTRAINT products_sale_price_in_cents_check CHECK ((sale_price_in_cents >= 0))
);

CREATE TABLE `professionals` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `full_name` LONGTEXT NOT NULL,
  `crefito` VARCHAR(191) NOT NULL,
  `specialty` LONGTEXT NOT NULL,
  `color` CHAR(7) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY professionals_branch_crefito_key (clinic_id, branch_id, crefito),
  KEY professionals_branch_idx (`clinic_id`, `branch_id`),
  UNIQUE KEY professionals_clinic_identity (`clinic_id`, `id`),
  UNIQUE KEY professionals_clinic_user_unique (`clinic_id`, `user_id`)
);

CREATE TABLE `receivable_renegotiations` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `original_amount_in_cents` INT NOT NULL,
  `renegotiated_amount_in_cents` INT NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `original_receivable_ids` JSON NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY receivable_renegotiations_patient_idx (`clinic_id`, `patient_id`, `created_at`),
  CONSTRAINT receivable_renegotiations_original_amount_in_cents_check CHECK ((original_amount_in_cents >= 0)),
  CONSTRAINT receivable_renegotiations_renegotiated_amount_in_cents_check CHECK ((renegotiated_amount_in_cents >= 0))
);

CREATE TABLE `receivables` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `plan_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `description` LONGTEXT NOT NULL,
  `installment_number` INT NOT NULL,
  `installment_count` INT NOT NULL,
  `due_date` DATE NOT NULL,
  `amount_in_cents` INT NOT NULL,
  `status` ENUM('open','paid','cancelled') NOT NULL DEFAULT 'open',
  `paid_at` DATETIME(6),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `payment_method` LONGTEXT,
  `renegotiation_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `competence` LONGTEXT DEFAULT (DATE_FORMAT(CONVERT_TZ(COALESCE(created_at, UTC_TIMESTAMP(6)), '+00:00', '-03:00'), '%Y-%m')),
  `category_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `cost_center_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `posted_on` DATE DEFAULT (DATE(CONVERT_TZ(COALESCE(created_at, UTC_TIMESTAMP(6)), '+00:00', '-03:00'))),
  `cash_available_at` DATETIME(6),
  `receipt_number` INT,
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY receivables_plan_id_installment_number_key (plan_id, installment_number),
  KEY receivables_branch_idx (`clinic_id`, `branch_id`),
  KEY receivables_due_idx (`clinic_id`, `status`, `due_date`),
  UNIQUE KEY receivables_receipt_number_idx (`clinic_id`, `receipt_number`),
  CONSTRAINT receivables_amount_in_cents_check CHECK ((amount_in_cents >= 0)),
  CONSTRAINT receivables_installment_count_check CHECK ((installment_count > 0)),
  CONSTRAINT receivables_installment_number_check CHECK ((installment_number > 0)),
  CONSTRAINT receivables_payment_method_check CHECK ((payment_method IN ('pix', 'card', 'cash', 'bank_transfer', 'boleto', 'other'))),
  CONSTRAINT receivables_receipt_number_check CHECK ((receipt_number > 0))
);

CREATE TABLE `recurring_payables` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `description` LONGTEXT NOT NULL,
  `supplier` LONGTEXT,
  `category_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `cost_center_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `amount_in_cents` INT NOT NULL,
  `day_of_month` SMALLINT NOT NULL,
  `start_month` LONGTEXT NOT NULL,
  `end_month` LONGTEXT,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `resumed_from_month` LONGTEXT,
  `created_by_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (id),
  KEY recurring_payables_branch_idx (`clinic_id`, `branch_id`),
  KEY recurring_payables_clinic_idx (`clinic_id`, `active`),
  CONSTRAINT recurring_payables_amount_in_cents_check CHECK ((amount_in_cents > 0)),
  CONSTRAINT recurring_payables_day_of_month_check CHECK (((day_of_month >= 1) AND (day_of_month <= 28))),
  CONSTRAINT recurring_payables_end_month_check CHECK ((end_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$')),
  CONSTRAINT recurring_payables_period_check CHECK (((end_month IS NULL) OR (end_month >= start_month))),
  CONSTRAINT recurring_payables_resumed_from_month_check CHECK ((resumed_from_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$')),
  CONSTRAINT recurring_payables_start_month_check CHECK ((start_month REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])$'))
);

CREATE TABLE `relationship_settings` (
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `birthday_days_ahead` INT NOT NULL,
  `single_no_return_days` INT NOT NULL,
  `plan_expiring_days` INT NOT NULL,
  `low_balance_sessions` INT NOT NULL,
  `expired_with_balance_days` INT NOT NULL,
  `treatment_paused_days` INT NOT NULL,
  `repeated_no_show_count` INT NOT NULL,
  `repeated_no_show_window_days` INT NOT NULL,
  `former_client_min_days` INT NOT NULL,
  `former_client_max_days` INT NOT NULL,
  `messages` JSON NOT NULL,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (clinic_id),
  CONSTRAINT relationship_settings_check CHECK ((former_client_min_days <= former_client_max_days))
);

CREATE TABLE `replacement_credits` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `source_session_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'available',
  `used_session_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `used_at` DATETIME(6),
  PRIMARY KEY (id),
  UNIQUE KEY replacement_credits_patient_id_source_session_id_key (patient_id, source_session_id),
  KEY replacement_credits_patient_idx (`clinic_id`, `patient_id`, `status`, `created_at`),
  CONSTRAINT replacement_credits_status_check CHECK ((status IN ('available', 'used', 'cancelled')))
);

CREATE TABLE `rooms` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `capacity` INT NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY rooms_branch_name_key (clinic_id, branch_id, name),
  KEY rooms_branch_idx (`clinic_id`, `branch_id`),
  CONSTRAINT rooms_capacity_check CHECK ((capacity > 0))
);

CREATE TABLE `satisfaction_surveys` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `score` INT NOT NULL,
  `comment` LONGTEXT,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `source_message_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  PRIMARY KEY (id),
  UNIQUE KEY satisfaction_surveys_appointment_idx (`clinic_id`, `appointment_id`),
  KEY satisfaction_surveys_clinic_created_idx (`clinic_id`, `created_at`),
  UNIQUE KEY satisfaction_surveys_message_idx (`clinic_id`, `source_message_id`),
  CONSTRAINT satisfaction_surveys_comment_check CHECK (((comment IS NULL) OR (CHAR_LENGTH(comment) <= 1000))),
  CONSTRAINT satisfaction_surveys_score_check CHECK (((score >= 0) AND (score <= 10)))
);

CREATE TABLE `schedule_blocks` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `professional_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `room_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `starts_at` DATETIME(6) NOT NULL,
  `ends_at` DATETIME(6) NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `status` LONGTEXT NOT NULL DEFAULT ('active'),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (id),
  KEY schedule_blocks_branch_idx (`clinic_id`, `branch_id`),
  KEY schedule_blocks_range_idx (`clinic_id`, `starts_at`, `ends_at`),
  CONSTRAINT schedule_blocks_check CHECK (((professional_id IS NOT NULL) OR (room_id IS NOT NULL))),
  CONSTRAINT schedule_blocks_check1 CHECK ((ends_at > starts_at)),
  CONSTRAINT schedule_blocks_status_check CHECK ((status IN ('active', 'cancelled')))
);

CREATE TABLE `services` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `duration_minutes` INT NOT NULL,
  `price_in_cents` INT NOT NULL,
  `color` CHAR(7) NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `professional_ids` JSON NOT NULL DEFAULT ('[]'),
  `room_ids` JSON NOT NULL DEFAULT ('[]'),
  PRIMARY KEY (id),
  UNIQUE KEY services_clinic_id_key (`clinic_id`, `id`),
  CONSTRAINT services_duration_minutes_check CHECK ((duration_minutes >= 15)),
  CONSTRAINT services_price_in_cents_check CHECK ((price_in_cents >= 0))
);

CREATE TABLE `session_movements` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `plan_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `kind` ENUM('credit','consumption','reversal','adjustment') NOT NULL,
  `quantity` INT NOT NULL,
  `reason` LONGTEXT NOT NULL,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `group_attendance_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `consumption_attendance_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin AS (IF(kind = 'consumption', group_attendance_id, NULL)) VIRTUAL,
  `reversal_attendance_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin AS (IF(kind = 'reversal', group_attendance_id, NULL)) VIRTUAL,
  `consumption_appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin AS (IF(kind = 'consumption', appointment_id, NULL)) VIRTUAL,
  `reversal_appointment_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin AS (IF(kind = 'reversal', appointment_id, NULL)) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY group_consumption_once_idx (`consumption_attendance_id`),
  UNIQUE KEY group_reversal_once_idx (`reversal_attendance_id`),
  UNIQUE KEY session_consumption_once_idx (`plan_id`, `consumption_appointment_id`),
  UNIQUE KEY session_reversal_once_idx (`plan_id`, `reversal_appointment_id`),
  CONSTRAINT session_movements_quantity_check CHECK ((quantity <> 0))
);

CREATE TABLE `stock_movements` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `product_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_tab_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `kind` LONGTEXT NOT NULL,
  `quantity` INT NOT NULL,
  `balance_after` INT NOT NULL,
  `notes` LONGTEXT NOT NULL,
  `actor_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY stock_movements_product_idx (`clinic_id`, `product_id`, `created_at`),
  CONSTRAINT stock_movements_balance_after_check CHECK ((balance_after >= 0)),
  CONSTRAINT stock_movements_kind_check CHECK ((kind IN ('initial_stock', 'purchase', 'adjustment_in', 'adjustment_out', 'loss', 'sale', 'sale_reversal'))),
  CONSTRAINT stock_movements_quantity_check CHECK ((quantity <> 0))
);

CREATE TABLE `suppliers` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `name` LONGTEXT NOT NULL,
  `kind` LONGTEXT NOT NULL,
  `document` LONGTEXT NOT NULL DEFAULT (''),
  `phone` LONGTEXT NOT NULL DEFAULT (''),
  `email` LONGTEXT,
  `notes` LONGTEXT NOT NULL DEFAULT (''),
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `whatsapp` LONGTEXT NOT NULL DEFAULT (''),
  `hired_on` DATE,
  `contract_amount_in_cents` INT,
  `billing_cycle` LONGTEXT NOT NULL DEFAULT ('one_time'),
  `payment_method` LONGTEXT,
  `installments` INT NOT NULL DEFAULT 1,
  `payment_terms` LONGTEXT NOT NULL DEFAULT (''),
  `orders` LONGTEXT NOT NULL DEFAULT (''),
  `contracts` LONGTEXT NOT NULL DEFAULT (''),
  PRIMARY KEY (id),
  CONSTRAINT suppliers_billing_cycle_check CHECK ((billing_cycle IN ('one_time', 'monthly', 'quarterly', 'yearly'))),
  CONSTRAINT suppliers_contract_amount_in_cents_check CHECK ((contract_amount_in_cents >= 0)),
  CONSTRAINT suppliers_installments_check CHECK (((installments >= 1) AND (installments <= 120))),
  CONSTRAINT suppliers_kind_check CHECK ((kind IN ('person', 'company'))),
  CONSTRAINT suppliers_payment_method_check CHECK ((payment_method IN ('pix', 'card', 'cash', 'bank_transfer', 'boleto', 'other')))
);

CREATE TABLE `therapeutic_goals` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `author_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `title` LONGTEXT NOT NULL,
  `description` LONGTEXT,
  `baseline_value` DECIMAL(18,6),
  `target_value` DECIMAL(18,6),
  `unit` LONGTEXT,
  `target_date` DATE,
  `status` VARCHAR(191) NOT NULL DEFAULT 'active',
  `achieved_at` DATETIME(6),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY therapeutic_goals_patient_idx (`clinic_id`, `patient_id`, `status`, `created_at`),
  CONSTRAINT therapeutic_goals_status_check CHECK ((status IN ('active', 'achieved', 'cancelled')))
);

CREATE TABLE `treatment_closures` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `author_user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `kind` LONGTEXT NOT NULL,
  `summary` LONGTEXT NOT NULL,
  `recommendations` LONGTEXT,
  `occurred_at` DATETIME(6) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY treatment_closures_patient_idx (`clinic_id`, `patient_id`, `occurred_at`),
  CONSTRAINT treatment_closures_kind_check CHECK ((kind IN ('discharge', 'referral', 'abandonment')))
);

CREATE TABLE `user_branches` (
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `user_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE `users` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `full_name` LONGTEXT NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `password_hash` LONGTEXT NOT NULL,
  `role` LONGTEXT NOT NULL,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `job_title` LONGTEXT,
  `modules` JSON,
  `edit_modules` JSON,
  `permissions` JSON NOT NULL DEFAULT ('[]'),
  `session_version` INT NOT NULL DEFAULT 0,
  `all_branches` TINYINT(1) NOT NULL DEFAULT 1,
  `avatar_data_url` LONGTEXT,
  `whatsapp` LONGTEXT,
  PRIMARY KEY (id),
  UNIQUE KEY users_clinic_id_email_key (clinic_id, email),
  UNIQUE KEY users_clinic_identity (`clinic_id`, `id`),
  CONSTRAINT users_role_check CHECK ((role IN ('admin', 'user')))
);

CREATE TABLE `waitlist_entries` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `kind` LONGTEXT NOT NULL,
  `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `product_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `status` LONGTEXT NOT NULL DEFAULT ('waiting'),
  `notes` LONGTEXT NOT NULL DEFAULT (''),
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `resolved_at` DATETIME(6),
  PRIMARY KEY (id),
  KEY waitlist_entries_list_idx (`clinic_id`, `branch_id`, `created_at`),
  CONSTRAINT waitlist_entries_check CHECK ((((kind = 'service') AND (service_id IS NOT NULL) AND (product_id IS NULL)) OR ((kind = 'product') AND (product_id IS NOT NULL) AND (service_id IS NULL)))),
  CONSTRAINT waitlist_entries_kind_check CHECK ((kind IN ('service', 'product'))),
  CONSTRAINT waitlist_entries_notes_check CHECK ((CHAR_LENGTH(notes) <= 500)),
  CONSTRAINT waitlist_entries_status_check CHECK ((status IN ('waiting', 'contacted', 'served', 'cancelled')))
);

CREATE TABLE `whatsapp_campaign_recipients` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `campaign_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `patient_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `position` INT NOT NULL,
  `patient_name` LONGTEXT NOT NULL,
  `phone` LONGTEXT NOT NULL,
  `message` LONGTEXT NOT NULL,
  `status` LONGTEXT NOT NULL DEFAULT ('pending'),
  `handled_at` DATETIME(6),
  `handled_by` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  PRIMARY KEY (id),
  UNIQUE KEY whatsapp_campaign_recipients_campaign_id_patient_id_key (campaign_id, patient_id),
  KEY whatsapp_campaign_recipients_campaign_idx (`clinic_id`, `campaign_id`, `position`),
  CONSTRAINT whatsapp_campaign_recipients_status_check CHECK ((status IN ('pending', 'sent', 'skipped')))
);

CREATE TABLE `whatsapp_campaigns` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `template_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `template_title` LONGTEXT NOT NULL,
  `name` LONGTEXT NOT NULL,
  `body` LONGTEXT NOT NULL,
  `image_ids` JSON NOT NULL DEFAULT ('[]'),
  `created_by` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `completed_at` DATETIME(6),
  PRIMARY KEY (id),
  UNIQUE KEY whatsapp_campaigns_clinic_id_id_key (clinic_id, id),
  KEY whatsapp_campaigns_clinic_idx (`clinic_id`, `created_at`),
  CONSTRAINT whatsapp_campaigns_name_check CHECK (((CHAR_LENGTH(name) >= 1) AND (CHAR_LENGTH(name) <= 80)))
);

ALTER TABLE `agenda_notes` ADD CONSTRAINT agenda_notes_clinic_id_author_user_id_fkey FOREIGN KEY (clinic_id, author_user_id) REFERENCES users(clinic_id, id);
ALTER TABLE `agenda_notes` ADD CONSTRAINT agenda_notes_clinic_id_branch_id_fkey FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `agenda_notes` ADD CONSTRAINT agenda_notes_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE `agenda_notes` ADD CONSTRAINT agenda_notes_clinic_id_professional_id_fkey FOREIGN KEY (clinic_id, professional_id) REFERENCES professionals(clinic_id, id);
ALTER TABLE `appointment_reschedules` ADD CONSTRAINT appointment_reschedules_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `appointment_reschedules` ADD CONSTRAINT appointment_reschedules_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
ALTER TABLE `appointment_reschedules` ADD CONSTRAINT appointment_reschedules_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `appointment_reschedules` ADD CONSTRAINT appointment_reschedules_previous_professional_id_fkey FOREIGN KEY (previous_professional_id) REFERENCES professionals(id);
ALTER TABLE `appointment_reschedules` ADD CONSTRAINT appointment_reschedules_previous_room_id_fkey FOREIGN KEY (previous_room_id) REFERENCES rooms(id);
ALTER TABLE `appointment_reschedules` ADD CONSTRAINT appointment_reschedules_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id);
ALTER TABLE `appointment_reschedules` ADD CONSTRAINT appointment_reschedules_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id);
ALTER TABLE `appointments` ADD CONSTRAINT appointments_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `appointments` ADD CONSTRAINT appointments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `appointments` ADD CONSTRAINT appointments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE `appointments` ADD CONSTRAINT appointments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `appointments` ADD CONSTRAINT appointments_predecessor_id_fkey FOREIGN KEY (predecessor_id) REFERENCES appointments(id);
ALTER TABLE `appointments` ADD CONSTRAINT appointments_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id);
ALTER TABLE `appointments` ADD CONSTRAINT appointments_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id);
ALTER TABLE `appointments` ADD CONSTRAINT appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE `assessment_templates` ADD CONSTRAINT assessment_templates_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `assessment_templates` ADD CONSTRAINT assessment_templates_family_id_fkey FOREIGN KEY (family_id) REFERENCES assessment_templates(id);
ALTER TABLE `audit_events` ADD CONSTRAINT audit_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `audit_events` ADD CONSTRAINT audit_events_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `branches` ADD CONSTRAINT branches_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE `clinic_catalogs` ADD CONSTRAINT clinic_catalogs_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `clinic_catalogs` ADD CONSTRAINT clinic_catalogs_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES clinic_catalogs(id);
ALTER TABLE `clinic_sequences` ADD CONSTRAINT clinic_sequences_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `clinical_access_events` ADD CONSTRAINT clinical_access_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `clinical_access_events` ADD CONSTRAINT clinical_access_events_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `clinical_access_events` ADD CONSTRAINT clinical_access_events_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `clinical_addenda` ADD CONSTRAINT clinical_addenda_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id);
ALTER TABLE `clinical_addenda` ADD CONSTRAINT clinical_addenda_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `clinical_addenda` ADD CONSTRAINT clinical_addenda_clinical_record_id_fkey FOREIGN KEY (clinical_record_id) REFERENCES clinical_records(id);
ALTER TABLE `clinical_addenda` ADD CONSTRAINT clinical_addenda_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `clinical_alerts` ADD CONSTRAINT clinical_alerts_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id);
ALTER TABLE `clinical_alerts` ADD CONSTRAINT clinical_alerts_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `clinical_alerts` ADD CONSTRAINT clinical_alerts_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `clinical_assessments` ADD CONSTRAINT clinical_assessments_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
ALTER TABLE `clinical_assessments` ADD CONSTRAINT clinical_assessments_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id);
ALTER TABLE `clinical_assessments` ADD CONSTRAINT clinical_assessments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `clinical_assessments` ADD CONSTRAINT clinical_assessments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `clinical_assessments` ADD CONSTRAINT clinical_assessments_template_id_fkey FOREIGN KEY (template_id) REFERENCES assessment_templates(id);
ALTER TABLE `clinical_attachments` ADD CONSTRAINT clinical_attachments_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id);
ALTER TABLE `clinical_attachments` ADD CONSTRAINT clinical_attachments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `clinical_attachments` ADD CONSTRAINT clinical_attachments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `clinical_measurements` ADD CONSTRAINT clinical_measurements_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id);
ALTER TABLE `clinical_measurements` ADD CONSTRAINT clinical_measurements_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `clinical_measurements` ADD CONSTRAINT clinical_measurements_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES therapeutic_goals(id);
ALTER TABLE `clinical_measurements` ADD CONSTRAINT clinical_measurements_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `clinical_record_revisions` ADD CONSTRAINT clinical_record_revisions_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id);
ALTER TABLE `clinical_record_revisions` ADD CONSTRAINT clinical_record_revisions_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `clinical_record_revisions` ADD CONSTRAINT clinical_record_revisions_clinical_record_id_fkey FOREIGN KEY (clinical_record_id) REFERENCES clinical_records(id);
ALTER TABLE `clinical_records` ADD CONSTRAINT clinical_records_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
ALTER TABLE `clinical_records` ADD CONSTRAINT clinical_records_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id);
ALTER TABLE `clinical_records` ADD CONSTRAINT clinical_records_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `clinical_records` ADD CONSTRAINT clinical_records_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `clinical_records` ADD CONSTRAINT clinical_records_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id);
ALTER TABLE `clinical_resources` ADD CONSTRAINT clinical_resources_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id);
ALTER TABLE `clinical_resources` ADD CONSTRAINT clinical_resources_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `clinical_resources` ADD CONSTRAINT clinical_resources_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `commission_account_payments` ADD CONSTRAINT commission_account_payments_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id);
ALTER TABLE `commission_account_payments` ADD CONSTRAINT commission_account_payments_clinic_id_commission_id_fkey FOREIGN KEY (clinic_id, commission_id) REFERENCES commission_entries(clinic_id, id);
ALTER TABLE `commission_account_payments` ADD CONSTRAINT commission_account_payments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `commission_account_payments` ADD CONSTRAINT commission_account_payments_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id);
ALTER TABLE `commission_adjustments` ADD CONSTRAINT commission_adjustments_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id);
ALTER TABLE `commission_adjustments` ADD CONSTRAINT commission_adjustments_clinic_id_commission_id_fkey FOREIGN KEY (clinic_id, commission_id) REFERENCES commission_entries(clinic_id, id);
ALTER TABLE `commission_adjustments` ADD CONSTRAINT commission_adjustments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `commission_adjustments` ADD CONSTRAINT commission_adjustments_clinic_id_reconciliation_id_fkey FOREIGN KEY (clinic_id, reconciliation_id) REFERENCES commission_reconciliations(clinic_id, id);
ALTER TABLE `commission_adjustments` ADD CONSTRAINT commission_adjustments_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id);
ALTER TABLE `commission_entries` ADD CONSTRAINT commission_entries_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
ALTER TABLE `commission_entries` ADD CONSTRAINT commission_entries_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `commission_entries` ADD CONSTRAINT commission_entries_group_attendance_id_fkey FOREIGN KEY (group_attendance_id) REFERENCES group_attendance(id);
ALTER TABLE `commission_entries` ADD CONSTRAINT commission_entries_paid_by_user_id_fkey FOREIGN KEY (paid_by_user_id) REFERENCES users(id);
ALTER TABLE `commission_entries` ADD CONSTRAINT commission_entries_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id);
ALTER TABLE `commission_entries` ADD CONSTRAINT commission_entries_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES commission_rules(id);
ALTER TABLE `commission_entries` ADD CONSTRAINT commission_entries_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE `commission_payment_events` ADD CONSTRAINT commission_payment_events_account_payment_id_fkey FOREIGN KEY (account_payment_id) REFERENCES commission_account_payments(id);
ALTER TABLE `commission_payment_events` ADD CONSTRAINT commission_payment_events_account_scope FOREIGN KEY (clinic_id, account_payment_id) REFERENCES commission_account_payments(clinic_id, id);
ALTER TABLE `commission_payment_events` ADD CONSTRAINT commission_payment_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `commission_payment_events` ADD CONSTRAINT commission_payment_events_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `commission_payment_events` ADD CONSTRAINT commission_payment_events_commission_id_fkey FOREIGN KEY (commission_id) REFERENCES commission_entries(id);
ALTER TABLE `commission_payment_events` ADD CONSTRAINT commission_payment_events_commission_scope FOREIGN KEY (clinic_id, commission_id) REFERENCES commission_entries(clinic_id, id);
ALTER TABLE `commission_reconciliations` ADD CONSTRAINT commission_reconciliations_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id);
ALTER TABLE `commission_reconciliations` ADD CONSTRAINT commission_reconciliations_clinic_id_commission_id_fkey FOREIGN KEY (clinic_id, commission_id) REFERENCES commission_entries(clinic_id, id);
ALTER TABLE `commission_reconciliations` ADD CONSTRAINT commission_reconciliations_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `commission_rules` ADD CONSTRAINT commission_rules_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `commission_rules` ADD CONSTRAINT commission_rules_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id);
ALTER TABLE `commission_rules` ADD CONSTRAINT commission_rules_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE `commission_rules` ADD CONSTRAINT commission_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE `communication_preferences` ADD CONSTRAINT communication_preferences_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `communication_preferences` ADD CONSTRAINT communication_preferences_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `contact_activities` ADD CONSTRAINT contact_activities_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `contact_activities` ADD CONSTRAINT contact_activities_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `contact_activities` ADD CONSTRAINT contact_activities_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `cost_centers` ADD CONSTRAINT cost_centers_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `document_signature_links` ADD CONSTRAINT document_signature_links_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE `document_signature_links` ADD CONSTRAINT document_signature_links_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE `document_signature_links` ADD CONSTRAINT document_signature_links_document_id_fkey FOREIGN KEY (document_id) REFERENCES issued_documents(id) ON DELETE CASCADE;
ALTER TABLE `document_templates` ADD CONSTRAINT document_templates_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `document_templates` ADD CONSTRAINT document_templates_previous_version_id_fkey FOREIGN KEY (previous_version_id) REFERENCES document_templates(id);
ALTER TABLE `external_operations` ADD CONSTRAINT external_operations_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id);
ALTER TABLE `external_operations` ADD CONSTRAINT external_operations_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `external_operations` ADD CONSTRAINT external_operations_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `external_operations` ADD CONSTRAINT external_operations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `external_operations` ADD CONSTRAINT external_operations_receivable_id_fkey FOREIGN KEY (receivable_id) REFERENCES receivables(id);
ALTER TABLE `financial_categories` ADD CONSTRAINT financial_categories_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `financial_date_corrections` ADD CONSTRAINT financial_date_corrections_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `financial_date_corrections` ADD CONSTRAINT financial_date_corrections_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `financial_date_corrections` ADD CONSTRAINT financial_date_corrections_payable_event_id_fkey FOREIGN KEY (payable_event_id) REFERENCES payable_events(id);
ALTER TABLE `financial_date_corrections` ADD CONSTRAINT financial_date_corrections_receivable_event_id_fkey FOREIGN KEY (receivable_event_id) REFERENCES financial_events(id);
ALTER TABLE `financial_events` ADD CONSTRAINT financial_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `financial_events` ADD CONSTRAINT financial_events_balance_receivable_id_fkey FOREIGN KEY (balance_receivable_id) REFERENCES receivables(id);
ALTER TABLE `financial_events` ADD CONSTRAINT financial_events_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `financial_events` ADD CONSTRAINT financial_events_receivable_id_fkey FOREIGN KEY (receivable_id) REFERENCES receivables(id);
ALTER TABLE `group_attendance` ADD CONSTRAINT group_attendance_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `group_attendance` ADD CONSTRAINT group_attendance_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `group_attendance` ADD CONSTRAINT group_attendance_recorded_by_user_id_fkey FOREIGN KEY (recorded_by_user_id) REFERENCES users(id);
ALTER TABLE `group_attendance` ADD CONSTRAINT group_attendance_replacement_credit_id_fkey FOREIGN KEY (replacement_credit_id) REFERENCES replacement_credits(id);
ALTER TABLE `group_attendance` ADD CONSTRAINT group_attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES group_sessions(id);
ALTER TABLE `group_classes` ADD CONSTRAINT group_classes_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `group_classes` ADD CONSTRAINT group_classes_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `group_classes` ADD CONSTRAINT group_classes_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id);
ALTER TABLE `group_classes` ADD CONSTRAINT group_classes_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id);
ALTER TABLE `group_classes` ADD CONSTRAINT group_classes_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE `group_enrollments` ADD CONSTRAINT group_enrollments_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `group_enrollments` ADD CONSTRAINT group_enrollments_group_id_fkey FOREIGN KEY (group_id) REFERENCES group_classes(id);
ALTER TABLE `group_enrollments` ADD CONSTRAINT group_enrollments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `group_sessions` ADD CONSTRAINT group_sessions_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `group_sessions` ADD CONSTRAINT group_sessions_group_id_fkey FOREIGN KEY (group_id) REFERENCES group_classes(id);
ALTER TABLE `group_sessions` ADD CONSTRAINT group_sessions_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id);
ALTER TABLE `holidays` ADD CONSTRAINT holidays_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `issued_documents` ADD CONSTRAINT issued_documents_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `issued_documents` ADD CONSTRAINT issued_documents_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id);
ALTER TABLE `issued_documents` ADD CONSTRAINT issued_documents_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `issued_documents` ADD CONSTRAINT issued_documents_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES patient_plans(id);
ALTER TABLE `issued_documents` ADD CONSTRAINT issued_documents_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id);
ALTER TABLE `issued_documents` ADD CONSTRAINT issued_documents_template_id_fkey FOREIGN KEY (template_id) REFERENCES document_templates(id);
ALTER TABLE `lead_contacts` ADD CONSTRAINT lead_contacts_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `lead_contacts` ADD CONSTRAINT lead_contacts_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `lead_contacts` ADD CONSTRAINT lead_contacts_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE `lead_stage_history` ADD CONSTRAINT lead_stage_history_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `lead_stage_history` ADD CONSTRAINT lead_stage_history_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `lead_stage_history` ADD CONSTRAINT lead_stage_history_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE `lead_stages` ADD CONSTRAINT lead_stages_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE `lead_tasks` ADD CONSTRAINT lead_tasks_assigned_user_id_fkey FOREIGN KEY (assigned_user_id) REFERENCES users(id);
ALTER TABLE `lead_tasks` ADD CONSTRAINT lead_tasks_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `lead_tasks` ADD CONSTRAINT lead_tasks_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id);
ALTER TABLE `lead_tasks` ADD CONSTRAINT lead_tasks_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE `leads` ADD CONSTRAINT leads_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `leads` ADD CONSTRAINT leads_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `leads` ADD CONSTRAINT leads_converted_patient_id_fkey FOREIGN KEY (converted_patient_id) REFERENCES patients(id);
ALTER TABLE `leads` ADD CONSTRAINT leads_responsible_user_id_fkey FOREIGN KEY (responsible_user_id) REFERENCES users(id);
ALTER TABLE `message_template_images` ADD CONSTRAINT message_template_images_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `message_template_images` ADD CONSTRAINT message_template_images_clinic_id_template_id_fkey FOREIGN KEY (clinic_id, template_id) REFERENCES message_templates(clinic_id, id);
ALTER TABLE `message_templates` ADD CONSTRAINT message_templates_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `message_templates` ADD CONSTRAINT message_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE `nav_tab_labels` ADD CONSTRAINT nav_tab_labels_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE `outbound_messages` ADD CONSTRAINT outbound_messages_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
ALTER TABLE `outbound_messages` ADD CONSTRAINT outbound_messages_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `outbound_messages` ADD CONSTRAINT outbound_messages_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `outbound_messages` ADD CONSTRAINT outbound_messages_receivable_id_fkey FOREIGN KEY (receivable_id) REFERENCES receivables(id);
ALTER TABLE `patient_plan_services` ADD CONSTRAINT patient_plan_services_clinic_id_plan_id_fkey FOREIGN KEY (clinic_id, plan_id) REFERENCES patient_plans(clinic_id, id) ON DELETE CASCADE;
ALTER TABLE `patient_plan_services` ADD CONSTRAINT patient_plan_services_clinic_id_service_id_fkey FOREIGN KEY (clinic_id, service_id) REFERENCES services(clinic_id, id);
ALTER TABLE `patient_plans` ADD CONSTRAINT patient_plans_appointment_source FOREIGN KEY (clinic_id, source_appointment_id) REFERENCES appointments(clinic_id, id);
ALTER TABLE `patient_plans` ADD CONSTRAINT patient_plans_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `patient_plans` ADD CONSTRAINT patient_plans_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `patient_plans` ADD CONSTRAINT patient_plans_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `patient_plans` ADD CONSTRAINT patient_plans_renewed_from_plan_id_fkey FOREIGN KEY (renewed_from_plan_id) REFERENCES patient_plans(id);
ALTER TABLE `patient_plans` ADD CONSTRAINT patient_plans_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE `patient_plans` ADD CONSTRAINT patient_plans_tab_source FOREIGN KEY (clinic_id, source_tab_id) REFERENCES patient_tabs(clinic_id, id);
ALTER TABLE `patient_plans` ADD CONSTRAINT patient_plans_template_clinic_fk FOREIGN KEY (clinic_id, plan_template_id) REFERENCES plan_templates(clinic_id, id);
ALTER TABLE `patient_tab_items` ADD CONSTRAINT patient_tab_items_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `patient_tab_items` ADD CONSTRAINT patient_tab_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE `patient_tab_items` ADD CONSTRAINT patient_tab_items_tab_id_fkey FOREIGN KEY (tab_id) REFERENCES patient_tabs(id);
ALTER TABLE `patient_tab_services` ADD CONSTRAINT patient_tab_services_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
ALTER TABLE `patient_tab_services` ADD CONSTRAINT patient_tab_services_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `patient_tab_services` ADD CONSTRAINT patient_tab_services_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id);
ALTER TABLE `patient_tab_services` ADD CONSTRAINT patient_tab_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE `patient_tab_services` ADD CONSTRAINT patient_tab_services_tab_id_fkey FOREIGN KEY (tab_id) REFERENCES patient_tabs(id);
ALTER TABLE `patient_tabs` ADD CONSTRAINT patient_tabs_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `patient_tabs` ADD CONSTRAINT patient_tabs_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `patient_tabs` ADD CONSTRAINT patient_tabs_opened_by_user_id_fkey FOREIGN KEY (opened_by_user_id) REFERENCES users(id);
ALTER TABLE `patient_tabs` ADD CONSTRAINT patient_tabs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `patient_tabs` ADD CONSTRAINT patient_tabs_receivable_id_fkey FOREIGN KEY (receivable_id) REFERENCES receivables(id);
ALTER TABLE `patient_tags` ADD CONSTRAINT patient_tags_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `patients` ADD CONSTRAINT patients_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `patients` ADD CONSTRAINT patients_merged_into_patient_id_fkey FOREIGN KEY (merged_into_patient_id) REFERENCES patients(id);
ALTER TABLE `payable_events` ADD CONSTRAINT payable_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `payable_events` ADD CONSTRAINT payable_events_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `payable_events` ADD CONSTRAINT payable_events_payable_id_fkey FOREIGN KEY (payable_id) REFERENCES payables(id);
ALTER TABLE `payables` ADD CONSTRAINT payables_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `payables` ADD CONSTRAINT payables_category_id_fkey FOREIGN KEY (category_id) REFERENCES financial_categories(id);
ALTER TABLE `payables` ADD CONSTRAINT payables_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `payables` ADD CONSTRAINT payables_commission_id_fkey FOREIGN KEY (commission_id) REFERENCES commission_entries(id);
ALTER TABLE `payables` ADD CONSTRAINT payables_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id);
ALTER TABLE `payables` ADD CONSTRAINT payables_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id);
ALTER TABLE `payables` ADD CONSTRAINT payables_paid_by_user_id_fkey FOREIGN KEY (paid_by_user_id) REFERENCES users(id);
ALTER TABLE `payables` ADD CONSTRAINT payables_recurring_payable_id_fkey FOREIGN KEY (recurring_payable_id) REFERENCES recurring_payables(id);
ALTER TABLE `payables` ADD CONSTRAINT payables_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE `plan_catalog` ADD CONSTRAINT plan_catalog_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `plan_purchases` ADD CONSTRAINT plan_purchases_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `plan_purchases` ADD CONSTRAINT plan_purchases_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `plan_template_services` ADD CONSTRAINT plan_template_services_clinic_id_service_id_fkey FOREIGN KEY (clinic_id, service_id) REFERENCES services(clinic_id, id);
ALTER TABLE `plan_template_services` ADD CONSTRAINT plan_template_services_clinic_id_template_id_fkey FOREIGN KEY (clinic_id, template_id) REFERENCES plan_templates(clinic_id, id) ON DELETE CASCADE;
ALTER TABLE `plan_templates` ADD CONSTRAINT plan_templates_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `plan_templates` ADD CONSTRAINT plan_templates_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
ALTER TABLE `products` ADD CONSTRAINT products_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `products` ADD CONSTRAINT products_brand_id_fkey FOREIGN KEY (brand_id) REFERENCES clinic_catalogs(id);
ALTER TABLE `products` ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES clinic_catalogs(id);
ALTER TABLE `products` ADD CONSTRAINT products_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `professionals` ADD CONSTRAINT professionals_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `professionals` ADD CONSTRAINT professionals_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `professionals` ADD CONSTRAINT professionals_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE `receivable_renegotiations` ADD CONSTRAINT receivable_renegotiations_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `receivable_renegotiations` ADD CONSTRAINT receivable_renegotiations_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `receivable_renegotiations` ADD CONSTRAINT receivable_renegotiations_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `receivables` ADD CONSTRAINT receivables_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `receivables` ADD CONSTRAINT receivables_category_id_fkey FOREIGN KEY (category_id) REFERENCES financial_categories(id);
ALTER TABLE `receivables` ADD CONSTRAINT receivables_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `receivables` ADD CONSTRAINT receivables_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id);
ALTER TABLE `receivables` ADD CONSTRAINT receivables_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `receivables` ADD CONSTRAINT receivables_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES patient_plans(id);
ALTER TABLE `receivables` ADD CONSTRAINT receivables_renegotiation_id_fkey FOREIGN KEY (renegotiation_id) REFERENCES receivable_renegotiations(id);
ALTER TABLE `recurring_payables` ADD CONSTRAINT recurring_payables_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `recurring_payables` ADD CONSTRAINT recurring_payables_category_id_fkey FOREIGN KEY (category_id) REFERENCES financial_categories(id);
ALTER TABLE `recurring_payables` ADD CONSTRAINT recurring_payables_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `recurring_payables` ADD CONSTRAINT recurring_payables_cost_center_id_fkey FOREIGN KEY (cost_center_id) REFERENCES cost_centers(id);
ALTER TABLE `recurring_payables` ADD CONSTRAINT recurring_payables_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id);
ALTER TABLE `relationship_settings` ADD CONSTRAINT relationship_settings_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `replacement_credits` ADD CONSTRAINT replacement_credits_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `replacement_credits` ADD CONSTRAINT replacement_credits_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `replacement_credits` ADD CONSTRAINT replacement_credits_source_session_id_fkey FOREIGN KEY (source_session_id) REFERENCES group_sessions(id);
ALTER TABLE `replacement_credits` ADD CONSTRAINT replacement_credits_used_session_id_fkey FOREIGN KEY (used_session_id) REFERENCES group_sessions(id);
ALTER TABLE `rooms` ADD CONSTRAINT rooms_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `rooms` ADD CONSTRAINT rooms_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `satisfaction_surveys` ADD CONSTRAINT satisfaction_surveys_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `satisfaction_surveys` ADD CONSTRAINT satisfaction_surveys_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
ALTER TABLE `satisfaction_surveys` ADD CONSTRAINT satisfaction_surveys_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `satisfaction_surveys` ADD CONSTRAINT satisfaction_surveys_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `satisfaction_surveys` ADD CONSTRAINT satisfaction_surveys_source_message_id_fkey FOREIGN KEY (source_message_id) REFERENCES outbound_messages(id);
ALTER TABLE `schedule_blocks` ADD CONSTRAINT schedule_blocks_branch_fk FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `schedule_blocks` ADD CONSTRAINT schedule_blocks_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `schedule_blocks` ADD CONSTRAINT schedule_blocks_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id);
ALTER TABLE `schedule_blocks` ADD CONSTRAINT schedule_blocks_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id);
ALTER TABLE `services` ADD CONSTRAINT services_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `session_movements` ADD CONSTRAINT session_movements_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `session_movements` ADD CONSTRAINT session_movements_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id);
ALTER TABLE `session_movements` ADD CONSTRAINT session_movements_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `session_movements` ADD CONSTRAINT session_movements_group_attendance_id_fkey FOREIGN KEY (group_attendance_id) REFERENCES group_attendance(id);
ALTER TABLE `session_movements` ADD CONSTRAINT session_movements_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES patient_plans(id);
ALTER TABLE `session_movements` ADD CONSTRAINT session_movements_plan_service_fk FOREIGN KEY (clinic_id, plan_id, service_id) REFERENCES patient_plan_services(clinic_id, plan_id, service_id);
ALTER TABLE `stock_movements` ADD CONSTRAINT stock_movements_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES users(id);
ALTER TABLE `stock_movements` ADD CONSTRAINT stock_movements_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `stock_movements` ADD CONSTRAINT stock_movements_patient_tab_id_fkey FOREIGN KEY (patient_tab_id) REFERENCES patient_tabs(id);
ALTER TABLE `stock_movements` ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE `suppliers` ADD CONSTRAINT suppliers_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `therapeutic_goals` ADD CONSTRAINT therapeutic_goals_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id);
ALTER TABLE `therapeutic_goals` ADD CONSTRAINT therapeutic_goals_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `therapeutic_goals` ADD CONSTRAINT therapeutic_goals_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `treatment_closures` ADD CONSTRAINT treatment_closures_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES users(id);
ALTER TABLE `treatment_closures` ADD CONSTRAINT treatment_closures_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `treatment_closures` ADD CONSTRAINT treatment_closures_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `user_branches` ADD CONSTRAINT user_branches_clinic_id_branch_id_fkey FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id) ON DELETE CASCADE;
ALTER TABLE `user_branches` ADD CONSTRAINT user_branches_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE `user_branches` ADD CONSTRAINT user_branches_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE `users` ADD CONSTRAINT users_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `waitlist_entries` ADD CONSTRAINT waitlist_entries_clinic_id_branch_id_fkey FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id);
ALTER TABLE `waitlist_entries` ADD CONSTRAINT waitlist_entries_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE;
ALTER TABLE `waitlist_entries` ADD CONSTRAINT waitlist_entries_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;
ALTER TABLE `waitlist_entries` ADD CONSTRAINT waitlist_entries_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE `waitlist_entries` ADD CONSTRAINT waitlist_entries_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;
ALTER TABLE `whatsapp_campaign_recipients` ADD CONSTRAINT whatsapp_campaign_recipients_clinic_id_campaign_id_fkey FOREIGN KEY (clinic_id, campaign_id) REFERENCES whatsapp_campaigns(clinic_id, id);
ALTER TABLE `whatsapp_campaign_recipients` ADD CONSTRAINT whatsapp_campaign_recipients_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `whatsapp_campaign_recipients` ADD CONSTRAINT whatsapp_campaign_recipients_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES users(id);
ALTER TABLE `whatsapp_campaign_recipients` ADD CONSTRAINT whatsapp_campaign_recipients_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);
ALTER TABLE `whatsapp_campaigns` ADD CONSTRAINT whatsapp_campaigns_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id);
ALTER TABLE `whatsapp_campaigns` ADD CONSTRAINT whatsapp_campaigns_clinic_id_template_id_fkey FOREIGN KEY (clinic_id, template_id) REFERENCES message_templates(clinic_id, id);
ALTER TABLE `whatsapp_campaigns` ADD CONSTRAINT whatsapp_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id);
