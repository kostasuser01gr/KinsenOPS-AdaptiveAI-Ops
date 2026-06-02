# Deploy Smoke Checklist — AdaptiveAI

```bash
# Set your deployed base URL (no trailing slash)
export BASE_URL="https://your-app.up.railway.app"
```

---

## 1. Infrastructure

### 1.1 Health Check
```bash
curl -sf "$BASE_URL/healthz" | jq .
```
- **Method:** `GET /healthz`
- **Expected:** `200` (or `503` if DB unreachable)
- **Verify:** `status` is `"ok"`, `checks.database` is `"connected"`, `uptime` > 0

### 1.2 Static Frontend Loads
```bash
curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/"
```
- **Expected:** `200`

---

## 2. Auth

### 2.1 Register
```bash
curl -sf -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -c cookie.txt \
  -d '{"username":"smoke_test_user","password":"SmokeT3st!x","displayName":"Smoke Test"}' | jq .
```
- **Expected:** `201`
- **Verify:** `id`, `username`, `role` (default `"agent"`), no `password` field

### 2.2 Login
```bash
curl -sf -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -c cookie.txt \
  -d '{"username":"smoke_test_user","password":"SmokeT3st!x"}' | jq .
```
- **Expected:** `200`
- **Verify:** `id`, `username`, `workspaceId`; no `password` field

### 2.3 Session
```bash
curl -sf "$BASE_URL/api/auth/me" -b cookie.txt | jq .
```
- **Expected:** `200`

### 2.4 Unauthenticated Rejection
```bash
curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api/auth/me"
```
- **Expected:** `401`

### 2.5 Logout
```bash
curl -sf -X POST "$BASE_URL/api/auth/logout" -b cookie.txt | jq .
```
- **Expected:** `200`

---

## 3. Core API

### 3.1 Vehicles
```bash
curl -sf "$BASE_URL/api/vehicles" -b cookie.txt | jq 'length'
```
- **Expected:** `200`, JSON array

### 3.2 Wash Queue (Public)
```bash
curl -sf "$BASE_URL/api/wash-queue" | jq 'length'
```
- **Expected:** `200`, JSON array

### 3.3 Repair Orders
```bash
curl -sf "$BASE_URL/api/repair-orders" -b cookie.txt | jq 'length'
```
- **Expected:** `200`

### 3.4 Dashboard Stats
```bash
curl -sf "$BASE_URL/api/dashboard-stats" -b cookie.txt | jq .
```
- **Expected:** `200`

---

## 4. Channels

### 4.1 List Channels
```bash
curl -sf "$BASE_URL/api/channels" -b cookie.txt | jq .
```
- **Expected:** `200`

### 4.2 Create Channel
```bash
curl -sf -X POST "$BASE_URL/api/channels" -b cookie.txt \
  -H "Content-Type: application/json" \
  -d '{"name":"smoke-chan","type":"public","description":"smoke test"}' | jq .
```
- **Expected:** `201`
- **Verify:** Response contains `id`, `name`, `slug`

### 4.3 Send Message
```bash
# Use the channel ID from 4.2
curl -sf -X POST "$BASE_URL/api/channels/1/messages" -b cookie.txt \
  -H "Content-Type: application/json" \
  -d '{"content":"smoke test message"}' | jq .
```
- **Expected:** `201`

### 4.4 List Members
```bash
curl -sf "$BASE_URL/api/channels/1/members" -b cookie.txt | jq .
```
- **Expected:** `200`

---

## 5. App Builder (Governed — admin only)

> **Important:** The correct endpoints use version-scoped paths.
> Create payload requires `graph` as an object, not top-level `nodes`/`edges`.

### 5.1 List Versions
```bash
curl -sf "$BASE_URL/api/app-graph/versions" -b cookie.txt | jq .
```
- **Expected:** `200`

### 5.2 Create Version (admin/supervisor)
```bash
curl -sf -X POST "$BASE_URL/api/app-graph/versions" -b cookie.txt \
  -H "Content-Type: application/json" \
  -d '{"label":"smoke-v","graph":{"nodes":[],"edges":[]}}' | jq .
```
- **Expected:** `201`
- **Verify:** Response contains `version`, `label`, `graph`

### 5.3 Apply Version (admin only)
```bash
# Use the version number from 5.2
curl -sf -X POST "$BASE_URL/api/app-graph/versions/1/apply" -b cookie.txt -w "\n%{http_code}\n"
```
- **Expected:** `200`

