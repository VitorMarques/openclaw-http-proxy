# openclaw-http-proxy

Proxy HTTP para o OpenClaw Gateway que adiciona **execução sync/async configurável**, **observabilidade** (logs estruturados + métricas Prometheus) e **isolamento do upstream** (resiliente a timeouts do Cloudflare Free).

Mesma interface do OpenClaw gateway (`/v1/chat/completions`, `/v1/responses`, `/v1/models`, `/health`), com dois modos de execução:

| Modo | Comportamento | Uso |
|---|---|---|
| `sync` | Bloqueia até o OpenClaw responder, igual ao gateway | Chamadas curtas (< 100s) |
| `async` | Retorna 202 + `jobId` em <100ms, processa em background, entrega via webhook ou polling | Skills pesadas (>= 100s) |

O modo é controlado pelo header `X-Proxy-Mode: sync | async` ou pelo `PROXY_DEFAULT_MODE` no env.

---

## Quick start

### Local (dev)

```bash
npm install
npm run dev
# servidor em http://127.0.0.1:18791
```

### Docker

```bash
docker compose up -d
docker compose logs -f
```

### Systemd (sem Docker)

```bash
npm ci --omit=dev
npm run build
sudo useradd -r -s /bin/false openclaw-proxy 2>/dev/null || true
sudo cp systemd/openclaw-http-proxy.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-http-proxy
sudo systemctl status openclaw-http-proxy
```

---

## API

### Endpoints (idênticos ao OpenClaw gateway)

| Método | Path | Descrição |
|---|---|---|
| `POST` | `/v1/chat/completions` | OpenAI Chat Completions (sync ou async) |
| `POST` | `/v1/responses` | OpenResponses (sync ou async) |
| `GET`  | `/v1/models` | Lista modelos (pass-through) |
| `GET`  | `/v1/jobs/:id` | Status de um job async |
| `GET`  | `/v1/jobs` | Lista jobs (status, limit query) |
| `GET`  | `/health` | Liveness |
| `GET`  | `/ready` | Readiness (probe do upstream) |
| `GET`  | `/metrics` | Prometheus exposition format |

### Modo sync

```bash
curl -X POST http://127.0.0.1:18791/v1/chat/completions \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  -H "X-Proxy-Mode: sync" \
  -H "Content-Type: application/json" \
  -d '{"model":"openclaw/hades","messages":[{"role":"user","content":"ping"}]}'
```

### Modo async

```bash
# Submit
curl -X POST http://127.0.0.1:18791/v1/chat/completions \
  -H "Authorization: Bearer $OPENCLAW_GATEWAY_TOKEN" \
  -H "X-Proxy-Mode: async" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openclaw/minerva",
    "messages": [{"role":"user","content":"..."}],
    "webhook_url": "https://my-app.com/callbacks/job",
    "webhook_headers": { "X-Signature": "abc" }
  }'

# → 202 Accepted
# {
#   "jobId": "job_AbC123XyZ",
#   "status": "queued",
#   "mode": "async",
#   "createdAt": "2026-06-08T01:30:00.000Z",
#   "links": {
#     "self": "http://127.0.0.1:18791/v1/jobs/job_AbC123XyZ",
#     "webhook": "https://my-app.com/callbacks/job"
#   }
# }
```

### Polling

```bash
curl http://127.0.0.1:18791/v1/jobs/job_AbC123XyZ
# {
#   "id": "job_AbC123XyZ",
#   "status": "complete",
#   "result": { "status": 200, "data": {...} },
#   "durationMs": 98823
# }
```

### Webhook (entrega de resultado)

POST no `webhook_url` configurado, com payload:

```json
{
  "jobId": "job_AbC123XyZ",
  "status": "complete",
  "mode": "async",
  "createdAt": "2026-06-08T01:30:00Z",
  "completedAt": "2026-06-08T01:31:39Z",
  "durationMs": 98823,
  "result": { "status": 200, "data": {...} }
}
```

Headers do webhook:
- `X-Idempotency-Key: <jobId>` (mesmo valor em retries)
- `X-Proxy-Event: job.complete | job.error`
- `webhook_headers` do body são forwarded (útil pra auth do seu app)

Retry: 1s, 2s, 4s (default). 2xx encerra.

---

## Headers propagados (pass-through)

O proxy reenvia pro OpenClaw sem alteração:

| Header | Origem |
|---|---|
| `Authorization` | bearer do gateway |
| `CF-Access-Client-Id` | service token Cloudflare Access |
| `CF-Access-Client-Secret` | service token secret |
| `x-openclaw-agent-id` | roteamento de agente |
| `x-openclaw-model` | override de modelo |
| `x-openclaw-session-key` | session pinning |
| `x-openclaw-message-channel` | canal de ingress |
| `x-openclaw-scopes` | scopes |

Header próprio: `X-Proxy-Mode: sync | async` (default = `PROXY_DEFAULT_MODE`).

---

## Configuração (env)

Veja `.env.example`. Variáveis principais:

