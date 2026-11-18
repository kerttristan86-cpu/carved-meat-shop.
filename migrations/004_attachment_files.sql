CREATE TABLE IF NOT EXISTS attachment_files(id text PRIMARY KEY REFERENCES attachments(id), data bytea NOT NULL);
