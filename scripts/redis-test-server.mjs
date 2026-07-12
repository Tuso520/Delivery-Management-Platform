import { createServer } from 'node:net'

const host = process.env.TEST_REDIS_HOST || '127.0.0.1'
const port = Number(process.env.TEST_REDIS_PORT || 36379)
const values = new Map()
const expiresAt = new Map()

function bulk(value) {
  if (value === null || value === undefined) return '$-1\r\n'
  const text = String(value)
  return `$${Buffer.byteLength(text)}\r\n${text}\r\n`
}

function integer(value) {
  return `:${value}\r\n`
}

function readValue(key) {
  const expiry = expiresAt.get(key)
  if (expiry !== undefined && expiry <= Date.now()) {
    values.delete(key)
    expiresAt.delete(key)
    return null
  }
  return values.get(key) ?? null
}

function parseCommands(state, chunk) {
  state.buffer = Buffer.concat([state.buffer, chunk])
  const commands = []
  let offset = 0
  while (offset < state.buffer.length) {
    if (state.buffer[offset] !== 42) break
    const arrayEnd = state.buffer.indexOf('\r\n', offset)
    if (arrayEnd < 0) break
    const count = Number(state.buffer.subarray(offset + 1, arrayEnd).toString())
    let cursor = arrayEnd + 2
    const parts = []
    let complete = true
    for (let index = 0; index < count; index += 1) {
      if (cursor >= state.buffer.length || state.buffer[cursor] !== 36) {
        complete = false
        break
      }
      const sizeEnd = state.buffer.indexOf('\r\n', cursor)
      if (sizeEnd < 0) {
        complete = false
        break
      }
      const size = Number(state.buffer.subarray(cursor + 1, sizeEnd).toString())
      const valueStart = sizeEnd + 2
      const valueEnd = valueStart + size
      if (valueEnd + 2 > state.buffer.length) {
        complete = false
        break
      }
      parts.push(state.buffer.subarray(valueStart, valueEnd).toString())
      cursor = valueEnd + 2
    }
    if (!complete) break
    commands.push(parts)
    offset = cursor
  }
  state.buffer = state.buffer.subarray(offset)
  return commands
}

function execute(parts) {
  const command = parts[0]?.toUpperCase()
  if (command === 'PING') return parts[1] ? bulk(parts[1]) : '+PONG\r\n'
  if (command === 'CLIENT' || command === 'SELECT' || command === 'AUTH') return '+OK\r\n'
  if (command === 'INFO') return bulk('# Server\r\nredis_version:7.0.0-test\r\n')
  if (command === 'QUIT') return '+OK\r\n'
  if (command === 'GET') return bulk(readValue(parts[1]))
  if (command === 'DEL') {
    let removed = 0
    for (const key of parts.slice(1)) {
      if (readValue(key) !== null) removed += 1
      values.delete(key)
      expiresAt.delete(key)
    }
    return integer(removed)
  }
  if (command === 'SET') {
    const key = parts[1]
    values.set(key, parts[2])
    for (let index = 3; index < parts.length - 1; index += 1) {
      const option = parts[index].toUpperCase()
      if (option === 'EX') expiresAt.set(key, Date.now() + Number(parts[index + 1]) * 1000)
      if (option === 'PX') expiresAt.set(key, Date.now() + Number(parts[index + 1]))
    }
    return '+OK\r\n'
  }
  if (command === 'INCR') {
    const key = parts[1]
    const next = Number(readValue(key) ?? 0) + 1
    values.set(key, String(next))
    return integer(next)
  }
  if (command === 'EXPIRE') {
    if (readValue(parts[1]) === null) return integer(0)
    expiresAt.set(parts[1], Date.now() + Number(parts[2]) * 1000)
    return integer(1)
  }
  if (command === 'EVAL') {
    const keyCount = Number(parts[2])
    const key = parts[3]
    const ttl = Number(parts[3 + keyCount] ?? 1)
    const next = Number(readValue(key) ?? 0) + 1
    values.set(key, String(next))
    if (next === 1) expiresAt.set(key, Date.now() + ttl * 1000)
    return integer(next)
  }
  return `-ERR unsupported test command ${command ?? 'UNKNOWN'}\r\n`
}

const server = createServer((socket) => {
  const state = { buffer: Buffer.alloc(0) }
  // Test clients may be force-stopped between E2E runs. A reset closes only
  // that connection and must not terminate the shared test server.
  socket.on('error', () => {})
  socket.on('data', (chunk) => {
    for (const command of parseCommands(state, chunk)) socket.write(execute(command))
  })
})

server.listen(port, host, () => {
  process.stdout.write(`Test Redis listening on ${host}:${port}\n`)
})

function shutdown() {
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
