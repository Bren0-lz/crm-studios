-- Etiquetas configuráveis dos clientes (T062): cada clínica mantém sua lista de etiquetas, com
-- uma cor própria. O cadastro do cliente só aceita etiquetas da lista; patients.tags continua
-- guardando os NOMES (filtros de exportação e comunicado seguem comparando nomes).
--
-- name_key é a chave de unicidade "sem diferenciar maiúsculas/acentos". A aplicação grava a
-- chave calculada por patientTagKey (@crm/contracts: NFD sem marcas, minúsculas, espaços
-- colapsados). Aqui ela é reproduzida com translate() em vez da extensão unaccent (que nenhuma
-- migração cria e pode não estar disponível no deploy) e em vez de normalize(), que depende da
-- codificação do servidor; a tabela de translate() cobre os acentos do português.
--
-- Nada some: as etiquetas distintas que os clientes já têm viram etiquetas configuradas com a
-- cor padrão. Grafias que só diferem por maiúsculas/acentos viram uma etiqueta só (a mais usada;
-- empate pelo nome) e os clientes passam a usar essa grafia; etiqueta sem correspondência fica
-- como está.
--
-- Roda dentro de uma transação (runMigrations). Todos os passos podem ser repetidos sem erro.

CREATE TABLE IF NOT EXISTS patient_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  name text NOT NULL CHECK (btrim(name) <> ''),
  name_key text NOT NULL,
  color text NOT NULL DEFAULT '#64748b' CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS patient_tags_clinic_key_idx
  ON patient_tags (clinic_id, name_key);

-- 1) Importa as etiquetas distintas dos clientes (sem duplicar ao repetir).
WITH used AS (
  SELECT p.clinic_id, btrim(u.tag) AS name,
    btrim(regexp_replace(lower(translate(btrim(u.tag),
      'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
      'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY')), '\s+', ' ', 'g')) AS name_key,
    count(*) AS uses
  FROM patients p
  CROSS JOIN LATERAL unnest(p.tags) AS u(tag)
  WHERE btrim(u.tag) <> ''
  GROUP BY p.clinic_id, btrim(u.tag)
)
INSERT INTO patient_tags (clinic_id, name, name_key)
SELECT DISTINCT ON (clinic_id, name_key) clinic_id, name, name_key
FROM used
ORDER BY clinic_id, name_key, uses DESC, name
ON CONFLICT (clinic_id, name_key) DO NOTHING;

-- 2) Clientes passam a usar a grafia configurada (sem repetir etiqueta, na ordem original).
UPDATE patients p
SET tags = canon.tags
FROM (
  SELECT p2.id, ARRAY(
    SELECT resolved.name
    FROM (
      SELECT DISTINCT ON (coalesce(pt.name, u.tag)) coalesce(pt.name, u.tag) AS name, u.ord
      FROM unnest(p2.tags) WITH ORDINALITY AS u(tag, ord)
      LEFT JOIN patient_tags pt
        ON pt.clinic_id = p2.clinic_id
       AND pt.name_key = btrim(regexp_replace(lower(translate(btrim(u.tag),
             'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
             'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY')), '\s+', ' ', 'g'))
      ORDER BY coalesce(pt.name, u.tag), u.ord
    ) resolved
    ORDER BY resolved.ord
  ) AS tags
  FROM patients p2
  WHERE cardinality(p2.tags) > 0
) canon
WHERE p.id = canon.id AND p.tags IS DISTINCT FROM canon.tags;
