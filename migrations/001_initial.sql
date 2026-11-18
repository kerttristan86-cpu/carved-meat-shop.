CREATE TABLE IF NOT EXISTS products(id text PRIMARY KEY, code text UNIQUE NOT NULL, name text NOT NULL, category text NOT NULL, unit text NOT NULL CHECK(unit IN ('kg','service')), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS parties(id text PRIMARY KEY, name text NOT NULL, kind text NOT NULL CHECK(kind IN ('customer','supplier')), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS locations(id text PRIMARY KEY, name text NOT NULL UNIQUE);
INSERT INTO locations VALUES ('storage','Main storage'),('freezer','Retail freezer') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS stock(product_id text REFERENCES products(id), location_id text REFERENCES locations(id), quantity bigint NOT NULL CHECK(quantity>=0), PRIMARY KEY(product_id,location_id));
CREATE TABLE IF NOT EXISTS valuation(product_id text PRIMARY KEY REFERENCES products(id), quantity bigint NOT NULL CHECK(quantity>=0), value bigint NOT NULL CHECK(value>=0));
CREATE TABLE IF NOT EXISTS documents(id text PRIMARY KEY, number bigint GENERATED ALWAYS AS IDENTITY UNIQUE, kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), party_id text REFERENCES parties(id), data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS movements(id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), product_id text REFERENCES products(id), location_id text REFERENCES locations(id), quantity bigint NOT NULL, value bigint NOT NULL, kind text NOT NULL, document_id text REFERENCES documents(id), reason text NOT NULL, actor text NOT NULL);
CREATE TABLE IF NOT EXISTS journals(id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), document_id text REFERENCES documents(id), memo text NOT NULL, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), actor text NOT NULL, action text NOT NULL, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS requests(key text PRIMARY KEY, fingerprint text NOT NULL, result jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS settings(id text PRIMARY KEY, data jsonb NOT NULL);
INSERT INTO settings VALUES ('shop','{"name":"CARVED Meat Shop","address":"","contact":"","heading":"Sales invoice","footer":"Thank you for shopping with CARVED.","prefix":"CV","margin":3,"density":11,"printer":"browser","accountantReviewed":false}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS "user" (id text PRIMARY KEY,name text NOT NULL,email text UNIQUE NOT NULL,"emailVerified" boolean NOT NULL DEFAULT false,image text,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS session (id text PRIMARY KEY,"expiresAt" timestamptz NOT NULL,token text UNIQUE NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now(),"ipAddress" text,"userAgent" text,"userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS account (id text PRIMARY KEY,"accountId" text NOT NULL,"providerId" text NOT NULL,"userId" text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,"accessToken" text,"refreshToken" text,"idToken" text,"accessTokenExpiresAt" timestamptz,"refreshTokenExpiresAt" timestamptz,scope text,password text,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS verification (id text PRIMARY KEY,identifier text NOT NULL,value text NOT NULL,"expiresAt" timestamptz NOT NULL,"createdAt" timestamptz NOT NULL DEFAULT now(),"updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION forbid_history_changes() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Posted history is immutable; post a reversal instead'; END $$;
DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='immutable_movements') THEN
CREATE TRIGGER immutable_movements BEFORE UPDATE OR DELETE ON movements FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
CREATE TRIGGER immutable_journals BEFORE UPDATE OR DELETE ON journals FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
END IF; END $$;
