# Notempus Deployment Roadmap
**Status**: Planning Phase | **Last Updated**: April 11, 2026

---

## Executive Summary

Deploy Notempus from zero to production using Docker, starting free and scaling sustainably.

### ⚠️ Critical Issues with Original Plan
1. ❌ **No CI/CD pipeline** - How does code get deployed automatically?
2. ❌ **Database in Docker** - PostgreSQL in containers = data loss on restart
3. ❌ **No secrets management** - .env file in repo is security risk
4. ❌ **No staging environment** - Testing directly on production?
5. ❌ **No backup strategy** - User data with no redundancy
6. ❌ **No automated deployments** - Manual deployments only
7. ❌ **No monitoring/alerting** - Errors go unnoticed
8. ❌ **No rate limiting** - Vulnerable to abuse

---

## 🚀 IMPROVED Deployment Roadmap

### Phase 1: Foundation (Week 1–2)
**Goal**: Infrastructure + CI/CD ready for first deployment

#### 1.1 Local Development ✅ (Already Done)
- [x] Docker Compose working locally
- [x] All services running (web, api-gateway, services, postgres, redis)
- [x] Hot reload for rapid iteration
- [x] Database migrations working

#### 1.2 CI/CD Setup (Recommended: GitHub Actions)
```bash
# Create .github/workflows/deploy.yml
# Triggers on: push to main, pull request
# Steps:
#   1. Run tests & type-check
#   2. Build & push Docker images to GitHub Container Registry
#   3. Update deployment (if on main)
```

**Why GitHub Actions?**
- ✅ Free for public repos
- ✅ 2000 free CI/CD minutes/month
- ✅ Native GitHub integration
- ✅ Can deploy to any cloud

#### 1.3 Secrets Management
```bash
# Use GitHub Secrets (not .env in repo)
POSTGRES_PASSWORD
DATABASE_URL
JWT_SECRET
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
```

**File Structure:**
```
.env.example          # Template only (no secrets)
.env.local            # Local only (gitignored)
.env.production       # On server only (Docker env vars)
```

#### 1.4 Database Strategy
**Option A (Recommended for Phase 1)**: Managed PostgreSQL
- DigitalOcean: $5/month (1 GB RAM, 15 GB storage)
- AWS RDS: Free tier available
- Railway: $5/month, super easy

**Benefits:**
- ✅ Automatic backups
- ✅ Managed patches
- ✅ No manual maintenance
- ✅ Connection pooling included
- ✅ Snapshots available

**Option B (If budget-constrained)**: Self-hosted
- Run PostgreSQL in Docker volume
- Daily backups to S3
- Only if you have ~6 months experience

#### 1.5 Server Selection
**Best Options (in order of recommendation):**

| Platform | Cost | Pros | Cons |
|----------|------|------|------|
| **Railway** | $5–20 | Easiest, GitHub integration, auto-SSL | More expensive |
| **Fly.io** | $6–15 | Global, auto-scaling, amazing DX | Less battery-tested |
| **DigitalOcean App Platform** | $12+ | Managed, reliable, simple | Overkill for starting |
| **DigitalOcean Droplet + Docker** | $5–6 | Super cheap, full control | Manual everything |

**Recommendation for Week 1:** Railway or Fly.io
- Both handle Docker automatically
- Both have free tier for testing
- Both include HTTPS by default
- Both auto-scale with traffic

---

### Phase 2: Production Hardening (Week 3–4)
**Goal**: Secure, monitored, scalable production

#### 2.1 Docker Best Practices
```dockerfile
# ✅ Multi-stage builds (reduce image size)
# ✅ Non-root user (security)
# ✅ Health checks (auto-restart)
# ✅ Resource limits (prevent crashes)
# ✅ Read-only root filesystem (advanced)
```

