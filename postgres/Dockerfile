FROM postgres:17-alpine

COPY postgres/auth-compat.sql /docker-entrypoint-initdb.d/000-auth-compat.sql
COPY db/migrations /workspace/db/migrations
COPY db/seed /workspace/db/seed
COPY docker/postgres-init/001-run-migrations.sh /docker-entrypoint-initdb.d/001-run-migrations.sh

RUN chmod 755 /docker-entrypoint-initdb.d/001-run-migrations.sh
