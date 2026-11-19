#!/usr/bin/env bash
# Installs and starts Optimiles on nginx with gunicorn on daemon(Systemd).
# Run from an extracted release directory (containing backend/, frontend/dist/, deploy/):
#   sudo bash deploy/launch.sh

set -euo pipefail

APP_NAME=OptiMiles
APP_DIR=/opt/${APP_NAME}
ENV_DIR=/etc/${APP_NAME}
ENV_FILE=${ENV_DIR}/env
LOG_DIR=/var/log/${APP_NAME}
SERVICE_USER=${APP_NAME}
BACKEND_PORT=${BACKEND_PORT:-5000}
RELEASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Ensure sudo
if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

# Set DDNS env file directory
if [[ -f "${RELEASE_DIR}/.ddns-env" ]]; then
  DDNS_ENV_FILE="${RELEASE_DIR}/.ddns-env"
else
  DDNS_ENV_FILE="${ENV_DIR}/ddns-env"
fi

# Load DDNS Environment Variables
if [[ -f "${DDNS_ENV_FILE}" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      DDNS_HOST=*) DDNS_HOST=${line#DDNS_HOST=} ;;
      DDNS_DOMAIN=*) DDNS_DOMAIN=${line#DDNS_DOMAIN=} ;;
      DDNS_UPDATE_URL=*) DDNS_UPDATE_URL=${line#DDNS_UPDATE_URL=} ;;
      DDNS_PASSWORD=*) DDNS_PASSWORD=${line#DDNS_PASSWORD=} ;;
    esac
  done < "${DDNS_ENV_FILE}"
fi

# Validate Variables
: "${DDNS_HOST:?DDNS_HOST is not set}"
: "${DDNS_DOMAIN:?DDNS_DOMAIN is not set}"
: "${DDNS_UPDATE_URL:?DDNS_UPDATE_URL is not set}"
: "${DDNS_PASSWORD:?DDNS_PASSWORD is not set}"

# Set default file permissions for new files
umask 022

for path in backend/app.py backend/requirements.txt frontend/dist/index.html; do
  [[ -e "${RELEASE_DIR}/${path}" ]] || { echo "Missing ${path} in ${RELEASE_DIR}" >&2; exit 1; }
done

# Setup OS packages and dependencies
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y python3 python3-venv python3-pip nginx rsync libxml2-utils

# Create service user
id -u "${SERVICE_USER}" >/dev/null 2>&1 \
  || useradd --system --home-dir "${APP_DIR}" --shell /usr/sbin/nologin "${SERVICE_USER}"

# Environment variables (secrets) live outside the code tree.
mkdir -p "${ENV_DIR}"

# Install the DDNS environment file if it exists in the release directory.
install -m 600 -o root -g root "${RELEASE_DIR}/.ddns-env" "${ENV_DIR}/ddns-env"


if [[ -f "${RELEASE_DIR}/.env" ]]; then
  install -m 640 -o root -g "${SERVICE_USER}" "${RELEASE_DIR}/.env" "${ENV_FILE}"
elif [[ ! -f "${ENV_FILE}" ]]; then
  echo "No .env in release and no existing ${ENV_FILE}" >&2
  exit 1
fi

grep -q '^BACKEND_LOG_PATH=' "${ENV_FILE}" \
  || echo "BACKEND_LOG_PATH=${LOG_DIR}/backend.log" >> "${ENV_FILE}"

# Sync code, keeping the virtualenv and the database across releases.
mkdir -p "${APP_DIR}/backend" "${APP_DIR}/frontend" "${LOG_DIR}"
# Grant access for the service user to the application directories and files
chmod 755 "${APP_DIR}"
rsync -a --delete \
  --exclude '.env' --exclude '.venv' --exclude '__pycache__' --exclude 'tests' --exclude 'logs' --exclude 'instance' \
  "${RELEASE_DIR}/backend/" "${APP_DIR}/backend/"
rsync -a --delete "${RELEASE_DIR}/frontend/dist/" "${APP_DIR}/frontend/dist/"
mkdir -p "${APP_DIR}/instance" "${APP_DIR}/backend/instance"
chown -R root:root "${APP_DIR}/backend" "${APP_DIR}/frontend"
# Grant Access for the service user to the instance and log directories
chmod -R a+rX "${APP_DIR}/frontend/dist"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}/instance" "${APP_DIR}/backend/instance" "${LOG_DIR}"

# Setup Python virtual environment and install dependencies
python3 -m venv "${APP_DIR}/.venv"
"${APP_DIR}/.venv/bin/pip" install --quiet --upgrade pip
"${APP_DIR}/.venv/bin/pip" install --quiet -r "${APP_DIR}/backend/requirements.txt" 
# Grant access for the service user to the virtual environment
chmod -R a+rX "${APP_DIR}/.venv"

# Create daemon service for backend
cat > /etc/systemd/system/${APP_NAME}.service <<EOF
[Unit]
Description=Optimiles backend (gunicorn)
After=network.target

[Service]
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
Environment=PYTHONUNBUFFERED=1
ExecStart=${APP_DIR}/.venv/bin/gunicorn --workers 2 --threads 4 --timeout 120 --bind 127.0.0.1:${BACKEND_PORT} backend.app:app
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF

# nginx proxy configuration
SERVER_NAME=${DOMAIN:-_}
cat > /etc/nginx/sites-available/${APP_NAME} <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${SERVER_NAME};

    root ${APP_DIR}/frontend/dist;
    index index.html;

    location ~ ^/(api|docs|openapi\.json|static)(/|\$) {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 130s;
    }

    location / {
        try_files \$uri /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/${APP_NAME}
rm -f /etc/nginx/sites-enabled/default

# enable/start backend service
systemctl daemon-reload
systemctl enable ${APP_NAME} >/dev/null
systemctl restart ${APP_NAME}
nginx -t
systemctl enable nginx >/dev/null
systemctl reload nginx || systemctl restart nginx

if [[ -n "${DOMAIN:-}" && -n "${CERTBOT_EMAIL:-}" ]]; then
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "${DOMAIN}" -m "${CERTBOT_EMAIL}" --agree-tos --non-interactive --redirect
fi

serverHealth=false
# Health check through nginx
for _ in $(seq 1 15); do
  if curl -fsS http://127.0.0.1/api/health >/dev/null; then
    echo "Optimiles is up."
    serverHealth=true
    break
  fi
  sleep 2
done

if [[ "$serverHealth" = false ]]; then
  echo "Health check failed; see: journalctl -u ${APP_NAME} -n 50" >&2
  exit 1
fi

ddnsUpdate=false
# Server IP is omited, Namecheap DDNS will use the current public IP of the server
for _ in $(seq 1 5); do
  # Namecheap DDNS update
  response=$(curl --fail --silent --show-error --get \
    "${DDNS_UPDATE_URL}" \
    --data-urlencode "host=${DDNS_HOST}" \
    --data-urlencode "domain=${DDNS_DOMAIN}" \
    --data-urlencode "password=${DDNS_PASSWORD}")
  # Parse reponse and check status
  if success=$(printf '%s' "$response" | xmllint --noenc --nonet \
    --xpath 'boolean(/interface-response[normalize-space(ErrCount)="0" and normalize-space(Done)="true"])' -) \
    && [[ "$success" == "true" ]]; then
    ddnsUpdate=true
    break
  fi
  sleep 2
done

if [[ "$ddnsUpdate" = false ]]; then
  echo "DDNS update failed for ${DDNS_DOMAIN}" >&2
  exit 1
fi
echo "DDNS updated for ${DDNS_HOST}.${DDNS_DOMAIN}"
exit 0
