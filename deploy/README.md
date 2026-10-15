# Free hosting plan

Status: deployment files prepared; **no public instance provisioned**.

## Recommended route

An Oracle Cloud **Always Free eligible** Linux VM can run the app, FalkorDB and
controlled Go services in Docker. Hosted open-weight inference avoids running
an LLM on the VM's CPU. The current template selects Groq Qwen; that adapter
still needs live validation with the team's private credential.

As checked October 15, 2026, Oracle documents 2 OCPUs/12 GB total for A1 on an
Always Free tenancy. Capacity may be unavailable; signup requires identity/card
verification. Use only resources labeled Always Free and remain inside the
account's displayed limits. Do not enable a paid upgrade to get capacity.
[Current allocation](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm),
[signup details](https://www.oracle.com/cloud/free/faq/).

The pinned FalkorDB image includes Linux arm64 and amd64 manifests. Go and the
app image compile for the build host. The complete package has been tested on
local Linux amd64 Docker; an ARM build/run is still pending.

## Provision and deploy

1. Create an eligible Ubuntu VM. Install Docker Engine and the Compose plugin
   using [Docker's Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/).
2. Copy this event repository to the VM. Point an existing domain/subdomain at
   its public IP. If the team has no domain, choose a free DNS provider before
   this step; a domain is not included by this repository.
3. Permit inbound TCP 80/443 (UDP 443 is optional) in the VM and cloud firewall.
   Keep FalkorDB, app, and lab ports private. Restrict SSH to your own IP.
4. Copy `deploy/cloud.env.example` to `deploy/cloud.env`, restrict permissions
   with `chmod 600 deploy/cloud.env`, then edit locally. Set the hostname, a
   randomly generated access token, and the provider key. A token can be made
   with `openssl rand -hex 32`; don't post it to a public issue or README.
5. From the repository root:

   ```sh
   docker compose --env-file deploy/cloud.env -f deploy/compose.yaml config --quiet
   docker compose --env-file deploy/cloud.env -f deploy/compose.yaml up --build -d
   docker compose --env-file deploy/cloud.env -f deploy/compose.yaml ps
   ```

6. Open `https://YOUR_HOSTNAME`, enter the token, run the **LLM** investigation,
   resume it in a new session, and verify the measured result. Then restart the
   app and verify that graph memory and lab state survive. Repeat with a retired
   runbook: the action must be blocked. Share the token privately with judges.

Caddy obtains TLS certificates when DNS and public 80/443 are configured.
It flushes streamed updates immediately.
[Caddy HTTPS prerequisites](https://caddyserver.com/docs/quick-starts/reverse-proxy).

Groq's free plan is quota limited; exact account limits take precedence. The
published Qwen allowance is currently 8K tokens/minute and 200K tokens/day.
Several tool calls may hit the minute limit. Do not promise unlimited judging
traffic or speed until the hosted evaluation passes.
[Provider limits](https://console.groq.com/docs/rate-limits).

## Persistence and scope

Two named volumes preserve graph data and controlled service state across
container recreation. Redis snapshots run at the configured save interval;
this is not a zero-loss recovery guarantee. Stop/recreate containers without
deleting volumes. Export a graph backup before changing the database image.

This is one shared team demonstration workspace, one running agent job, and a
shared access token. It is not an authenticated multi-tenant SaaS deployment.
Only synthetic sources and local controlled actions are enabled.

## Other free options considered

| Option | Fit for this build |
|---|---|
| Render Free | App hosting is available, but it sleeps after 15 minutes and loses local files. A separate persistent graph and durable lab state would be needed. |
| Koyeb Free | 512 MB RAM, 0.1 vCPU, no volumes; too constrained for this combined stack. |
| Hugging Face | Current docs require a paid plan to create Docker/Gradio compute Spaces, despite CPU Basic having no hourly hardware charge. |
| Laptop with a temporary tunnel | Possible for a supervised demo; uptime depends on this laptop. A Quick Tunnel does not support SSE, so only polling would update. Not selected as a permanent submission deployment. |

[Render](https://render.com/docs/free),
[Koyeb](https://www.koyeb.com/docs/reference/instances),
[Hugging Face](https://huggingface.co/docs/hub/spaces-overview),
[Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).

If Oracle capacity or signup blocks us, the reproducible local Docker package
remains available. The event rules allow complete local setup instructions;
the actual signed-in submission form still needs checking when it opens.
