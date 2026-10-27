#!/usr/bin/env bash
# Download the offline speech model Unicorn Rancher listens with (Vosk's
# small US English model, about 40 MB) into public/models/, where the build
# copies it into the site. It's too big to keep in git, so the deploy runs
# this before building; run it once yourself before `npm run dev`.
#
# This copy is already packed the way the in-browser Vosk library wants it
# (a .tar.gz of the model folder). The checksum makes sure we ship exactly
# the file we tested.
set -euo pipefail

NAME=vosk-model-small-en-us-0.15.tar.gz
URL="https://raw.githubusercontent.com/ccoreilly/vosk-browser/gh-pages/models/$NAME"
SHA256=f0b24bb92a48ca575b6a96500d6b543f0f079c573dfe85bbe16001fc0404e1d8

cd "$(dirname "$0")/.."
mkdir -p public/models
OUT="public/models/$NAME"

if [ -f "$OUT" ] && echo "$SHA256  $OUT" | sha256sum -c --status; then
  echo "Speech model already downloaded."
  exit 0
fi

curl -fsSL --retry 4 -o "$OUT.part" "$URL"
echo "$SHA256  $OUT.part" | sha256sum -c --status || { echo "Speech model checksum mismatch" >&2; rm -f "$OUT.part"; exit 1; }
mv "$OUT.part" "$OUT"
echo "Speech model saved to $OUT"