#### 2.2 Monitoring & Logging
```bash
# Option A: Datadog (free tier available)
- Application performance monitoring
- Error tracking
- Log aggregation

# Option B: Sentry (free tier)
- Exception tracking
- Error alerts
- Stack traces

# Option C: Pino + CloudWatch
- Structured logging
- Free with AWS
```

**Essential Alerts:**
- ❌ Service crashes
- ❌ Memory > 80%
- ❌ Response time > 1s
- ❌ Error rate > 1%
- ❌ Database connection failed
- ❌ WebSocket disconnects > 10%

#### 2.3 Security Hardening
```bash
# ✅ HTTPS only (managed by Railway/Fly.io)
# ✅ CSP headers (prevent XSS)
# ✅ CORS properly configured
# ✅ Rate limiting per IP (10 req/sec)
# ✅ SQL injection prevention (already using parameterized queries)
# ✅ JWT expiration (15 min + refresh tokens)
# ✅ Password hashing (bcrypt, not plain text)
```

#### 2.4 Backup Strategy
```bash
# Daily automated backups
# - PostgreSQL: managed platform handles this
# - Redis sessions: not critical (can recreate)
# - User uploads: if added, use S3 with versioning

# Retention: Keep 30 days
# Test restore: Monthly dry-run
```

#### 2.5 Environment Parity
```bash
# Dev   → Local Docker Compose
# Stage → Cloud (mirror of production)
# Prod  → Cloud (production server)

# Same Docker images across all
# Different .env for each environment
```

---

### Phase 3: Scalability (Month 2+)
**Goal**: Handle 1,000+ concurrent users

#### 3.1 Database Scaling
```bash
# Current: Single PostgreSQL
# Target: Replica + Load balancer
# Tools: pg_basebackup or managed replicas

# Read replicas for:
# - Backups
# - Analytics queries
# - High availability
```

#### 3.2 Service Splitting
```bash
# Current: All services in one server
# Target: Services on separate servers

# Separate servers for:
# - API Gateway    (handles traffic)
# - WebSocket Core (signaling)
# - Workers        (matching, billing tasks)
```

#### 3.3 Caching Layer
```bash
# Current: Redis in Docker
# Target: Redis cluster or hosted

# Cache everything:
# - User profiles (5 min TTL)
# - Match suggestions (10 min TTL)
# - Rate limiting (1 min TTL)
```

#### 3.4 Content Delivery
```bash
# Add CDN for static assets
# - Cloudflare (free tier)
# - AWS CloudFront
# - Bunny CDN

# Reduces server load by ~70%
```

---

## 📋 Complete Phase 1 Checklist (Weeks 1–2)

