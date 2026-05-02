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
            CREATE TABLE IF NOT EXISTS managed_quota_grants (
              id TEXT PRIMARY KEY,
              customer_id TEXT NOT NULL REFERENCES managed_customers(id) ON DELETE CASCADE,
              credits INTEGER NOT NULL,
              reason TEXT NOT NULL,
              operator TEXT NOT NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
