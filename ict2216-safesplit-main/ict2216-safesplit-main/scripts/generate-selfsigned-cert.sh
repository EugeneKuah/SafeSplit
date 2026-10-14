#!/usr/bin/env bash
set -euo pipefail

# Generates a self-signed certificate whose Subject Alternative Name is the
# EC2 public IP. Browsers encrypt traffic but will show a trust warning because
# this is not a certificate issued by a public Certificate Authority.
#
# Usage: ./scripts/generate-selfsigned-cert.sh
# Set TLS_HOST in .env first, for example TLS_HOST=3.15.217.120.

if [[ ! -f .env ]]; then
  echo "Missing .env. Create it first: cp .env.example .env"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [[ -z "${TLS_HOST:-}" ]]; then
  echo "TLS_HOST is required in .env and must be the EC2 public IPv4 address."
  exit 1
fi

if ! [[ "$TLS_HOST" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "TLS_HOST must be an IPv4 address for this self-signed EC2 setup."
  exit 1
fi

mkdir -p certs
chmod 700 certs

openssl req -x509 -newkey rsa:3072 -sha256 -nodes   -keyout certs/selfsigned.key   -out certs/selfsigned.crt   -days 365   -subj "/CN=${TLS_HOST}"   -addext "subjectAltName=IP:${TLS_HOST}"   -addext "basicConstraints=critical,CA:FALSE"   -addext "keyUsage=critical,digitalSignature,keyEncipherment"   -addext "extendedKeyUsage=serverAuth"

chmod 600 certs/selfsigned.key
chmod 644 certs/selfsigned.crt

echo "Created certs/selfsigned.crt and certs/selfsigned.key for ${TLS_HOST}."
echo "Start containers with: docker compose up -d --build"
