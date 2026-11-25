#!/bin/sh
set -eu
umask 077
target=${1:?Provide a new backup filename}
test ! -e "$target"
temp=$(mktemp "${target}.XXXXXX")
trap 'rm -f "$temp"' EXIT
docker compose exec -T db pg_dump -U chorus -d chorus -Fc > "$temp"
docker compose exec -T db pg_restore -l < "$temp" >/dev/null
ln "$temp" "$target"
