-- Endereço da filial em partes (CEP, rua, número, complemento, bairro, cidade, UF e
-- referência) e telefone só com dígitos. O endereço livre da 0086 vira a rua.
ALTER TABLE branches
  ADD COLUMN postal_code text CHECK (postal_code ~ '^\d{5}-\d{3}$'),
  ADD COLUMN street text,
  ADD COLUMN number text,
  ADD COLUMN complement text,
  ADD COLUMN neighborhood text,
  ADD COLUMN city text,
  ADD COLUMN state char(2),
  ADD COLUMN reference text;
UPDATE branches SET street = address WHERE address IS NOT NULL;
UPDATE branches SET phone = nullif(regexp_replace(phone, '\D', '', 'g'), '')
  WHERE phone IS NOT NULL;
ALTER TABLE branches DROP COLUMN address;
