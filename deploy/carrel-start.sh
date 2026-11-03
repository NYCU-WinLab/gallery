#!/bin/sh
# carrel-deployd runs this from the release directory on every deploy and
# rollback. It points the Compose stack in /opt/gallery at the image in
# VERSION, reports ready once web is healthy, then follows the web logs.
# The unit needs Type=notify and NotifyAccess=all (see README, Deploy).
set -eu

version=$(cat VERSION)
# The release carries the stack's compose.yaml, so the repo is its source.
# An older release (a rollback) has none and keeps the one in place.
if [ -f compose.yaml ]; then
  cp compose.yaml /opt/gallery/compose.yaml.new
  mv /opt/gallery/compose.yaml.new /opt/gallery/compose.yaml
fi
cd /opt/gallery

tmp=$(mktemp .env.XXXXXX)
sed "s/^GALLERY_VERSION=.*/GALLERY_VERSION=$version/" .env >"$tmp"
mv "$tmp" .env

docker compose pull --quiet migrate web
docker compose up -d --wait web
systemd-notify --ready
exec docker compose logs -f --since 1s web
