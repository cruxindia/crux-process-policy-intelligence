#!/usr/bin/env bash
# One-time setup of an Oracle Always Free Ubuntu 24.04 VM (Ampere A1, Mumbai) for the web app (D-104).
# Run as the default "ubuntu" user:  curl -fsSL <raw url of this file> | bash -s -- your-hostname
# your-hostname: a domain pointing at the VM, or leave empty to use <public-ip>.sslip.io (free HTTPS via Let's Encrypt).
set -euo pipefail
HOST="${1:-}"
IP=$(curl -fsS https://ifconfig.me || hostname -I | awk '{print $1}')
[ -z "$HOST" ] && HOST="$(echo "$IP" | tr . -).sslip.io"
echo "Setting up for https://$HOST"

sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades
# Node.js 22 LTS (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
# Caddy (automatic HTTPS)
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -y && sudo apt-get install -y caddy

# app user and folders; the deploy user may only write releases and restart the service
sudo useradd --system --create-home --home-dir /opt/ppi --shell /usr/sbin/nologin ppi 2>/dev/null || true
sudo mkdir -p /opt/ppi/releases /etc/ppi && sudo chown -R ppi:ppi /opt/ppi
sudo usermod -aG ppi ubuntu
sudo chmod -R g+w /opt/ppi
echo "ubuntu ALL=(root) NOPASSWD: /usr/bin/systemctl restart ppi-web, /usr/bin/systemctl status ppi-web" | sudo tee /etc/sudoers.d/ppi-deploy >/dev/null
sudo chmod 440 /etc/sudoers.d/ppi-deploy
if [ ! -f /etc/ppi/web.env ]; then
  printf 'NEXT_PUBLIC_SUPABASE_URL=https://pahzxpileudulljgaciw.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\n' | sudo tee /etc/ppi/web.env >/dev/null
  sudo chmod 640 /etc/ppi/web.env && sudo chown root:ppi /etc/ppi/web.env
fi

sudo curl -fsSL -o /etc/systemd/system/ppi-web.service https://raw.githubusercontent.com/cruxindia/crux-process-policy-intelligence/main/deploy/oracle/ppi-web.service 2>/dev/null \
  || echo "Copy deploy/oracle/ppi-web.service to /etc/systemd/system/ppi-web.service (private repo)"
sudo systemctl daemon-reload
sudo systemctl enable ppi-web

sudo tee /etc/caddy/Caddyfile >/dev/null <<CADDY
$HOST {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
  header {
    Strict-Transport-Security "max-age=31536000"
    -Server
  }
}
CADDY
sudo systemctl reload caddy

# Oracle images block ports 80/443 in iptables by default: open them (the VCN security list must allow them too).
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo apt-get install -y iptables-persistent && sudo netfilter-persistent save

echo
echo "Done. Site address: https://$HOST"
echo "Next: put the publishable key in /etc/ppi/web.env, then run the 'deploy-oracle' GitHub workflow."