| Var | Default | Descrição |
|---|---|---|
| `PORT` | `18791` | porta do proxy |
| `LOG_LEVEL` | `info` | pino level |
| `OPENCLAW_URL` | `http://127.0.0.1:18789` | URL do OpenClaw gateway |
| `OPENCLAW_TIMEOUT_MS` | `600000` | timeout upstream (10 min) |
| `PROXY_DEFAULT_MODE` | `sync` | `sync` ou `async` |
| `JOB_MAX_ATTEMPTS` | `3` | tentativas por job |
| `JOB_RETRY_DELAY_MS` | `2000` | backoff base (exponencial) |
| `JOB_RESULT_TTL_MS` | `3600000` | retenção de job (1h) |
| `JOB_CLEANUP_INTERVAL_MS` | `300000` | intervalo do cleanup |
| `WEBHOOK_TIMEOUT_MS` | `10000` | timeout por tentativa de webhook |
| `WEBHOOK_MAX_RETRIES` | `3` | retries de webhook |
| `TRUST_FORWARDED_AUTH` | `true` | se true, aceita auth já validada por proxy anterior |

---

## Observabilidade

### Logs (Pino, JSON em prod)

```json
{"level":"info","time":"2026-06-08T01:30:00Z","service":"openclaw-http-proxy","requestId":"abc","jobId":"job_X","msg":"job complete","durationMs":98823}
```

Em dev usa `pino-pretty` colorido. Em prod, JSON puro pra ELK/Loki/Datadog.

Campos sensíveis (Authorization, CF-Access-Client-Secret, tokens) são **redacted** automaticamente.

### Métricas (Prometheus em `/metrics`)

- `http_requests_total{method,route,status}` — contador
- `http_request_duration_seconds{method,route,status}` — histograma
- `jobs_submitted_total{mode}` — jobs submetidos
- `jobs_completed_total{mode,status}` — jobs terminados
- `jobs_in_flight{mode}` — gauge de jobs rodando
- `job_duration_seconds{mode,status}` — histograma de duração
- `webhook_delivery_total{result}` — success/failure de webhook
- `openclaw_upstream_duration_seconds{path,status}` — latência pro OpenClaw

Default do `prom-client` (CPU, memória, event loop) também incluído.

Scrape config Prometheus:

```yaml
- job_name: 'openclaw-http-proxy'
  scrape_interval: 15s
  static_configs:
    - targets: ['openclaw-http-proxy:18791']
```

### Health

- `GET /health` — liveness, sempre 200 se processo tá vivo
- `GET /ready` — readiness, faz probe no OpenClaw (timeout 2s)

---

## Desenvolvimento

### Testes

```bash
npm test                # roda tudo
npm run test:watch      # watch mode
npm run test:coverage   # com coverage
```

Cobertura: services (jobStore, openclawClient, webhookDispatcher, jobProcessor) + integration das rotas.

### Lint + format

```bash
npm run lint
npm run lint:fix
npm run format
```

### Build

```bash
npm run build           # gera dist/
npm run typecheck       # só tsc, sem emit
```

---

## Arquitetura

```
┌──────────┐    POST /v1/chat/completions     ┌──────────────────┐
│ Cliente  │ ───────────────────────────────▶ │ openclaw-http-   │
└──────────┘                                  │ proxy            │
                                              │                  │
                                              │ ┌──────────────┐ │
                                              │ │ Router       │ │
                                              │ └──────┬───────┘ │
                                              │        │         │
                                              │ ┌──────▼───────┐ │
                                              │ │ Mode: sync?  │ │
                                              │ └──┬────────┬──┘ │
                                              │    │ sim    │ não│
                                              │    │        └────┘
                                              │    ▼             ▼
                                              │ OpenClaw     JobStore
                                              │ Client       + Processor
                                              │    │             │
                                              │    │   ┌─────────┘
                                              │    │   │ webhook
                                              │    ▼   ▼
                                              │ ┌────────────────┐
                                              │ │ OpenClaw       │
                                              │ │ gateway        │
                                              │ └────────────────┘
                                              └──────────────────┘
```

### Design patterns

- **Repository**: `JobStore` (interface) + `InMemoryJobStore` (impl). Trocar por Redis/Postgres é só nova impl.
- **Strategy**: modo `sync` vs `async` decidido por header/factory no router.
- **Dependency Injection**: `createApp(deps)` recebe tudo injetado, facilita testes.
- **Factory**: `create<Route>Router(deps)` pattern.
- **Middleware**: auth, request context, logger, metrics, error handler.

---

## Segurança

- Bearer token + CF-Access headers pass-through (não cria credencial nova)
- `Authorization`, `CF-Access-Client-Secret` redacted em logs
- Trust proxy configurável — se atrás de um ID-aware proxy, não precisa re-autenticar
- Webhook delivery com idempotency key (safe to retry no seu handler)
- `helmet`-equivalente: `x-powered-by` desligado, request body size limit (2MB default)
- `validateStatus: () => true` no axios — proxy nunca crasha por 4xx/5xx do upstream

---

## License

MIT
