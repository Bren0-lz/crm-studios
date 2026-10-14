ALTER TABLE clinical_attachments DROP CONSTRAINT clinical_attachments_mime_type_check;
ALTER TABLE clinical_attachments DROP CONSTRAINT clinical_attachments_size_in_bytes_check;
ALTER TABLE clinical_attachments ADD COLUMN duration_in_seconds integer;
ALTER TABLE clinical_attachments ADD CONSTRAINT clinical_attachments_mime_type_check CHECK (mime_type IN ('application/pdf','image/png','image/jpeg','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','audio/webm','audio/ogg','audio/mp4'));
ALTER TABLE clinical_attachments ADD CONSTRAINT clinical_attachments_size_in_bytes_check CHECK (size_in_bytes>0 AND size_in_bytes<=CASE WHEN mime_type LIKE 'audio/%' THEN 16777216 ELSE 5242880 END);
ALTER TABLE clinical_attachments ADD CONSTRAINT clinical_attachments_duration_check CHECK (mime_type NOT LIKE 'audio/%' OR (duration_in_seconds IS NOT NULL AND duration_in_seconds BETWEEN 1 AND 900));
