# Container images and releases

[Release images](../.github/workflows/release-images.yml) follows Kouo's host-build → Docker packaging → GHCR flow,
without its sandbox, OpenSandbox, preload, or custom proxy images. It publishes two **Linux/amd64** images:

- `ghcr.io/<owner>/<repository>-api`: Hono API, bundled operator CLI, and Postgres migrations.
- `ghcr.io/<owner>/<repository>-web`: Next.js standalone server, dependencies, and static assets.

Names are derived from `github.repository` and lowercased. There is no hardcoded organization/product prefix.
The API and web images run as the unprivileged `node` user on Node 24 (the API needs native `crypto.argon2`).

## GitHub setup

1. Enable GitHub Actions and allow the workflow's `GITHUB_TOKEN` to write packages. No personal access token is needed.
   If a GHCR package with the same name already exists, grant this repository Actions access to it.
2. Push to `main`, push a version tag, or use **Actions → Release images → Run workflow**.

No deployment-specific GitHub variables or secrets are needed to build the images. Configure the public API URL
when **running the web container**, not in Actions.

| Trigger | Image tags (for each image) |
| --- | --- |
| Push to `main` | `edge`, `sha-<short>` |
| Tag `v1.2.3` | `1.2.3`, `1.2`, `latest`, `sha-<short>` |
| Prerelease tag `v1.2.3-rc.1` | `1.2.3-rc.1`, `sha-<short>`; does not replace `latest` |
| Manual run | SHA tag plus tags appropriate for the selected ref |

Use valid semver version tags; the workflow listens for `v*` but non-semver tags only get a SHA tag.
GHCR packages may start private; set visibility/access explicitly before pulling them from deployment hosts.
For private images, authenticate the deployment host with a suitable read-packages credential.

Builds use the frozen pnpm lockfile and BuildKit's per-image GitHub Actions cache. The API's only external
production dependency (`thread-stream`) has a separate frozen npm runtime lockfile alongside its Dockerfile;
all other API/CLI dependencies are bundled by tsup. Update that runtime manifest and lock together when changing
bundler externals or the workspace's `thread-stream` version.

**Release is independent of CI**, like the source workflow: it does not wait for lint/tests to pass. Protect `main`,
require CI before merging, and create release tags only from reviewed, green commits. Publication of the two images
is not atomic; verify both jobs succeeded before rolling out matching SHA tags. Pin image digests for immutable deployments.

## Web configuration is runtime

Like Kouo, the running Next server reads `NEXT_PUBLIC_RPC_URL` dynamically and injects only whitelisted public config
into the page before hydration. The root layout renders at request time, so build-time values are not frozen into HTML.
The same published image works across environments without rebuilding:

```sh
docker run --rm -p 127.0.0.1:3000:3000 \
  -e NEXT_PUBLIC_RPC_URL=https://api.example.com/rpc app-web
```

Use the browser-facing HTTP(S) API `/rpc` URL, **not** a Docker service name or credentialed URL. It defaults to
`http://localhost:3001/rpc` for local development. Public config is cached for the server process/browser document;
restart containers and reload the page after changing it. Only `NEXT_PUBLIC_RPC_URL` is exposed, never database,
Redis, or storage secrets. The release build uses `.env.example` placeholders, not deployment secrets.

Both Dockerfiles package **prebuilt** artifacts; they do not build TypeScript or Next inside Docker. The web output
contains native dependencies from the build host, which is why the workflow only publishes `linux/amd64` from Linux runners.
Do not label an image arm64 without rebuilding the artifacts on that platform.

## Local build and smoke test

On Linux/amd64, with Node ≥24.7 and pnpm 12:

```sh
pnpm install --frozen-lockfile
# Create .env from .env.example only if you don't already have one.
pnpm exec turbo run build --filter=api --filter=cli --filter=web...
docker build -f deployment/images/api.Dockerfile -t app-api .
docker build -f deployment/images/web.Dockerfile -t app-web .
```

`.dockerignore` allows only runtime artifacts/manifests and excludes env files, source maps, host install trees,
and local data. It deliberately keeps Next standalone's **nested** `node_modules`.
There is currently no `apps/web/public` directory. If you add one, also allow it in `.dockerignore` and copy it into
`/app/web/apps/web/public` in the web Dockerfile.

The existing [`docker/compose.yaml`](docker/compose.yaml) is **development infrastructure only**, not a production stack.
For a local smoke test against its Postgres/Redis, use a private, untracked env file with container-reachable addresses
(`localhost` inside a container means that container itself). On Linux, for example:

```env
# /private/path/app-local.env — development values only
POSTGRES_URL=postgres://app:app@host.docker.internal:6781/app
REDIS_URL=redis://host.docker.internal:6780
CORS_ORIGINS=http://localhost:3000
SESSION_COOKIE_SECURE=false
```

```sh
pnpm infra:up
# Migrate once before starting API replicas. CLI commands override the default node script.
docker run --rm --add-host=host.docker.internal:host-gateway \
  --env-file /private/path/app-local.env app-api dist/cli.js db migrate

docker run --rm --name app-api --add-host=host.docker.internal:host-gateway \
  --env-file /private/path/app-local.env -p 127.0.0.1:3001:3001 app-api
# In another terminal:
docker run --rm --name app-web -p 127.0.0.1:3000:3000 \
  -e NEXT_PUBLIC_RPC_URL=http://localhost:3001/rpc app-web
curl --fail http://localhost:3001/health
# Visit http://localhost:3000, create an account, then provision an admin:
docker exec app-api node dist/cli.js user role you@example.com admin
```

Host-gateway access requires the infrastructure ports to be reachable from Docker, not bound only to host loopback.
For a deployment, prefer a private Docker network and service DNS names over host-gateway routing.
`PORT` changes either server's **runtime** listen port (default API 3001, web 3000); adjust port mappings to match.

## Deployment responsibilities

- Supply API secrets at **runtime**, use HTTPS, set `SESSION_COOKIE_SECURE=true`, and configure exact `CORS_ORIGINS`.
  The UI and API must be same-site for `SameSite=Lax` cookies; see [security rules](../README.md#deployment-rules).
- Provision Postgres/Redis and wait for them to be ready before migration/API startup. Images do not run migrations
  automatically, wait for dependencies, or provision TLS/proxies. Review the outbox migration's stop-old-process warning.
- Redis is not disposable cache when it carries BullMQ work: configure persistence, capacity, and `noeviction`.
- Prefer MinIO/S3-compatible storage for multiple replicas. The API's local driver defaults to `/app/storage`;
  without a persistent mount it is ephemeral. A bind mount must be writable by the container's node user (uid 1000).
- Add monitoring, restart/readiness policies, backups, graceful draining, and a rollout/rollback process for your platform.
  A container image is not a complete production deployment platform.
