CREATE UNIQUE INDEX professionals_clinic_identity ON professionals(clinic_id, id);
CREATE UNIQUE INDEX users_clinic_identity ON users(clinic_id, id);

CREATE TABLE agenda_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL,
  professional_id uuid,
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 300),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  background_color text NOT NULL CHECK (background_color IN
    ('#64748b','#276749','#0d9488','#2563eb','#7c3aed','#db2777','#dc2626','#ea580c','#facc15')),
  series_id uuid,
  author_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (clinic_id, branch_id) REFERENCES branches(clinic_id, id),
  FOREIGN KEY (clinic_id, professional_id) REFERENCES professionals(clinic_id, id),
  FOREIGN KEY (clinic_id, author_user_id) REFERENCES users(clinic_id, id)
);
CREATE TRIGGER agenda_notes_default_branch BEFORE INSERT ON agenda_notes
  FOR EACH ROW EXECUTE FUNCTION fill_default_branch();
CREATE INDEX agenda_notes_range_idx ON agenda_notes(clinic_id, branch_id, starts_at);
CREATE INDEX agenda_notes_series_idx ON agenda_notes(clinic_id, series_id, starts_at);

-- Quem já agenda recebe a nova operação; a restrição ao profissional é aplicada pela API.
UPDATE users SET permissions = array_append(permissions, 'agenda.notes')
WHERE permissions @> ARRAY['agenda.view','agenda.create']::text[]
  AND NOT permissions @> ARRAY['agenda.notes']::text[];
