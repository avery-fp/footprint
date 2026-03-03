#!/usr/bin/env bash
set -euo pipefail

BASE="${FP_BASE_URL:-https://footprint.onl}"
ARO_KEY="${ARO_KEY:?Set ARO_KEY env var}"
CRON_SECRET="${CRON_SECRET:?Set CRON_SECRET env var}"

PASS=0 FAIL=0 TOTAL=0

check() {
  local label="$1" expected="$2" method="$3" url="$4"
  shift 4; TOTAL=$((TOTAL + 1))
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$@" "$url")
  if [ "$code" = "$expected" ]; then
    printf "  ✓  %-55s %s\n" "$label" "$code"
    PASS=$((PASS + 1))
  else
    printf "  ✗  %-55s %s (expected %s)\n" "$label" "$code" "$expected"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ARO Reactor Smoke Test — Target: $BASE"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "── 1. No auth (expect 401) ──"
check "GET /api/aro/health (no auth)"       401 GET "$BASE/api/aro/health"
check "GET /api/aro/stats  (no auth)"       401 GET "$BASE/api/aro/stats"
check "GET /api/aro/packs  (no auth)"       401 GET "$BASE/api/aro/packs"
echo ""
echo "── 2. Old ?aro_key= URL auth (expect 401) ──"
check "GET /api/aro/health?aro_key=X"       401 GET "$BASE/api/aro/health?aro_key=$ARO_KEY"
echo ""
echo "── 3. Valid Bearer ARO_KEY (expect 200) ──"
check "GET /api/aro/health (Bearer)"        200 GET "$BASE/api/aro/health" -H "Authorization: Bearer $ARO_KEY"
check "GET /api/aro/stats  (Bearer)"        200 GET "$BASE/api/aro/stats"  -H "Authorization: Bearer $ARO_KEY"
check "GET /api/aro/packs  (Bearer)"        200 GET "$BASE/api/aro/packs"  -H "Authorization: Bearer $ARO_KEY"
echo ""
echo "── 4. Wrong scope: CRON on machine route (expect 401) ──"
check "GET /api/aro/health (Bearer CRON)"   401 GET "$BASE/api/aro/health" -H "Authorization: Bearer $CRON_SECRET"
echo ""
echo "── 5. Garbage bearer (expect 401) ──"
check "GET /api/aro/health (garbage)"       401 GET "$BASE/api/aro/health" -H "Authorization: Bearer not-a-real-key"
echo ""
echo "═══════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✓ ALL $TOTAL TESTS PASSED — DRY RUN VERIFIED"
  echo "  To go live: set PUBLISH_MODE=live in Vercel"
else
  echo "  ✗ $FAIL/$TOTAL FAILED — DO NOT go live"
fi
echo "═══════════════════════════════════════════════════════"
exit "$FAIL"
