#!/usr/bin/env bash
# Installs Quizy on an Ubuntu server, or updates an existing install when run again.
# Written for an Oracle Cloud "Always Free" VM, works on any Ubuntu 22.04/24.04 server.
#
#   sudo bash oracle-setup.sh                  # address becomes <ip>.sslip.io, with HTTPS
#   sudo bash oracle-setup.sh quizy.exemplu.ro # your own domain (its DNS must point to this server)
#
# For a private repository pass a read-only GitHub token: sudo GITHUB_TOKEN=... bash oracle-setup.sh
set -euo pipefail

REPO="${QUIZY_REPO:-https://github.com/mihaelacurca-code/Quizy.git}"
BRANCH="${QUIZY_BRANCH:-main}"
APP_DIR=/opt/quizy
DATA_DIR=/var/lib/quizy
BACKUP_DIR=/var/backups/quizy
PORT=3000

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mEROARE: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "Rulează scriptul cu sudo."
command -v apt-get >/dev/null || die "Scriptul e făcut pentru Ubuntu (apt-get lipsește)."

# ---------- address ----------
mkdir -p /etc/quizy
DOMAIN="${1:-${QUIZY_DOMAIN:-}}"
if [ -z "$DOMAIN" ] && [ -s /etc/quizy/domain ]; then DOMAIN="$(cat /etc/quizy/domain)"; fi
if [ -z "$DOMAIN" ]; then
  IP="$(curl -fsS4 --max-time 10 https://api.ipify.org || curl -fsS4 --max-time 10 https://ifconfig.me || true)"
  [ -n "$IP" ] || die "Nu am aflat IP-ul public. Dă adresa ca argument: sudo bash oracle-setup.sh adresa.ta"
  # sslip.io resolves 1-2-3-4.sslip.io to 1.2.3.4, so HTTPS works without buying a domain.
  DOMAIN="${IP//./-}.sslip.io"
fi
echo "$DOMAIN" > /etc/quizy/domain

# ---------- packages ----------
say "Instalez pachetele de sistem"
export DEBIAN_FRONTEND=noninteractive
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
apt-get update -q
apt-get install -yq curl git ca-certificates gnupg sqlite3 debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; }
if ! node_ok; then
  say "Instalez Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -yq nodejs
fi
node_ok || die "Node.js 22.13 sau mai nou nu s-a putut instala."

if ! command -v caddy >/dev/null; then
  say "Instalez Caddy (HTTPS automat)"
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -yq caddy
fi

# ---------- code ----------
say "Descarc Quizy"
id quizy >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin quizy
mkdir -p "$DATA_DIR" "$BACKUP_DIR"
chown quizy:quizy "$DATA_DIR"
chmod 700 "$DATA_DIR" "$BACKUP_DIR"

FETCH_URL="$REPO"
if [ -n "${GITHUB_TOKEN:-}" ]; then FETCH_URL="https://x-access-token:${GITHUB_TOKEN}@${REPO#https://}"; fi
PRIVATE_HINT="Nu pot descărca repo-ul. Dacă e privat, rulează cu un token: sudo GITHUB_TOKEN=... bash oracle-setup.sh"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch -q --depth 1 "$FETCH_URL" "$BRANCH" || die "$PRIVATE_HINT"
  git -C "$APP_DIR" reset -q --hard FETCH_HEAD
else
  git clone -q --depth 1 --branch "$BRANCH" "$FETCH_URL" "$APP_DIR" || die "$PRIVATE_HINT"
  git -C "$APP_DIR" remote set-url origin "$REPO" # keep the token off the disk
fi
(cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)

# ---------- service ----------
say "Configurez serviciul"
cat > /etc/systemd/system/quizy.service <<EOF
[Unit]
Description=Quizy
After=network-online.target
Wants=network-online.target

[Service]
User=quizy
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production PORT=$PORT HOST=127.0.0.1 TRUST_PROXY=1
Environment=DATABASE_FILE=$DATA_DIR/quizy.db PUBLIC_URL=https://$DOMAIN
ExecStart=$(command -v node) --disable-warning=ExperimentalWarning server/index.js
Restart=always
RestartSec=2
LimitNOFILE=65536
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:$PORT
}
EOF

# ---------- firewall ----------
# Oracle's Ubuntu images reject everything except SSH at the OS level, on top of the cloud security list.
say "Deschid porturile 80 și 443"
for p in 80 443; do
  iptables -C INPUT -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT
done
netfilter-persistent save >/dev/null 2>&1 || true
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then ufw allow 80,443/tcp >/dev/null; fi

# ---------- daily backup ----------
cat > /etc/cron.daily/quizy-backup <<EOF
#!/bin/sh
# Keeps 14 days of database copies in $BACKUP_DIR.
[ -f $DATA_DIR/quizy.db ] || exit 0
sqlite3 $DATA_DIR/quizy.db ".backup '$BACKUP_DIR/quizy-\$(date +%F).db'"
find $BACKUP_DIR -name 'quizy-*.db' -mtime +14 -delete
EOF
chmod 755 /etc/cron.daily/quizy-backup

# ---------- start ----------
say "Pornesc Quizy"
systemctl daemon-reload
systemctl enable -q quizy caddy
systemctl restart quizy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

for _ in $(seq 1 20); do curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null || die "Quizy nu a pornit. Vezi: sudo journalctl -u quizy -n 50"

say "Verific adresa publică (certificatul HTTPS poate dura un minut)"
ok=""
for _ in $(seq 1 30); do
  if curl -fsS --max-time 5 "https://$DOMAIN/healthz" >/dev/null 2>&1; then ok=1; break; fi
  sleep 3
done

if [ -n "$ok" ]; then
  printf '\n\033[1;32mGata! Quizy rulează la: https://%s\033[0m\n\n' "$DOMAIN"
else
  cat <<EOF

Quizy rulează pe server, dar https://$DOMAIN nu răspunde încă din internet.
Aproape sigur lipsesc regulile din Oracle Cloud: Networking → Virtual cloud networks →
rețeaua ta → Security → Security list → Add Ingress Rules: sursa 0.0.0.0/0, TCP, portul 80,
apoi la fel pentru 443. După ce le adaugi, deschide https://$DOMAIN (nu trebuie să rulezi
scriptul din nou). Detalii: sudo journalctl -u caddy -n 30

EOF
fi
