#!/usr/bin/env bash
set -euo pipefail
# Updates the DDNS record using the configuration specified in ddns-env

# ddns-env is expected to be included with packaged release.
config_file=${1:-/etc/OptiMiles/ddns-env}
if [[ ! -f "$config_file" ]]; then
  echo "DDNS configuration not found: $config_file" >&2
  exit 1
fi
# Reads the configuration file and exports the required variables
while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in
    DDNS_HOST=*) DDNS_HOST=${line#DDNS_HOST=} ;;
    DDNS_DOMAIN=*) DDNS_DOMAIN=${line#DDNS_DOMAIN=} ;;
    DDNS_UPDATE_URL=*) DDNS_UPDATE_URL=${line#DDNS_UPDATE_URL=} ;;
    DDNS_PASSWORD=*) DDNS_PASSWORD=${line#DDNS_PASSWORD=} ;;
  esac
done < "$config_file"

: "${DDNS_HOST:?DDNS_HOST is not set}"
: "${DDNS_DOMAIN:?DDNS_DOMAIN is not set}"
: "${DDNS_UPDATE_URL:?DDNS_UPDATE_URL is not set}"
: "${DDNS_PASSWORD:?DDNS_PASSWORD is not set}"

# Attempts to update the DDNS record up to 5 times
for attempt in $(seq 1 5); do
  if response=$(printf '%s' "$DDNS_PASSWORD" | curl --proto '=https' \
    --fail --silent --show-error --get \
    --connect-timeout 10 --max-time 30 \
    "$DDNS_UPDATE_URL" \
    --data-urlencode "host=$DDNS_HOST" \
    --data-urlencode "domain=$DDNS_DOMAIN" \
    --data-urlencode 'password@-'); then
    if success=$(printf '%s' "$response" | xmllint --noenc --nonet \
      --xpath 'boolean(/interface-response[normalize-space(ErrCount)="0" and normalize-space(Done)="true"])' -) \
      && [[ "$success" == "true" ]]; then
      echo "DDNS updated for ${DDNS_HOST}.${DDNS_DOMAIN}"
      exit 0
    fi
    echo "DDNS update returned an error or invalid response." >&2
  else
    echo "DDNS request failed." >&2
  fi
  if [[ "$attempt" -lt 5 ]]; then
    sleep 2
  fi
done

echo "DDNS update failed for ${DDNS_DOMAIN} after 5 attempts." >&2
exit 1
