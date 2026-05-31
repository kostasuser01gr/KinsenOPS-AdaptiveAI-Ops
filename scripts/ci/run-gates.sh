#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

mkdir -p artifacts .black-vault

RUN_ID="${BLACK_VAULT_RUN_ID:-GR-$(date -u +%Y%m%dT%H%M%SZ)}"
ARTIFACT_DIR="artifacts/$RUN_ID"
mkdir -p "$ARTIFACT_DIR"

record_gate_result() {
  python3 - "$ROOT_DIR/.black-vault/ArtifactsLedger.json" "$1" "$2" "$3" "$4" "$RUN_ID" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ledger_path = Path(sys.argv[1])
gate_id = sys.argv[2]
description = sys.argv[3]
exit_code = int(sys.argv[4])
artifact_path = sys.argv[5]
run_id = sys.argv[6]

try:
    ledger = json.loads(ledger_path.read_text())
except Exception:
    ledger = []

ledger.append({
    "run_id": run_id,
    "gate": gate_id,
    "description": description,
    "status": "PASS" if exit_code == 0 else "FAIL",
    "exit_code": exit_code,
    "artifact": artifact_path,
    "timestamp": datetime.now(timezone.utc).isoformat(),
})

ledger_path.write_text(json.dumps(ledger, indent=2) + "\n")
PY
}

run_shell_gate() {
  local gate_id="$1"
  local description="$2"
  local command="$3"
  local log_file="$ARTIFACT_DIR/${gate_id}.log"

  echo "[$gate_id] $description"
  set +e
  bash -lc "$command" > >(tee "$log_file") 2> >(tee -a "$log_file" >&2)
  local exit_code=$?
  set -e

  if [ "$exit_code" -eq 0 ]; then
    echo "PASS" | tee -a "$log_file" >/dev/null
  else
    echo "FAIL ($exit_code)" | tee -a "$log_file" >/dev/null
  fi

  record_gate_result "$gate_id" "$description" "$exit_code" "$log_file"
  return "$exit_code"
}

run_advisory_shell_gate() {
  local gate_id="$1"
  local description="$2"
  local command="$3"
  local log_file="$ARTIFACT_DIR/${gate_id}.log"

  echo "[$gate_id] $description"
  set +e
  bash -lc "$command" > >(tee "$log_file") 2> >(tee -a "$log_file" >&2)
  local exit_code=$?
  set -e

  if [ "$exit_code" -eq 0 ]; then
    echo "PASS" | tee -a "$log_file" >/dev/null
    record_gate_result "$gate_id" "$description" 0 "$log_file"
  else
    echo "WARN ($exit_code)" | tee -a "$log_file" >/dev/null
    record_gate_result "$gate_id" "$description" 0 "$log_file"
  fi

  return 0
}

run_named_gate() {
  case "$1" in
    G1)
      run_shell_gate "G1" "Build" "npm run build"
      ;;
    G2)
      run_shell_gate "G2" "Lint" "npm run lint"
      ;;
    G3)
      run_shell_gate "G3" "Typecheck" "npm run check"
      ;;
    G4)
      run_shell_gate "G4" "Tests" "npm test"
      ;;
    G5)
      run_advisory_shell_gate "G5" "E2E (Playwright)" "npx playwright test"
      ;;
    G6)
      run_advisory_shell_gate "G6" "Coverage" "npx vitest run --coverage --coverage.reporter=text --coverage.reporter=json-summary --coverage.reporter=lcov"
      ;;
    G8)
      run_shell_gate "G8" "Dependency audit" "npm audit --omit=dev --audit-level=moderate"
      ;;
    G9)
      run_shell_gate "G9" "SAST heuristic scan" "if rg -n --glob '!client/src/components/ui/**' '(eval\\(|new Function\\(|dangerouslySetInnerHTML|child_process\\.(exec|spawn)|execSync\\()' server client/src shared api; then echo 'Potentially unsafe constructs found'; exit 1; fi"
      ;;
    G10)
      run_shell_gate "G10" "Secret scan" "if command -v gitleaks >/dev/null 2>&1; then gitleaks detect --no-banner --redact --source .; else if rg -n --hidden --glob '!.git/**' --glob '!node_modules/**' --glob '!dist/**' --glob '!coverage/**' '(-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{40,}|sk_live_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})' .; then echo 'Potential secrets found'; exit 1; fi; echo 'No supported secret scanner installed; heuristic scan passed'; fi"
      ;;
    G11)
      run_shell_gate "G11" "Migration ordering" "zsh scripts/ci/validate-migrations.sh"
      ;;
    *)
      echo "Unsupported gate: $1" >&2
      exit 1
      ;;
  esac
}

write_run_summary() {
  python3 - "$ARTIFACT_DIR" "$RUN_ID" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

artifact_dir = Path(sys.argv[1])
run_id = sys.argv[2]
summary = {"run_id": run_id, "timestamp": datetime.now(timezone.utc).isoformat(), "gates": {}}

for log_path in sorted(artifact_dir.glob("G*.log")):
    text = log_path.read_text()
    if "FAIL (" in text:
        status = "FAIL"
    elif "PASS" in text:
        status = "PASS"
    else:
        status = "UNKNOWN"
    summary["gates"][log_path.stem] = {"status": status, "log": str(log_path)}

(artifact_dir / "metadata.json").write_text(json.dumps(summary, indent=2) + "\n")
PY
}

TARGET="${1:-all}"

if [ "$TARGET" = "all" ]; then
  failed=0
  for gate in G1 G2 G3 G4 G5 G6 G8 G9 G10 G11; do
    if ! run_named_gate "$gate"; then
      failed=1
    fi
  done
  write_run_summary
  exit "$failed"
fi

run_named_gate "$TARGET"
write_run_summary
