#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

mkdir -p .black-vault

list_files() {
  if command -v rg >/dev/null 2>&1; then
    rg --files --hidden \
      -g '!.git/**' \
      -g '!.black-vault/**' \
      -g '!**/__pycache__/**' \
      -g '!**/*.pyc' \
      -g '!artifacts/**' \
      -g '!coverage/**' \
      -g '!dist/**' \
      -g '!node_modules/**'
    return
  fi

  find . -type f \
    -not -path './.git/*' \
    -not -path './.black-vault/*' \
    -not -path './*/__pycache__/*' \
    -not -name '*.pyc' \
    -not -path './artifacts/*' \
    -not -path './coverage/*' \
    -not -path './dist/*' \
    -not -path './node_modules/*' \
    -print | sed 's#^\./##'
}

classify_file() {
  case "$1" in
    server/*|api/*)
      echo "runtime"
      ;;
    client/src/*)
      echo "frontend"
      ;;
    shared/*)
      echo "shared"
      ;;
    tests/*)
      echo "test"
      ;;
    scripts/*|.github/*)
      echo "automation"
      ;;
    *)
      echo "config"
      ;;
  esac
}

risk_for_file() {
  case "$1" in
    server/auth.ts|server/db.ts|server/routes.ts|server/storage.ts|api/*|shared/schema.ts|scripts/ci/*|scripts/github-cli/*|scripts/run-all-gates.sh|.github/workflows/*)
      echo "P0"
      ;;
    server/*|client/src/App.tsx|client/src/main.tsx|client/src/pages/*|scripts/hardening/*|package.json|package-lock.json|eslint.config.js|vitest.config.ts|tsconfig.json)
      echo "P1"
      ;;
    *)
      echo "P2"
      ;;
  esac
}

{
  printf 'filepath\ttotal_lines\tclassification\texclusion_reason\trisk_level\n'
  list_files | sort | while IFS= read -r file; do
    lines="$(wc -l < "$file" 2>/dev/null | awk '{print $1}')"
    lines="${lines:-0}"
    printf '%s\t%s\t%s\t%s\t%s\n' \
      "$file" \
      "$lines" \
      "$(classify_file "$file")" \
      "" \
      "$(risk_for_file "$file")"
  done
} > .black-vault/Inventory.tsv

cat .black-vault/Inventory.tsv
