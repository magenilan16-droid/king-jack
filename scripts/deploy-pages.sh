#!/usr/bin/env bash
# בונה את האפליקציה ומעלה את התוצאה לענף gh-pages (שממנו GitHub Pages מגיש את האתר)
set -e
cd "$(dirname "$0")/.."
REMOTE=$(git remote get-url origin)
npm run build
TMP=$(mktemp -d)
cp -r dist/. "$TMP"
touch "$TMP/.nojekyll"
cd "$TMP"
git init -q
git checkout -q -b gh-pages
git add -A
git commit -q -m "Deploy site $(date -u +%Y-%m-%dT%H:%MZ)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -q -f "$REMOTE" gh-pages
echo "✔ פורסם לענף gh-pages"
