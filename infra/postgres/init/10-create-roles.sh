#!/bin/bash
set -euo pipefail

: "${POSTGRES_USER:?POSTGRES_USER é obrigatório}"
: "${POSTGRES_DB:?POSTGRES_DB é obrigatório}"
: "${ENGINE_DB_USER:?ENGINE_DB_USER é obrigatório}"
: "${ENGINE_DB_PASSWORD:?ENGINE_DB_PASSWORD é obrigatório}"
: "${WORKFLOW_DB_USER:?WORKFLOW_DB_USER é obrigatório}"
: "${WORKFLOW_DB_PASSWORD:?WORKFLOW_DB_PASSWORD é obrigatório}"
: "${MIGRATION_DB_USER:?MIGRATION_DB_USER é obrigatório}"
: "${MIGRATION_DB_PASSWORD:?MIGRATION_DB_PASSWORD é obrigatório}"
: "${KEYCLOAK_DB_NAME:?KEYCLOAK_DB_NAME é obrigatório}"
: "${KEYCLOAK_DB_USER:?KEYCLOAK_DB_USER é obrigatório}"
: "${KEYCLOAK_DB_PASSWORD:?KEYCLOAK_DB_PASSWORD é obrigatório}"

if [[ "$POSTGRES_DB" == "$KEYCLOAK_DB_NAME" ]]; then
  echo "O banco do Keycloak deve ser diferente do banco das aplicações." >&2
  exit 1
fi

if [[ "$POSTGRES_USER" == "$ENGINE_DB_USER" ||
      "$POSTGRES_USER" == "$WORKFLOW_DB_USER" ||
      "$POSTGRES_USER" == "$MIGRATION_DB_USER" ||
      "$POSTGRES_USER" == "$KEYCLOAK_DB_USER" ]]; then
  echo "O usuário administrativo do PostgreSQL deve ser diferente dos usuários das aplicações." >&2
  exit 1
fi

if [[ "$ENGINE_DB_USER" == "$WORKFLOW_DB_USER" ||
      "$ENGINE_DB_USER" == "$MIGRATION_DB_USER" ||
      "$ENGINE_DB_USER" == "$KEYCLOAK_DB_USER" ||
      "$WORKFLOW_DB_USER" == "$MIGRATION_DB_USER" ||
      "$WORKFLOW_DB_USER" == "$KEYCLOAK_DB_USER" ||
      "$MIGRATION_DB_USER" == "$KEYCLOAK_DB_USER" ]]; then
  echo "Cada serviço deve usar um usuário PostgreSQL distinto." >&2
  exit 1
fi

psql \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=app_database="$POSTGRES_DB" \
  --set=engine_user="$ENGINE_DB_USER" \
  --set=engine_password="$ENGINE_DB_PASSWORD" \
  --set=workflow_user="$WORKFLOW_DB_USER" \
  --set=workflow_password="$WORKFLOW_DB_PASSWORD" \
  --set=migration_user="$MIGRATION_DB_USER" \
  --set=migration_password="$MIGRATION_DB_PASSWORD" \
  --set=keycloak_database="$KEYCLOAK_DB_NAME" \
  --set=keycloak_user="$KEYCLOAK_DB_USER" \
  --set=keycloak_password="$KEYCLOAK_DB_PASSWORD" \
  --quiet >/dev/null <<'SQL'
SELECT format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
    :'engine_user', :'engine_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'engine_user')
\gexec

SELECT format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
    :'workflow_user', :'workflow_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'workflow_user')
\gexec

SELECT format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
    :'migration_user', :'migration_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'migration_user')
\gexec

SELECT format(
    'CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD %L',
    :'keycloak_user', :'keycloak_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'keycloak_user')
\gexec

SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'app_database')
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'app_database', :'engine_user')
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'app_database', :'workflow_user')
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'app_database', :'migration_user')
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'keycloak_database', :'keycloak_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'keycloak_database')
\gexec

SELECT format('ALTER DATABASE %I SET timezone TO %L', :'app_database', 'UTC')
\gexec

SELECT format('ALTER DATABASE %I SET timezone TO %L', :'keycloak_database', 'UTC')
\gexec

SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'keycloak_database')
\gexec

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'keycloak_database', :'keycloak_user')
\gexec

SELECT format('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
\gexec

SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'migration_user')
\gexec
SQL
