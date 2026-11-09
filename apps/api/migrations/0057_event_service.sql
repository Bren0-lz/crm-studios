-- Serviço do evento (aulão de Pilates, feira de depilação…), opcional. Apagar o serviço deixa
-- o evento sem serviço; a lista de eventos filtra por ele.
ALTER TABLE `events`
  ADD COLUMN `service_id` VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD KEY events_service_idx (`clinic_id`, `service_id`),
  ADD CONSTRAINT events_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;
