#!/usr/bin/env bash
# One-time setup of a public GraphOps instance on a fresh Ubuntu VM
# (tested target: Oracle Cloud Always Free, Ampere A1, Ubuntu 22.04/24.04).
#
#   curl -fsSL https://raw.githubusercontent.com/Ashok-kumar290/GraphOps/master/deploy/setup-vm.sh -o setup-vm.sh
#   bash setup-vm.sh
#
# It asks for the Groq key without echoing it, generates the access token,
# opens ports 80/443 in the VM firewall and starts the stack behind HTTPS.
# Re-running it updates the code and restarts; existing settings are kept.
set -euo pipefail

REPO=${GRAPHOPS_REPO:-https://github.com/Ashok-kumar290/GraphOps.git}
DIR=${GRAPHOPS_DIR:-$HOME/GraphOps}

if ! command -v docker >/dev/null; then
  echo "Installing Docker Engine..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
fi
command -v git >/dev/null || { sudo apt-get update -q; sudo apt-get install -yq git; }

# Oracle's Ubuntu images reject all inbound traffic except SSH in iptables.
# The cloud security list must also allow TCP 80 and 443 (see deploy/README.md).
if sudo iptables -S INPUT | grep -q -- "-j REJECT"; then
  for port in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null ||
      sudo iptables -I INPUT 1 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
  done
  sudo iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p udp --dport 443 -j ACCEPT
  if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save; fi
fi

if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO" "$DIR"; fi
cd "$DIR"

ENV=deploy/cloud.env
if [ ! -f "$ENV" ]; then
  ip=$(curl -4 -fsS https://api.ipify.org)
  domain=${GRAPHOPS_DOMAIN:-$(echo "$ip" | tr . -).sslip.io}
  read -rsp "Groq API key (input hidden): " groq; echo
  token=$(openssl rand -hex 24)
  umask 077
  sed -e "s|^GRAPHOPS_DOMAIN=.*|GRAPHOPS_DOMAIN=$domain|" \
      -e "s|^GRAPHOPS_ACCESS_TOKEN=.*|GRAPHOPS_ACCESS_TOKEN=$token|" \
      -e "s|^GROQ_API_KEY=.*|GROQ_API_KEY=$groq|" deploy/cloud.env.example > "$ENV"
  unset groq
  echo "Wrote $ENV (permissions 600). The judge access token is stored there."
fi

compose() { sudo docker compose --env-file "$ENV" -f deploy/compose.yaml "$@"; }
compose config --quiet
compose up --build -d
compose ps

domain=$(grep '^GRAPHOPS_DOMAIN=' "$ENV" | cut -d= -f2)
echo
echo "Public URL: https://$domain  (the certificate can take a minute on first start)"
echo "Show the judge token with: grep ACCESS_TOKEN $DIR/$ENV"
