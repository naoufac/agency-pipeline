#!/usr/bin/env bash
# Vendor the Tailwind standalone binary (gitignored; ~120MB). Run once after clone.
set -e
cd "$(dirname "$0")"
curl -sL -o tailwindcss https://github.com/tailwindlabs/tailwindcss/releases/download/v4.1.5/tailwindcss-linux-x64
chmod +x tailwindcss
echo "tailwindcss vendored: $(./tailwindcss --help 2>&1 | head -1)"
