# Persistent test deployment

Prepared 24 October 2026. Production bundle/typechecks and local Node runtime are verified. Docker Compose configuration syntax is verified. Image build, container startup, public HTTPS and remote persistence are NOT_TESTED because Docker Desktop's Linux engine is stopped and no hostname/host was supplied.

Dockerfile uses the official Node 24.22.1 bookworm-slim image (tag verified against https://hub.docker.com/_/node), a build stage, production-only dependencies and a non-root runtime. Build context excludes .local, .env files, Git, evaluation labels and local node_modules. No seed passwords are baked into the image. Native Node SQLite is retained; use one persistent host/volume, not an ephemeral filesystem or shared network SQLite.

The optional BIND_HOST defaults to 127.0.0.1. Container binding 0.0.0.0 requires an explicit HTTPS APP_ORIGIN. Compose exposes backend port 3000 only to its private network, and Caddy publishes ports 80/443 and proxies the same origin. Do not publish the backend or executor directly. Caddy setup follows https://caddyserver.com/docs/caddyfile/directives/reverse_proxy . Its major-version image should be digest-pinned after the actual deployment image is verified.

On a Docker host with DNS pointing to it, set PROOFIT_DOMAIN to the public hostname (no scheme/path), then:

~~~powershell
docker compose -f deploy/compose.yaml config --quiet
docker compose -f deploy/compose.yaml build
# Fresh empty persistent volume only; seed refuses overwrites:
docker compose -f deploy/compose.yaml run --rm backend node scripts/seed.ts
docker compose -f deploy/compose.yaml up -d
~~~

The named proofit_state volume persists /app/.local, including SQLite and private seed credentials. Retrieve credentials privately from the volume; never print them into shared logs or include them in screenshots. Seed accounts/resources are synthetic and do not establish live provider eligibility. Setup is for a test demonstration; private passwords must not be shared as public demo credentials.

This package starts the default authenticated console/API with provider writes disabled. Do not add all secrets to one Compose environment. The installed model worker and isolated executor must have separate credentials and a private authenticated service connection; see MANUAL_SETUP.md.

Before public use, verify HTTPS cookies/origin/CSRF, account isolation, read-only replay/export, source/credential exclusion, and persistence after container restart. Current login limiting is per process/IP and a single proxy may share that bucket: supply a trusted edge rate limit before a multi-user deployment and never trust arbitrary forwarded IP headers.

Backup while services are stopped: preserve the complete proofit_state volume (database plus any WAL/SHM files and private credentials) as an access-controlled encrypted backup. Restore to an isolated volume with the same application/migration version, start read-only verification first, then reconcile existing uncertain operations using their original IDs. Do not copy only the SQLite main file while writers are active. Migration hashes remain enforced; never modify an applied migration.
