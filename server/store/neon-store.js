import { randomId } from '../ids.js'

function toPublicCustomer(record) {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    remainingCredits: Number(record.remaining_credits),
    status: record.status === 'disabled' ? 'disabled' : 'active',
  }
}

export function createNeonStore(databaseUrl, neonFactory) {
  const sql = neonFactory(databaseUrl)
  let schemaPromise = null

  async function ensureSchema() {
    if (!schemaPromise) {
      schemaPromise = (async () => {
        await sql.transaction([
          sql`
            CREATE TABLE IF NOT EXISTS managed_customers (
              id TEXT PRIMARY KEY,
              email TEXT UNIQUE NOT NULL,
              name TEXT NOT NULL,
              access_code_hash TEXT NOT NULL,
              remaining_credits INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'active',
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `,
          sql`
            CREATE TABLE IF NOT EXISTS managed_sessions (
              id TEXT PRIMARY KEY,
              customer_id TEXT NOT NULL REFERENCES managed_customers(id) ON DELETE CASCADE,
              token_hash TEXT UNIQUE NOT NULL,
              expires_at TIMESTAMPTZ NOT NULL,
              revoked_at TIMESTAMPTZ,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `,
          sql`
            CREATE TABLE IF NOT EXISTS managed_usage_logs (
              id TEXT PRIMARY KEY,
              customer_id TEXT NOT NULL REFERENCES managed_customers(id) ON DELETE CASCADE,
              credits_delta INTEGER NOT NULL,
              provider_key TEXT NOT NULL,
              provider_label TEXT NOT NULL,
              provider_model TEXT NOT NULL,
              image_count INTEGER NOT NULL DEFAULT 1,
              status TEXT NOT NULL,
              prompt_preview TEXT NOT NULL,
              error_message TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `,
          sql`
            CREATE TABLE IF NOT EXISTS managed_anonymous_usage_logs (
              id TEXT PRIMARY KEY,
              provider_key TEXT NOT NULL,
              provider_label TEXT NOT NULL,
              provider_model TEXT NOT NULL,
              image_count INTEGER NOT NULL DEFAULT 1,
              status TEXT NOT NULL,
              prompt_preview TEXT NOT NULL,
              error_message TEXT,
              trial_remaining INTEGER,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `,
          sql`
            CREATE TABLE IF NOT EXISTS managed_quota_grants (
              id TEXT PRIMARY KEY,
              customer_id TEXT NOT NULL REFERENCES managed_customers(id) ON DELETE CASCADE,
              credits INTEGER NOT NULL,
              reason TEXT NOT NULL,
              operator TEXT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `,
          sql`
            CREATE TABLE IF NOT EXISTS managed_anonymous_trials (
              ip_hash TEXT PRIMARY KEY,
              used_count INTEGER NOT NULL,
              window_started_at TIMESTAMPTZ NOT NULL,
              updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
          `,
        ])
      })()
    }
    await schemaPromise
  }

  return {
    async authenticateCustomer(email, accessCodeHash) {
      await ensureSchema()
      const rows = await sql`
        SELECT id, email, name, remaining_credits, status
        FROM managed_customers
        WHERE lower(email) = lower(${email})
          AND access_code_hash = ${accessCodeHash}
          AND status = 'active'
        LIMIT 1
      `
      return rows[0] ? toPublicCustomer(rows[0]) : null
    },

    async createCustomer({ email, name, accessCodeHash, remainingCredits }) {
      await ensureSchema()
      const normalizedEmail = email.toLowerCase()
      const rows = await sql`
        INSERT INTO managed_customers (id, email, name, access_code_hash, remaining_credits, status)
        VALUES (${randomId('customer')}, ${normalizedEmail}, ${name}, ${accessCodeHash}, ${remainingCredits}, 'active')
        RETURNING id, email, name, remaining_credits, status
      `
      return toPublicCustomer(rows[0])
    },

    async listCustomers() {
      await ensureSchema()
      const rows = await sql`
        SELECT id, email, name, remaining_credits, status
        FROM managed_customers
        ORDER BY created_at ASC
      `
      return rows.map(toPublicCustomer)
    },

    async deleteCustomer(customerId) {
      await ensureSchema()
      const rows = await sql`
        DELETE FROM managed_customers
        WHERE id = ${customerId}
        RETURNING id, email, name, remaining_credits, status
      `
      if (!rows[0]) {
        throw new Error('客户不存在')
      }
      return toPublicCustomer(rows[0])
    },

    async listUsageLogs(limit = 20) {
      await ensureSchema()
      const rows = await sql.query(`
        SELECT *
        FROM (
          SELECT
            l.id,
            l.customer_id,
            c.email AS customer_email,
            c.name AS customer_name,
            'customer' AS audience,
            l.credits_delta,
            l.provider_key,
            l.provider_label,
            l.provider_model,
            l.image_count,
            l.status,
            l.prompt_preview,
            l.error_message,
            NULL::INTEGER AS trial_remaining,
            l.created_at
          FROM managed_usage_logs l
          JOIN managed_customers c ON c.id = l.customer_id

          UNION ALL

          SELECT
            l.id,
            '' AS customer_id,
            '' AS customer_email,
            '' AS customer_name,
            'anonymous' AS audience,
            0 AS credits_delta,
            l.provider_key,
            l.provider_label,
            l.provider_model,
            l.image_count,
            l.status,
            l.prompt_preview,
            l.error_message,
            l.trial_remaining,
            l.created_at
          FROM managed_anonymous_usage_logs l
        ) logs
        ORDER BY created_at DESC
        LIMIT $1
      `, [limit])

      return rows.map((row) => ({
        id: row.id,
        customerId: row.customer_id,
        customerEmail: row.customer_email,
        customerName: row.customer_name,
        audience: row.audience === 'anonymous' ? 'anonymous' : 'customer',
        creditsDelta: Number(row.credits_delta),
        providerKey: row.provider_key,
        providerLabel: row.provider_label,
        providerModel: row.provider_model,
        imageCount: Number(row.image_count),
        status: row.status,
        promptPreview: row.prompt_preview,
        errorMessage: row.error_message,
        trialRemaining: row.trial_remaining == null ? null : Number(row.trial_remaining),
        createdAt: new Date(row.created_at).toISOString(),
      }))
    },

    async createSession({ customerId, tokenHash, expiresAt }) {
      await ensureSchema()
      const rows = await sql`
        INSERT INTO managed_sessions (id, customer_id, token_hash, expires_at)
        VALUES (${randomId('session')}, ${customerId}, ${tokenHash}, ${expiresAt})
        RETURNING id, customer_id, token_hash, expires_at, revoked_at, created_at
      `
      return rows[0]
    },

    async getSessionWithCustomer(tokenHash) {
      await ensureSchema()
      const rows = await sql`
        SELECT
          s.id AS session_id,
          s.customer_id,
          s.expires_at,
          c.id,
          c.email,
          c.name,
          c.remaining_credits,
          c.status
        FROM managed_sessions s
        JOIN managed_customers c ON c.id = s.customer_id
        WHERE s.token_hash = ${tokenHash}
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
          AND c.status = 'active'
        LIMIT 1
      `
      if (!rows[0]) return null
      return {
        session: {
          id: rows[0].session_id,
          customerId: rows[0].customer_id,
          expiresAt: rows[0].expires_at,
        },
        customer: toPublicCustomer(rows[0]),
      }
    },

    async revokeSession(tokenHash) {
      await ensureSchema()
      await sql`
        UPDATE managed_sessions
        SET revoked_at = NOW()
        WHERE token_hash = ${tokenHash}
          AND revoked_at IS NULL
      `
    },

    async getAnonymousTrialBalance({ ipHash, limit, windowMs }) {
      await ensureSchema()
      const rows = await sql.query(`
        SELECT
          used_count,
          window_started_at,
          CASE
            WHEN window_started_at + ($2 || ' milliseconds')::interval <= NOW() THEN $3
            ELSE GREATEST(0, $3 - used_count)
          END AS remaining_credits,
          CASE
            WHEN window_started_at + ($2 || ' milliseconds')::interval <= NOW() THEN NULL
            ELSE (window_started_at + ($2 || ' milliseconds')::interval)
          END AS reset_at
        FROM managed_anonymous_trials
        WHERE ip_hash = $1
        LIMIT 1
      `, [ipHash, windowMs, limit])

      if (!rows[0]) {
        return {
          remainingCredits: limit,
          limit,
          resetAt: null,
        }
      }

      return {
        remainingCredits: Number(rows[0].remaining_credits),
        limit,
        resetAt: rows[0].reset_at ? new Date(rows[0].reset_at).toISOString() : null,
      }
    },

    async consumeAnonymousTrial({ ipHash, limit, windowMs }) {
      await ensureSchema()
      const rows = await sql.query(`
        INSERT INTO managed_anonymous_trials (ip_hash, used_count, window_started_at, updated_at)
        VALUES ($1, 1, NOW(), NOW())
        ON CONFLICT (ip_hash) DO UPDATE
        SET
          used_count = CASE
            WHEN managed_anonymous_trials.window_started_at + ($3 || ' milliseconds')::interval <= NOW() THEN 1
            ELSE managed_anonymous_trials.used_count + 1
          END,
          window_started_at = CASE
            WHEN managed_anonymous_trials.window_started_at + ($3 || ' milliseconds')::interval <= NOW() THEN NOW()
            ELSE managed_anonymous_trials.window_started_at
          END,
          updated_at = NOW()
        WHERE managed_anonymous_trials.window_started_at + ($3 || ' milliseconds')::interval <= NOW()
          OR managed_anonymous_trials.used_count < $2
        RETURNING
          used_count,
          window_started_at,
          (window_started_at + ($3 || ' milliseconds')::interval) AS reset_at
      `, [ipHash, limit, windowMs])

      if (!rows[0]) {
        throw new Error('免费试用额度已用完，请登录后继续生成')
      }

      return {
        remainingCredits: Math.max(0, limit - Number(rows[0].used_count)),
        limit,
        resetAt: new Date(rows[0].reset_at).toISOString(),
      }
    },

    async consumeCreditsAndLog({ customerId, credits, usageLog }) {
      await ensureSchema()
      const rows = await sql.query(`
        WITH updated AS (
          UPDATE managed_customers
          SET remaining_credits = remaining_credits - $2, updated_at = NOW()
          WHERE id = $1
            AND status = 'active'
            AND remaining_credits >= $2
          RETURNING id, email, name, remaining_credits, status
        ),
        logged AS (
          INSERT INTO managed_usage_logs (
            id,
            customer_id,
            credits_delta,
            provider_key,
            provider_label,
            provider_model,
            image_count,
            status,
            prompt_preview,
            error_message
          )
          SELECT
            $3,
            updated.id,
            $4,
            $5,
            $6,
            $7,
            $8,
            'success',
            $9,
            NULL
          FROM updated
        )
        SELECT * FROM updated
      `, [
        customerId,
        credits,
        usageLog.id,
        -credits,
        usageLog.providerKey,
        usageLog.providerLabel,
        usageLog.providerModel,
        usageLog.imageCount,
        usageLog.promptPreview,
      ])

      if (!rows[0]) {
        throw new Error('额度不足')
      }
      return toPublicCustomer(rows[0])
    },

    async recordFailedUsage({ customerId, usageLog }) {
      await ensureSchema()
      await sql`
        INSERT INTO managed_usage_logs (
          id,
          customer_id,
          credits_delta,
          provider_key,
          provider_label,
          provider_model,
          image_count,
          status,
          prompt_preview,
          error_message
        )
        VALUES (
          ${usageLog.id},
          ${customerId},
          0,
          ${usageLog.providerKey},
          ${usageLog.providerLabel},
          ${usageLog.providerModel},
          ${usageLog.imageCount},
          'failed',
          ${usageLog.promptPreview},
          ${usageLog.errorMessage ?? null}
        )
      `
    },

    async recordAnonymousUsage({ usageLog }) {
      await ensureSchema()
      await sql`
        INSERT INTO managed_anonymous_usage_logs (
          id,
          provider_key,
          provider_label,
          provider_model,
          image_count,
          status,
          prompt_preview,
          error_message,
          trial_remaining
        )
        VALUES (
          ${usageLog.id},
          ${usageLog.providerKey},
          ${usageLog.providerLabel},
          ${usageLog.providerModel},
          ${usageLog.imageCount},
          ${usageLog.status},
          ${usageLog.promptPreview},
          ${usageLog.errorMessage ?? null},
          ${usageLog.trialRemaining ?? null}
        )
      `
    },

    async grantCredits({ customerId, credits, reason, operator }) {
      await ensureSchema()
      const rows = await sql.query(`
        WITH updated AS (
          UPDATE managed_customers
          SET remaining_credits = remaining_credits + $2, updated_at = NOW()
          WHERE id = $1
          RETURNING id, email, name, remaining_credits, status
        ),
        logged AS (
          INSERT INTO managed_quota_grants (id, customer_id, credits, reason, operator)
          SELECT $3, updated.id, $2, $4, $5 FROM updated
        )
        SELECT * FROM updated
      `, [customerId, credits, randomId('grant'), reason, operator])

      if (!rows[0]) {
        throw new Error('客户不存在')
      }
      return toPublicCustomer(rows[0])
    },
  }
}
