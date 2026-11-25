# Coolify deployment

The source repository is https://github.com/M7tech/askme.git, branch main. The intended public URL is https://ask.m7tech.info. Use https://coolify.m7tech.info to manage the deployment. Route this domain to the frontend service on port 8080 and set PUBLIC_ORIGIN to the public URL exactly. Point the subdomain's DNS A record at the selected Coolify server's public IP before requesting its HTTPS certificate.

For Google Workspace mail, leave SMTP_URL empty and set SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER to the sender's complete email address, and SMTP_PASSWORD to its Google app password in Coolify's secret environment settings. Set MAIL_FROM to the desired sender. The private local .env file is excluded from Git and Docker build context.

1. Create a Docker Compose resource from this repository. Use the supplied docker-compose.yml and repository root as the build context.
2. In Coolify, set PUBLIC_ORIGIN to the full external HTTPS origin without a trailing slash. Set POSTGRES_PASSWORD to a new URL-safe random secret, for example the output of `openssl rand -hex 32`. Store these values in Coolify's environment settings.
3. Assign the HTTPS domain to **frontend, internal port 8080**. Keep the API, database, Redis and worker on the private Compose network. The frontend forwards HTTP and WebSocket upgrades to the API. Configure the external proxy to preserve Host and Origin and support HTTP/1.1 upgrade.
4. Set SMTP_URL and MAIL_FROM for account verification, lecturer invitations and password resets. URL-encode credentials in connection strings. Configure the SMTP relay and verified sender with your mail provider.
5. Optional AI requires AI_BASE_URL (an OpenAI-compatible base URL including its API version), AI_MODEL and, when required, AI_KEY. A local compatible provider can run on the private network. Only text explicitly submitted in the AI draft form is sent.
6. Deploy the resource. Verify the public /health endpoint, create a workspace, launch a session and join from a separate device. Verify that /live/{pin} upgrades to a WebSocket, presenter changes reach participants, and a saved report survives redeployment.

## Initialization and maintenance

The API and worker apply the idempotent SQL migration in a transaction. An advisory lock serializes migrations on PostgreSQL. To apply the current schema independently after the database is healthy:

```sh
docker compose run --rm api node --input-type=module -e "await import('./server/db.mjs'); process.exit(0)"
```

Register your operator account first. Promote the known existing account from a trusted server console:

```sh
docker compose exec api node server/promote.mjs operator@example.org
```

Choose Settings → Platform administration to manage registration, platform name, image processing and retention. The worker sweeps expired credentials, photos older than the retention period, and sessions whose expiry is older than the retention period. Cascading deletes remove associated records. The PostgreSQL volume contains the authoritative data. Keep volume identities stable between deployments. The Redis volume backs rate counters and instance coordination. The application currently uses database storage for media.

## Backup and restoration

Run the following commands in the deployment directory on the Compose host. The backup script creates a compressed PostgreSQL custom-format archive and verifies its table of contents. Store it encrypted off-host. Keep environment secrets separately in an encrypted secret store.

```sh
sh deploy/backup.sh /private-backups/chorusroom-2026-11-25.dump
sh deploy/restore.sh /private-backups/chorusroom-2026-11-25.dump chorus_restore_check
```

Restore always creates a fresh database and requires an unused database name. For a recovery drill, point a separate staging API and worker at the restored database, then verify login, question snapshots, released results and private photo retrieval. For cutover, stop application writes, retain the previous database, update DATABASE_URL for both API and worker to the verified database, redeploy, and run the checks again. Backups may retain deleted records until the backup retention period expires.

## Deployment verification status

The development server, browser tests and single-host benchmark were exercised on Windows. This workspace has no Docker engine or Coolify endpoint. Container startup, proxy/TLS behavior, cross-instance Redis messaging and PostgreSQL restore remain unverified on the deployment target.