### Week 1: Infrastructure Setup
- [ ] Choose hosting platform (Railway or Fly.io recommended)
- [ ] Create account and link GitHub
- [ ] Create PostgreSQL database (managed)
- [ ] Create Redis instance (optional, can use platform's built-in)
- [ ] Note connection strings

### Week 1: Secrets & Configuration
- [ ] Copy CHANGELOG.md to deployment docs
- [ ] Create `.env.example` template
- [ ] Add GitHub Secrets (all sensitive vars)
- [ ] Update docker-compose.prod.yml with managed DB URLs
- [ ] Test locally with production config

### Week 1: CI/CD Pipeline
- [ ] Create `.github/workflows/build.yml`
  - Run `pnpm typecheck` ✅
  - Run tests (if available)
  - Build Docker images
  - Push to GitHub Container Registry
  
- [ ] Create `.github/workflows/deploy.yml`
  - Deploy to Railway/Fly.io on main branch
  - Run database migrations pre-deploy
  - Health check post-deploy

### Week 2: Production Hardening
- [ ] Add health check endpoint `/health` ✅ (already exists)
- [ ] Add graceful shutdown (30s drain period)
- [ ] Set resource limits:
  - Web: 512MB RAM limit
  - Services: 256MB each
  - Database: 1GB
  
- [ ] Add logging:
  - Pino structured logging
  - CloudWatch/Datadog integration
  - 7-day retention
  
- [ ] Add monitoring:
  - CPU/Memory/Disk alerts
  - Error rate > 1% alert
  - Response time > 1s alert

### Week 2: Data & Security
- [ ] Database automated backups (daily)
- [ ] Test restore process
- [ ] Add rate limiting (middleware)
- [ ] Review CORS settings
- [ ] Enable HTTPS only
- [ ] Set security headers

### Week 2: Testing Pre-Deploy
- [ ] Deploy to staging first
- [ ] Test all critical flows:
  - Guest chat matching
  - Profile creation
  - Payment webhook
  - WebSocket connections
  
- [ ] Load test with 100 concurrent users
- [ ] Check error logs for issues
- [ ] Verify backups working

---

## 🧩 Recommended Architecture (Day 1)

```
┌─ GitHub (code) ─────────────────────┐
│  • Repository                       │
│  • CI/CD Workflows                  │
│  • Container Registry               │
└─────────────────────────────────────┘
                 ↓
┌─ Railway / Fly.io ──────────────────┐
│  • Web Service (Next.js)            │
│  • API Services (Fastify)           │
│  • Redis (built-in)                 │
│  • SSL/TLS (automatic)              │
│  • Custom Domain                    │
└─────────────────────────────────────┘
                 ↓
         ┌─ PostgreSQL ─┐
         │ (Managed DB) │
         └──────────────┘
```

---

## 💰 Cost Breakdown (Month 1)

| Item | Cost | Notes |
|------|------|-------|
| Domain | $0–10 | Free GitHub Pack or $0.80/yr Namecheap |
| Cloud Server | $5–12 | Railway/Fly.io starter tier |
| PostgreSQL | $0–15 | Managed tier or free trial |
| Redis | $0 | Built-in to Railway/Fly.io |
| **Total** | **$5–37/month** | Scales with users |

---

## ⚠️ What NOT to Do

| ❌ Don't | ✅ Do Instead |
|---------|--------------|
| Store secrets in .env | Use platform secrets/GitHub Secrets |
| Run PostgreSQL in Docker container | Use managed database |
| Manual deployments | Use CI/CD for every commit |
| Skip backups | Automated daily backups |
| Ignore error logs | Set up monitoring + alerts |
| One server for everything | Split services by tier |
| No SSL/TLS | Enable HTTPS from day 1 |
| Reinvent the wheel | Use managed platforms |

---

## 📚 Resources

### Learning Path
1. **Docker Basics**: https://docker.com/resources/what-container
2. **GitHub Actions**: https://github.com/features/actions
3. **Railway Docs**: https://docs.railway.app
4. **PostgreSQL Ops**: https://www.postgresql.org/docs

### Tools to Use
- **Railway**: Easiest, all-in-one
- **Fly.io**: Global edge compute
- **Render**: Simpler alternative
- **Heroku**: (paid but simple)

---

## 🎯 Next Steps

### Immediate (This Week)
1. [ ] Review this document
2. [ ] Choose hosting platform
3. [ ] Create production PostgreSQL
4. [ ] Set up GitHub Secrets
5. [ ] Create CI/CD workflow

### Short Term (Next Week)
1. [ ] Deploy to staging
2. [ ] Add monitoring
3. [ ] Run load tests
4. [ ] Deploy to production
5. [ ] Monitor for 24 hours

### Success Criteria
- ✅ App live on custom domain
- ✅ HTTPS working
- ✅ Database persistent
- ✅ Logs aggregated
- ✅ Errors tracked
- ✅ Backups automated
- ✅ < 1 hour to deploy

---

## 📞 Support

If deployment fails:
1. Check GitHub Actions logs
2. Review platform logs (Railway/Fly.io dashboard)
3. Verify .env variables are set
4. Check database connectivity
5. Run health endpoints manually

---

**Document Status**: Ready for implementation
**Last Review**: April 11, 2026
**Next Review**: After first production deployment
