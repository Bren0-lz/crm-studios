-- Eventos do comercial (aulão, feira, palestra). O participante é um lead do CRM ligado ao
-- evento (`leads.event_id`): contato, avaliação e conversão seguem o fluxo do funil.
-- Sem filial = evento da rede (aparece em todas as filiais).
CREATE TABLE `events` (
  `id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT (UUID()),
  `clinic_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `branch_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `name` VARCHAR(191) NOT NULL,
  `location` LONGTEXT,
  `attendee_count` INT,
  `starts_at` DATETIME(6) NOT NULL,
  `notes` LONGTEXT,
  `created_by` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY events_clinic_starts_idx (`clinic_id`, `starts_at`),
  KEY events_branch_idx (`clinic_id`, `branch_id`),
  CONSTRAINT events_name_check CHECK (((CHAR_LENGTH(name) >= 2) AND (CHAR_LENGTH(name) <= 72))),
  CONSTRAINT events_attendee_count_check CHECK (((attendee_count IS NULL) OR ((attendee_count >= 0) AND (attendee_count <= 100000)))),
  CONSTRAINT events_clinic_id_fkey FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  CONSTRAINT events_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES branches(id),
  CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id)
);

ALTER TABLE `leads`
  ADD COLUMN `event_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD KEY leads_event_idx (`clinic_id`, `event_id`),
  ADD CONSTRAINT leads_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;

-- Quem já usa o CRM comercial passa a ver os eventos; quem cadastra lead, a cadastrá-los.
-- O administrador pode retirar depois em Administração > Usuários.
UPDATE `users` SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'events.view')
WHERE JSON_CONTAINS(permissions, '"crm.view"')
  AND NOT JSON_CONTAINS(permissions, '"events.view"');
UPDATE `users` SET permissions = JSON_ARRAY_APPEND(permissions, '$', 'events.manage')
WHERE JSON_CONTAINS(permissions, '"crm.create"')
  AND JSON_CONTAINS(permissions, '"events.view"')
  AND NOT JSON_CONTAINS(permissions, '"events.manage"');
