import * as WebSocket from 'websocket'
import { IndexedMap } from 'essential-data-structures'
import * as http from 'http'
import { EventEmitter } from 'events'
import { parse } from 'path'

export interface NetConnection {
  id: string
  connection: WebSocket.connection
  missedPings: number
}

export interface PingMessage {
  type: 'ping'
}

export declare interface NetServer<M extends object> {
  on(
    event: 'message',
    listener: (connection: NetConnection, message: M) => void,
  ): this
  on(event: 'connect', listener: (connection: NetConnection) => void): this
  on(event: 'disconnect', listener: (connection: NetConnection) => void): this
  on(event: 'dropped', listener: (connection: NetConnection) => void): this
}

export class NetServer<M extends object> extends EventEmitter {
  private readonly _connections: IndexedMap<NetConnection> = new IndexedMap<NetConnection>(
    ['id'],
  )
  private readonly _port: number
  private readonly _wsServer: WebSocket.server
  private readonly pingMap = new Map<string, number>()
  private readonly pingInterval = 250
  private readonly pingLimit = 4

  constructor(port: number) {
    super()
    this._port = port

    const server = http.createServer()
    server.listen(this._port)
    this._wsServer = new WebSocket.server({
      httpServer: server,
      autoAcceptConnections: true,
    })

    this._wsServer.on('connect', (connection) => {
      const netConnection: NetConnection = {
        id: this.getIdFromConnection(connection),
        connection: connection,
        missedPings: 0,
      }
      this._connections.add(netConnection, netConnection.id)
      connection.on('message', (message) => {
        const parsedMessage = JSON.parse(message.utf8Data!)
        if (parsedMessage.type === 'ping') {
          netConnection.missedPings = 0
          return
        }
        this.emit('message', netConnection, parsedMessage)
      })
      this.emit('connect', netConnection)
    })

    this._wsServer.on('close', (connection) => this.onClose(connection))

    setInterval(() => this.pingClients(), this.pingInterval)
  }

  private pingClients() {
    this._connections.forEach((tag, netConnection: NetConnection) => {
      if (netConnection.missedPings >= this.pingLimit) {
        this.emit('dropped', netConnection)
        netConnection.connection.close()
      }
    })
    this.broadcastMessage({
      type: 'ping',
    })
    this._connections.forEach(
      (tag, netConnection: NetConnection) => netConnection.missedPings++,
    )
  }

  private onClose(connection: WebSocket.connection) {
    const id = this.getIdFromConnection(connection)
    const netConnection = this._connections.get(id)!
    this.emit('disconnect', netConnection)
    this._connections.remove(netConnection.id)
  }

  sendMessage(connectionId: string, message: M): boolean {
    const netConnection = this._connections.get(connectionId)
    if (netConnection === undefined) return false
    netConnection.connection.sendUTF(JSON.stringify(message))
    return true
  }

  broadcastMessage(message: M | PingMessage) {
    this._wsServer.broadcast(JSON.stringify(message))
  }

  private getIdFromConnection(connection: WebSocket.connection): string {
    return `${connection.socket.remoteAddress}:${connection.socket.remotePort}`
  }
}

export declare interface NetClient<M extends object> {
  on(event: 'message', listener: (message: M) => void): this
  on(
    event: 'connect',
    listener: (connection: WebSocket.connection) => void,
  ): this
  on(
    event: 'disconnect',
    listener: (connection: WebSocket.connection) => void,
  ): this
}

export class NetClient<M extends object> extends EventEmitter {
  private readonly _host: string
  private readonly _port: number
  private _socket: WebSocket.client
  private _connection?: WebSocket.connection

  constructor(host: string, port: number) {
    super()
    this._host = host
    this._port = port
    this._socket = new WebSocket.client()
    this._socket.connect(`ws://${host}:${port}/`)
    this._socket.on('connect', (connection) => {
      this._connection = connection
      this._connection.on('message', (message) => {
        const parsedMessage = JSON.parse(message.utf8Data!)
        if (parsedMessage.type === 'ping') {
          this.sendPing()
          return
        }
        this.emit('message', parsedMessage)
      })
      this.emit('connect', connection)
      this._connection.on('close', () => {
        this.emit('disconnect', connection)
      })
    })
  }

  private sendPing() {
    this.sendMessage({
      type: 'ping',
    })
  }

  sendMessage(message: M | PingMessage) {
    if (!this._connection)
      throw new Error(
        'NET_ERROR: Trying to send message to server without a connection',
      )
    this._connection.sendUTF(JSON.stringify(message))
  }
}
