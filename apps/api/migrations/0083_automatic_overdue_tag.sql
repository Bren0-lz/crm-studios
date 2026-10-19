-- "Pagamento atrasado" vira etiqueta automática (QC7): a API acrescenta a etiqueta na leitura
-- para clientes com parcela vencida e em aberto. A cópia manual sai dos clientes e da lista de
-- etiquetas configuradas. A comparação usa a mesma chave de 0044 (sem maiúsculas/acentos).
-- Pode ser repetida sem erro.

UPDATE patients p
SET tags = ARRAY(
  SELECT u.tag
  FROM unnest(p.tags) WITH ORDINALITY AS u(tag, ord)
  WHERE btrim(regexp_replace(lower(translate(btrim(u.tag),
          'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
          'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY')), '\s+', ' ', 'g'))
        <> 'pagamento atrasado'
  ORDER BY u.ord
)
WHERE EXISTS (
  SELECT 1 FROM unnest(p.tags) AS u(tag)
  WHERE btrim(regexp_replace(lower(translate(btrim(u.tag),
          'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
          'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY')), '\s+', ' ', 'g'))
        = 'pagamento atrasado'
);

DELETE FROM patient_tags WHERE name_key = 'pagamento atrasado';
