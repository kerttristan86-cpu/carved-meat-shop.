CREATE TABLE IF NOT EXISTS attachments(id text PRIMARY KEY,document_id text NOT NULL REFERENCES documents(id),name text NOT NULL,mime text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='immutable_documents') THEN
CREATE TRIGGER immutable_documents BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
END IF; END $$;
