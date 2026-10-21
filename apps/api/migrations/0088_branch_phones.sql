-- Vários telefones por filial: lista de {number (só dígitos), label (opcional)}.
-- O telefone único da 0087 vira o primeiro da lista.
ALTER TABLE branches
  ADD COLUMN phones jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(phones) = 'array');
UPDATE branches SET phones = jsonb_build_array(jsonb_build_object('number', phone))
  WHERE phone IS NOT NULL;
ALTER TABLE branches DROP COLUMN phone;
