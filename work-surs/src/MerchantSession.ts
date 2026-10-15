import { DurableObject } from 'cloudflare:workers'

type MerchantEvent = {
  eventId?: number
  timestamp?: number
  type: 'order' | 'product'
  action: 'created' | 'updated' | 'deleted'
  entityId?: string
  scope?: 'active' | 'archived'
  data: unknown
}

type WebSocketTicket = {
  merchantId: string
  expiresAt: number
}

interface Env {
  DB: D1Database
}

export class MerchantSession extends DurableObject<Env> {
  async pushEvent(
    eventPayload: MerchantEvent,
    connectionId?: string
  ): Promise<boolean> {
    const sockets = connectionId
      ? this.ctx.getWebSockets(`connection:${connectionId}`)
      : this.ctx.getWebSockets()
    if (sockets.length === 0) return false
    const message = JSON.stringify(eventPayload)
    let delivered = 0

    for (const socket of sockets) {
      try {
        socket.send(message)
        delivered += 1
      } catch (error) {
        console.error('Merchant event delivery failed:', error)
        try {
          socket.close(1011, 'Event delivery failed')
        } catch (closeError) {
          console.error('Failed to close an unusable merchant socket:', closeError)
        }
      }
    }
    return delivered > 0
  }

  async pushEvents(
    eventPayloads: MerchantEvent[],
    connectionId: string
  ): Promise<void> {
    const sockets = this.ctx.getWebSockets(`connection:${connectionId}`)
    for (const eventPayload of eventPayloads) {
      const message = JSON.stringify(eventPayload)
      for (const socket of sockets) {
        try {
          socket.send(message)
        } catch (error) {
          console.error('Merchant catch-up delivery failed:', error)
        }
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === 'POST' && url.pathname === '/issue-ticket') {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return new Response('Invalid JSON body', { status: 400 })
      }
      const merchantId =
        typeof body === 'object' &&
        body !== null &&
        'merchantId' in body &&
        typeof body.merchantId === 'string'
          ? body.merchantId
          : ''
      if (!merchantId) return new Response('Missing merchant identity', { status: 400 })

      const ticket = crypto.randomUUID()
      const expiresAt = Date.now() + 30_000
      await this.ctx.storage.put<WebSocketTicket>(`ws_ticket:${ticket}`, {
        merchantId,
        expiresAt,
      })
      await this.ctx.storage.setAlarm(expiresAt + 5_000)

      return Response.json({ ticket })
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Not Found', { status: 404 })
    }

    const ticket = url.searchParams.get('ticket') || ''
    const ticketKey = `ws_ticket:${ticket}`
    const ticketData = await this.ctx.storage.get<WebSocketTicket>(ticketKey)
    if (!ticketData || ticketData.expiresAt < Date.now()) {
      if (ticketData) await this.ctx.storage.delete(ticketKey)
      return new Response('Unauthorized: Ticket expired or invalid', {
        status: 401,
      })
    }

    const merchantHint = url.searchParams.get('m')
    if (!merchantHint || merchantHint !== ticketData.merchantId) {
      return new Response('Unauthorized: Merchant mismatch', { status: 401 })
    }
    await this.ctx.storage.delete(ticketKey)

    const connectionId = url.searchParams.get('connectionId')
    if (!connectionId) return new Response('Missing connection ID', { status: 400 })

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    this.ctx.acceptWebSocket(server, [
      `merchant:${ticketData.merchantId}`,
      `connection:${connectionId}`,
    ])

    try {
      await this.env.DB.prepare(
        'INSERT INTO merchant_connections (merchant_id, connection_id, connected_at) VALUES (?, ?, ?)'
      )
        .bind(ticketData.merchantId, connectionId, Date.now())
        .run()
    } catch (error) {
      server.close(1011, 'Connection registration failed')
      console.error('Merchant connection registration failed:', error)
      return new Response('Unable to register connection', { status: 503 })
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  async alarm(): Promise<void> {
    const tickets = await this.ctx.storage.list<WebSocketTicket>({
      prefix: 'ws_ticket:',
    })
    let nextExpiration = Number.POSITIVE_INFINITY

    for (const [key, ticket] of tickets) {
      if (ticket.expiresAt <= Date.now()) {
        await this.ctx.storage.delete(key)
      } else {
        nextExpiration = Math.min(nextExpiration, ticket.expiresAt + 5_000)
      }
    }

    if (Number.isFinite(nextExpiration)) {
      await this.ctx.storage.setAlarm(nextExpiration)
    }
  }

  async webSocketMessage(
    _socket: WebSocket,
    _message: string | ArrayBuffer
  ): Promise<void> {
    // The connection is intentionally server-push only.
  }

  async webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean
  ): Promise<void> {
    try {
      socket.close(code, reason)
    } catch (error) {
      console.error('Merchant WebSocket close failed:', error)
    }
    const connectionId = this.ctx
      .getTags(socket)
      .find((tag) => tag.startsWith('connection:'))
      ?.slice('connection:'.length)
    if (connectionId) {
      try {
        await this.env.DB.prepare(
          'DELETE FROM merchant_connections WHERE connection_id = ?'
        )
          .bind(connectionId)
          .run()
      } catch (error) {
        console.error('Merchant connection cleanup failed:', error)
      }
    }
  }

  async webSocketError(socket: WebSocket, error: unknown): Promise<void> {
    console.error('Merchant WebSocket error:', error)
    await this.webSocketClose(socket, 1011, 'WebSocket error', false)
  }
}
