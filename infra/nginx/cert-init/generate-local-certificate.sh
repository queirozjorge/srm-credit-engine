#!/bin/sh
set -eu

certificate_dir="${CERT_DIR:-/certs}"
certificate_file="${certificate_dir}/localhost.crt"
private_key_file="${certificate_dir}/localhost.key"

mkdir -p "$certificate_dir"

if [ -s "$certificate_file" ] && [ -s "$private_key_file" ]; then
    certificate_public_key="$(openssl x509 -in "$certificate_file" -pubkey -noout 2>/dev/null || true)"
    private_public_key="$(openssl pkey -in "$private_key_file" -pubout 2>/dev/null || true)"
    subject_alt_names="$(openssl x509 -in "$certificate_file" -noout -ext subjectAltName 2>/dev/null || true)"

    if [ -n "$certificate_public_key" ] &&
        [ "$certificate_public_key" = "$private_public_key" ] &&
        printf '%s' "$subject_alt_names" | grep -q 'DNS:localhost' &&
        printf '%s' "$subject_alt_names" | grep -q 'IP Address:127.0.0.1' &&
        openssl x509 -in "$certificate_file" -checkend 2592000 -noout >/dev/null 2>&1; then
        exit 0
    fi
fi

temporary_dir="$(mktemp -d "${certificate_dir}/.localhost.XXXXXX")"
trap 'rm -rf "$temporary_dir"' EXIT HUP INT TERM
umask 077

openssl req \
    -x509 \
    -newkey rsa:3072 \
    -sha256 \
    -nodes \
    -days 365 \
    -keyout "${temporary_dir}/localhost.key" \
    -out "${temporary_dir}/localhost.crt" \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

chmod 0600 "${temporary_dir}/localhost.key"
chmod 0644 "${temporary_dir}/localhost.crt"
mv -f "${temporary_dir}/localhost.key" "$private_key_file"
mv -f "${temporary_dir}/localhost.crt" "$certificate_file"