### 5.4 Rollback Version (admin only)
```bash
curl -sf -X POST "$BASE_URL/api/app-graph/versions/1/rollback" -b cookie.txt -w "\n%{http_code}\n"
```
- **Expected:** `200`

### 5.5 RBAC — Non-admin Blocked
```bash
# Login as a non-admin user first, then:
curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/app-graph/versions" \
  -b agent_cookie.txt -H "Content-Type: application/json" \
  -d '{"label":"bad","graph":{"nodes":[],"edges":[]}}'
```
- **Expected:** `403`

---

## 6. PWA Assets

### 6.1 Manifest
```bash
curl -sf "$BASE_URL/manifest.json" | jq '{name,display,icons: (.icons | length)}'
```
- **Expected:** `200`, `display` = `"standalone"`, icons count ≥ 1

### 6.2 Service Worker
```bash
curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/sw.js"
```
- **Expected:** `200`

---

## 7. WebSocket

```bash
curl -sf -o /dev/null -w "%{http_code}" \
  -H "Upgrade: websocket" \
  -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  "$BASE_URL/ws"
```
- **Expected:** `101` Switching Protocols

---

## 8. Background Tasks (admin only)

### 8.1 Task States
```bash
curl -sf "$BASE_URL/api/tasks" -b cookie.txt | jq .
```
- **Expected:** `200`
- **Verify:** Task IDs: `sla-breach-check`, `kpi-snapshots`, `anomaly-detection`, `connector-sync`, `export-processor`, `export-cleanup`

### 8.2 Manual Trigger
```bash
curl -sf -X POST "$BASE_URL/api/tasks/export-processor/trigger" -b cookie.txt | jq .
```
- **Expected:** `200`

---

## 9. Observability (admin only)

### 9.1 System Health
```bash
curl -sf "$BASE_URL/api/system-health" -b cookie.txt | jq .
```
- **Expected:** `200`
- **Verify:** `status` is `"operational"`, `checks.database` is `"connected"`

### 9.2 Metrics
```bash
curl -sf "$BASE_URL/api/metrics" -b cookie.txt | jq .
```
- **Expected:** `200`

---

## 10. Quick Pass/Fail Script

```bash
echo "=== SMOKE TEST ==="
echo -n "healthz:       "; curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/healthz"
echo ""
echo -n "register:      "; curl -sf -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/auth/register" -H "Content-Type: application/json" -c cookie.txt -d '{"username":"smoke_'$RANDOM'","password":"Sm0kePass!xx","displayName":"Smoker"}'
echo ""
echo -n "me:            "; curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api/auth/me" -b cookie.txt
echo ""
echo -n "vehicles:      "; curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api/vehicles" -b cookie.txt
echo ""
echo -n "wash-queue:    "; curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api/wash-queue"
echo ""
echo -n "repair-orders: "; curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api/repair-orders" -b cookie.txt
echo ""
echo -n "channels:      "; curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api/channels" -b cookie.txt
echo ""
echo -n "app-graph:     "; curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api/app-graph/versions" -b cookie.txt
echo ""
echo -n "manifest:      "; curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/manifest.json"
echo ""
echo -n "sw.js:         "; curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/sw.js"
echo ""
echo -n "dash-stats:    "; curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api/dashboard-stats" -b cookie.txt
echo ""
echo -n "system-health: "; curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api/system-health" -b cookie.txt
echo ""
echo -n "tasks:         "; curl -sf -o /dev/null -w "%{http_code}" "$BASE_URL/api/tasks" -b cookie.txt
echo ""
echo "=== END ==="
```

**Expected:** All lines show `200` (or `201` for register). Any `4xx`/`5xx` = investigate.

---

## 11. Cleanup

After smoke testing, remove the test user to avoid leaving temporary credentials:

```bash
# Delete the smoke test user (requires admin session cookie)
SMOKE_USER_ID=$(curl -sf "$BASE_URL/api/users" -b cookie.txt | jq '.[] | select(.username | startswith("smoke_")) | .id')
if [ -n "$SMOKE_USER_ID" ]; then
  curl -sf -X DELETE "$BASE_URL/api/users/$SMOKE_USER_ID" -b cookie.txt -w "\nDeleted user $SMOKE_USER_ID: %{http_code}\n"
fi
rm -f cookie.txt
```

**Verify:** No `smoke_*` users remain in `/api/users`.
