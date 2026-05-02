import { hashAccessCode } from '../server/auth.js'
import { randomSecret } from '../server/ids.js'
import { getManagedGatewayStore } from '../server/store/index.js'

function parseArgs(argv) {
  const [command, ...rest] = argv
  const args = { _: command ?? '' }
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index]
    if (!current.startsWith('--')) continue
    const key = current.slice(2)
    const next = rest[index + 1]
    args[key] = next && !next.startsWith('--') ? next : 'true'
    if (next && !next.startsWith('--')) {
      index += 1
    }
  }
  return args
}

function printUsage() {
  console.log(`Usage:
  npm run gateway:admin -- create-customer --email customer@example.com --name "Customer" [--credits 100] [--access-code custom-code]
  npm run gateway:admin -- grant-credits --customer-id customer_xxx --credits 50 [--reason "manual recharge"] [--operator admin]
  npm run gateway:admin -- list-customers`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const store = getManagedGatewayStore()

  if (args._ === 'create-customer') {
    if (!args.email) {
      throw new Error('缺少 --email')
    }
    const accessCode = args['access-code'] || randomSecret(10)
    const customer = await store.createCustomer({
      email: String(args.email).trim().toLowerCase(),
      name: String(args.name || String(args.email).split('@')[0]),
      accessCodeHash: hashAccessCode(String(accessCode)),
      remainingCredits: Number.parseInt(String(args.credits || '0'), 10) || 0,
    })
    console.log(JSON.stringify({
      customer,
      accessCode,
    }, null, 2))
    return
  }

  if (args._ === 'grant-credits') {
    if (!args['customer-id']) {
      throw new Error('缺少 --customer-id')
    }
    if (!args.credits) {
      throw new Error('缺少 --credits')
    }
    const customer = await store.grantCredits({
      customerId: String(args['customer-id']),
      credits: Number.parseInt(String(args.credits), 10),
      reason: String(args.reason || 'manual grant'),
      operator: String(args.operator || 'cli'),
    })
    console.log(JSON.stringify({ customer }, null, 2))
    return
  }

  if (args._ === 'list-customers') {
    const customers = await store.listCustomers()
    console.log(JSON.stringify({ customers }, null, 2))
    return
  }

  printUsage()
  process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
