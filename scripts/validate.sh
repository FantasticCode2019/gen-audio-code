#!/usr/bin/env bash
# Renders every model x capability x language snippet and syntax-checks the
# result with the real toolchains: python3, bash, and (when node is available)
# tsc against the actual openai/ws packages.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/generated}"
URL="${AUDIOGEN_URL:-https://router.yaotest004.olares.com}"

cd "$ROOT"

echo "==> Rendering snippets into $OUT"
rm -rf "$OUT"
go run ./cmd/audiogen -all-models -lang all -url "$URL" -out "$OUT" >/dev/null || exit 1
echo "    $(find "$OUT" -type f | wc -l | tr -d ' ') files"

status=0

echo "==> Checking Python snippets"
py_total=0 py_fail=0
while IFS= read -r f; do
  py_total=$((py_total + 1))
  if ! python3 -m py_compile "$f" 2>/tmp/audiogen_py.err; then
    echo "    FAIL $f"; sed 's/^/      /' /tmp/audiogen_py.err; py_fail=$((py_fail + 1))
  fi
done < <(find "$OUT" -name '*.py')
find "$OUT" -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null
echo "    $py_total checked, $py_fail failed"
[ "$py_fail" -eq 0 ] || status=1

echo "==> Checking shell snippets"
sh_total=0 sh_fail=0
while IFS= read -r f; do
  sh_total=$((sh_total + 1))
  if ! bash -n "$f" 2>/tmp/audiogen_sh.err; then
    echo "    FAIL $f"; sed 's/^/      /' /tmp/audiogen_sh.err; sh_fail=$((sh_fail + 1))
  fi
done < <(find "$OUT" -name '*.sh')
echo "    $sh_total checked, $sh_fail failed"
[ "$sh_fail" -eq 0 ] || status=1

echo "==> Checking TypeScript snippets"
if ! command -v npx >/dev/null 2>&1; then
  echo "    skipped (node/npx not found)"
else
  WORK="$(mktemp -d)"
  trap 'rm -rf "$WORK"' EXIT
  # One representative file per capability is enough: snippets differ only by
  # the model string, so type errors would repeat identically across models.
  while IFS= read -r f; do
    base="$(basename "$f")"
    [ -e "$WORK/$base" ] || cp "$f" "$WORK/$base"
  done < <(find "$OUT" -name '*.ts')
  cat >"$WORK/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "es2022",
    "module": "esnext",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  }
}
JSON
  (cd "$WORK" && npm install --silent --no-audit --no-fund typescript@5 openai ws @types/node @types/ws >/dev/null 2>&1)
  if (cd "$WORK" && npx --no-install tsc 2>&1 | grep -v '^npm warn'); then
    echo "    FAIL: tsc reported errors"; status=1
  else
    echo "    $(find "$WORK" -maxdepth 1 -name '*.ts' | wc -l | tr -d ' ') checked, 0 failed"
  fi
fi

echo
if [ "$status" -eq 0 ]; then
  echo "All snippet syntax checks passed."
else
  echo "Some snippet syntax checks FAILED."
fi
exit "$status"
