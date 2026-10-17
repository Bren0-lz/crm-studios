-- Serviço pode ficar restrito a alguns profissionais e salas; lista vazia = todos (U10).
ALTER TABLE services
  ADD COLUMN professional_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN room_ids uuid[] NOT NULL DEFAULT '{}';
