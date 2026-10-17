# Public hosting

Status: ready to provision. Verified October 17, 2026: the arm64 image builds and
runs; the full stack from this folder (FalkorDB, app, Caddy HTTPS) ran locally with
public view, and a live Groq Qwen3.8 27B agent resolved the payments incident
through HTTPS while an anonymous viewer followed it. The public instance needs the
team's Oracle account (below).

## What visitors get

With `GRAPHOPS_PUBLIC_VIEW=1` (the default here) anyone can open the site and
browse everything: the connected graph, company knowledge, past runs and their
agent lanes, the memory navigator, results and benchmarks. Anything that changes
state (running an agent, injecting a fault, asking a model question, importing
data, the judge check) needs the access token, which you give to judges. This
keeps one visitor from using up the Groq daily quota. Set it to `0` to put the
whole site behind the token.

FalkorDB, the app port, the lab services and the FalkorDB Browser are never
exposed; only Caddy listens on 80/443.

## Oracle Cloud Always Free (recommended)

Oracle documents 2 OCPUs/12 GB for Ampere A1 on an Always Free tenancy, as
checked October 15, 2026. Signup requires card verification; use only resources
labelled *Always Free* and never upgrade to get capacity.
[Allocation](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm),
[signup FAQ](https://www.oracle.com/cloud/free/faq/).

1. **Sign up** at https://signup.cloud.oracle.com. Pick a home region close to
   you; Always Free capacity is per region and cannot be moved later.
2. **Create the VM**: Compute → Instances → Create instance.
   - Image: Canonical Ubuntu 24.04 (or 22.04).
   - Shape: Ampere → `VM.Standard.A1.Flex`, 2 OCPUs, 12 GB (shows *Always Free-eligible*).
   - Networking: keep the default new VCN with a public subnet and *Assign a public IPv4 address*.
   - SSH keys: *Generate a key pair* and download the private key.

   "Out of capacity" is common; retry later or try another availability domain.
3. **Open the cloud firewall**: Instance → Subnet → Default security list →
   Add ingress rules: source `0.0.0.0/0`, TCP, destination ports `80,443`.
4. **Connect and install** (from Windows PowerShell):

   ```powershell
   ssh -i $HOME\Downloads\ssh-key.key ubuntu@PUBLIC_IP
   ```

   then on the VM:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/Ashok-kumar290/GraphOps/master/deploy/setup-vm.sh -o setup-vm.sh
   bash setup-vm.sh
   ```

   The script installs Docker, opens 80/443 in the VM's own iptables (Oracle
   images reject them by default), asks for the Groq key with input hidden,
   generates the access token, picks the hostname `PUBLIC-IP-WITH-DASHES.sslip.io`
   (no domain needed; set `GRAPHOPS_DOMAIN` first to use your own) and starts
   FalkorDB, the app and Caddy. The first build takes several minutes.
5. **Check it**: open the printed `https://…sslip.io` URL in a private window.
   You should see the workspace with a *Public view* banner. Unlock with the
   token (`grep ACCESS_TOKEN ~/GraphOps/deploy/cloud.env`), run the quick judge
   check, and confirm 4/4.

To update after a push, run `bash setup-vm.sh` again; settings and volumes are kept.

Caddy obtains TLS certificates once DNS and public 80/443 work, and flushes
streamed updates immediately.
[Caddy HTTPS prerequisites](https://caddyserver.com/docs/quick-starts/reverse-proxy).

Groq's free plan is quota limited (currently 200K tokens/day for Qwen3.8 27B).
A quick judge check uses a meaningful share of that, so share the token only
with judges. [Provider limits](https://console.groq.com/docs/rate-limits).

### Manual route

If you prefer not to run the script: install Docker Engine and the Compose
plugin ([Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/)),
clone this repository, copy `deploy/cloud.env.example` to `deploy/cloud.env`
(`chmod 600`), fill it in, then:

```sh
docker compose --env-file deploy/cloud.env -f deploy/compose.yaml up --build -d
```

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
