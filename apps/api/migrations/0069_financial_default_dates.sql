ALTER TABLE financial_date_corrections ADD COLUMN revision bigint GENERATED ALWAYS AS IDENTITY;
CREATE FUNCTION crm_assign_financial_default_dates() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE clinic_timezone text;
BEGIN
  SELECT timezone INTO clinic_timezone FROM clinics WHERE id=NEW.clinic_id;
  NEW.posted_on := coalesce(NEW.posted_on,(NEW.created_at AT TIME ZONE clinic_timezone)::date);
  IF TG_TABLE_NAME='receivables' THEN
    NEW.competence := coalesce(NEW.competence,to_char(NEW.created_at AT TIME ZONE clinic_timezone,'YYYY-MM'));
  ELSE
    NEW.dre_competence := coalesce(NEW.dre_competence,NEW.competence,to_char(NEW.created_at AT TIME ZONE clinic_timezone,'YYYY-MM'));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER receivables_default_dates BEFORE INSERT ON receivables FOR EACH ROW EXECUTE FUNCTION crm_assign_financial_default_dates();
CREATE TRIGGER payables_default_dates BEFORE INSERT ON payables FOR EACH ROW EXECUTE FUNCTION crm_assign_financial_default_dates();
