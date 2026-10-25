-- Nomes das abas do menu lateral renomeados pelo admin (vale para toda a rede).
-- Abas sem linha usam o nome padrão definido nos contratos.
CREATE TABLE nav_tab_labels (
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  tab text NOT NULL CHECK (tab IN (
    'dashboard','agenda','groups','patients','plans','clinical','crm','relationship',
    'waitlist','communications','contracts','sales','finance','reports','history',
    'settings','profile'
  )),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 30),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, tab)
);
