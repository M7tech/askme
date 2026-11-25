#!/bin/sh
set -eu
backup=${1:?Provide a PostgreSQL custom-format backup}
# Restore into a new database, leaving the live database intact.
target=${2:?Provide a new database name}
case "$target" in ''|*[!a-z0-9_]*) exit 2;; esac
docker compose exec -T db createdb -U chorus "$target"
docker compose exec -T db pg_restore --exit-on-error --single-transaction --no-owner -U chorus -d "$target" < "$backup"
