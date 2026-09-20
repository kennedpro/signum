-- SIGNUM · Esquema PostgreSQL compatible con Neon
-- Uso manual: psql "$DATABASE_URL" -f scripts/schema.sql


CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  entity_type text NOT NULL DEFAULT 'publica',
  nit text,
  sigla text,
  city text DEFAULT 'Bogotá D.C.',
  address text,
  phone text,
  website text,
  logo_url text,
  logo_variant text NOT NULL DEFAULT 'institucional',
  primary_color text NOT NULL DEFAULT '#0e7490',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sequences (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id),
  scope text NOT NULL,
  value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS numbering_ledger (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id),
  scope text NOT NULL,
  kind text NOT NULL,
  value integer NOT NULL,
  code text NOT NULL,
  document_id text,
  document_title text,
  doc_type text,
  actor_id text,
  actor_name text NOT NULL,
  actor_email text,
  ip text,
  user_agent text,
  ntp_iso text,
  ntp_source text,
  hash text NOT NULL,
  prev_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);


CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  username text UNIQUE,
  password_hash text,
  password_salt text,
  active text NOT NULL DEFAULT 'si',
  last_login_at timestamptz,
  role text NOT NULL DEFAULT 'Miembro',
  system_role text NOT NULL DEFAULT 'usuario',
  department text NOT NULL DEFAULT 'Dirección',
  color text NOT NULL DEFAULT '#22d3ee',
  photo_url text,
  grado text,
  cargo text,
  cedula text,
  dependencia text,
  unidad text,
  area text,
  sucursal text,
  sign_password_hash text,
  sign_password_salt text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id text PRIMARY KEY,
  organization_id text REFERENCES organizations(id),
  doc_type text NOT NULL DEFAULT 'memorando',
  doc_number text,
  title text NOT NULL,
  subject text,
  city text,
  content text NOT NULL DEFAULT '',
  apa_enabled boolean NOT NULL DEFAULT false,
  apa_authors text,
  apa_institution text,
  apa_course text,
  apa_instructor text,
  status text NOT NULL DEFAULT 'borrador',
  config_locked boolean NOT NULL DEFAULT false,
  owner_id text REFERENCES users(id),
  sender_id text REFERENCES users(id),
  owner_signed_at timestamptz,
  hash_pre text,
  hash_post text,
  seal_hash text,
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipients (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'signer',
  slot integer,
  slot_label text,
  user_id text REFERENCES users(id),
  name text NOT NULL,
  email text NOT NULL,
  department text,
  entity_type text NOT NULL DEFAULT 'publica',
  grado text,
  cargo text,
  cedula text,
  dependencia text,
  unidad text,
  empresa text,
  nit text,
  area text,
  sucursal text,
  status text NOT NULL DEFAULT 'pendiente',
  token text NOT NULL UNIQUE,
  sign_password_hash text,
  sign_password_salt text,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signatures (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  recipient_id text REFERENCES recipients(id) ON DELETE SET NULL,
  slot integer NOT NULL DEFAULT 1,
  entity_type text NOT NULL DEFAULT 'publica',
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  signer_grado text,
  signer_cargo text,
  signer_cedula text,
  signer_dependencia text,
  signer_unidad text,
  signer_empresa text,
  signer_nit text,
  signer_area text,
  signer_sucursal text,
  logo_variant text NOT NULL DEFAULT 'institucional',
  logo_url text,
  signature_data text NOT NULL,
  method text NOT NULL DEFAULT 'dibujada',
  hash_pre text,
  hash_post text,
  hash text NOT NULL,
  prev_hash text,
  ntp_iso text,
  ntp_source text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  document_id text REFERENCES documents(id) ON DELETE CASCADE,
  action text NOT NULL,
  label text NOT NULL,
  actor_name text NOT NULL,
  actor_email text,
  detail text,
  ip text,
  hash text,
  prev_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS security_logs (
  id text PRIMARY KEY,
  document_id text REFERENCES documents(id) ON DELETE CASCADE,
  recipient_id text,
  event text NOT NULL,
  result text NOT NULL DEFAULT 'ok',
  actor_name text NOT NULL,
  actor_email text,
  detail text,
  ip text,
  user_agent text,
  ntp_iso text,
  ntp_source text,
  hash_pre text,
  hash_post text,
  hash text,
  prev_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- ACTUALIZACIÓN AUTOMÁTICA DE INSTALACIONES ANTERIORES
-- CREATE TABLE IF NOT EXISTS no agrega columnas a tablas ya existentes.
-- Estas operaciones son idempotentes y completan cualquier esquema antiguo.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'publica';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS nit text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sigla text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS city text DEFAULT 'Bogotá D.C.';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_variant text NOT NULL DEFAULT 'institucional';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#0e7490';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id text REFERENCES organizations(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_salt text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS active text NOT NULL DEFAULT 'si';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'Miembro';
ALTER TABLE users ADD COLUMN IF NOT EXISTS system_role text NOT NULL DEFAULT 'usuario';
ALTER TABLE users ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT 'Dirección';
ALTER TABLE users ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#22d3ee';
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS grado text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cargo text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cedula text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dependencia text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS unidad text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS area text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sucursal text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sign_password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sign_password_salt text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE documents ADD COLUMN IF NOT EXISTS organization_id text REFERENCES organizations(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'memorando';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_number text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS draft_code text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS radicado_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS apa_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS apa_authors text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS apa_institution text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS apa_course text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS apa_instructor text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS page_setup text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS return_note text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS config_locked boolean NOT NULL DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sender_id text REFERENCES users(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS owner_signed_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS hash_pre text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS hash_post text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS seal_hash text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE recipients ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'signer';
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS slot integer;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS slot_label text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS user_id text REFERENCES users(id);
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'publica';
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS grado text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS cargo text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS cedula text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS dependencia text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS unidad text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS empresa text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS nit text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS area text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS sucursal text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pendiente';
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS sign_password_hash text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS sign_password_salt text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS viewed_at timestamptz;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS signed_at timestamptz;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS external boolean NOT NULL DEFAULT false;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS company_name text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS otp_hash text;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS otp_expires_at timestamptz;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS otp_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS otp_verified_at timestamptz;

ALTER TABLE users ADD COLUMN IF NOT EXISTS signing_public_key text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signing_private_key_enc text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signing_key_fingerprint text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signing_key_created_at timestamptz;
-- Obliga a definir clave propia en el próximo ingreso (cuentas nuevas o con clave restablecida).
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;
-- Empresa del evento de seguridad (eventos sin documento: altas, restablecimientos de clave…).
ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS organization_id text REFERENCES organizations(id);
CREATE INDEX IF NOT EXISTS security_org_idx ON security_logs(organization_id);

ALTER TABLE signatures ADD COLUMN IF NOT EXISTS consent_text text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS consent_hash text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS otp_verified_at timestamptz;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS auth_factors text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS canonical_payload text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signature_alg text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signature_value text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_public_key text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_key_fingerprint text;

ALTER TABLE signatures ADD COLUMN IF NOT EXISTS slot integer NOT NULL DEFAULT 1;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS entity_type text NOT NULL DEFAULT 'publica';
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_grado text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_cargo text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_cedula text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_dependencia text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_unidad text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_empresa text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_nit text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_area text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS signer_sucursal text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS logo_variant text NOT NULL DEFAULT 'institucional';
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT 'dibujada';
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS hash_pre text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS hash_post text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS prev_hash text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS ntp_iso text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS ntp_source text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS actor_email text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS detail text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS hash text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS prev_hash text;
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS recipient_id text;
ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS result text NOT NULL DEFAULT 'ok';
ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS actor_email text;
ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS detail text;
ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS ntp_iso text;
ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS ntp_source text;
ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS hash_pre text;
ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS hash_post text;
ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS hash text;
ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS prev_hash text;
ALTER TABLE security_logs ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- ═══════════════════════════════════════════════════════════════
-- ÍNDICES (al final: todas las columnas ya existen)
-- ═══════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS sequences_org_scope_idx ON sequences(organization_id, scope);
CREATE UNIQUE INDEX IF NOT EXISTS ledger_org_scope_value_idx ON numbering_ledger(organization_id, scope, value);
CREATE INDEX IF NOT EXISTS ledger_document_idx ON numbering_ledger(document_id);
CREATE INDEX IF NOT EXISTS ledger_org_idx ON numbering_ledger(organization_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status);
CREATE INDEX IF NOT EXISTS documents_type_idx ON documents(doc_type);
CREATE INDEX IF NOT EXISTS recipients_document_idx ON recipients(document_id);
CREATE INDEX IF NOT EXISTS recipients_token_idx ON recipients(token);
CREATE INDEX IF NOT EXISTS recipients_email_idx ON recipients(email);
CREATE INDEX IF NOT EXISTS signatures_document_idx ON signatures(document_id);
CREATE INDEX IF NOT EXISTS audit_document_idx ON audit_events(document_id);
CREATE INDEX IF NOT EXISTS security_document_idx ON security_logs(document_id);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users(username) WHERE username IS NOT NULL;

-- Protección a nivel de motor: el libro radicador es de solo inserción.
-- Ni siquiera el dueño de la aplicación puede modificar o borrar asientos.
CREATE OR REPLACE FUNCTION signum_ledger_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El libro de radicación es inmutable: no se permite % en numbering_ledger', TG_OP;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS numbering_ledger_no_update ON numbering_ledger;
CREATE TRIGGER numbering_ledger_no_update BEFORE UPDATE OR DELETE ON numbering_ledger
  FOR EACH ROW EXECUTE FUNCTION signum_ledger_immutable();

CREATE TABLE IF NOT EXISTS document_messages (
  id text PRIMARY KEY,
  document_id text NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  from_user_id text,
  from_name text NOT NULL,
  from_email text,
  to_name text,
  to_email text,
  kind text NOT NULL DEFAULT 'comentario',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_messages_doc_idx ON document_messages (document_id, created_at);
