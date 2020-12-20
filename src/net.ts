import * as WebSocket from 'websocket'
import { IndexedMap } from 'essential-data-structures'
import * as http from 'http'
import { EventEmitter } from 'events'

interface NetConnection {
  id: string
  connection: WebSocket.connection
}

export declare interface NetServer<M extends object> {
  on(event: 'message', listener: (connection: NetConnection, message: M) => void): this
  on(event: 'connect', listener: (connection: NetConnection) => void): this
  on(event: 'disconnect', listener: (connection: NetConnection) => void): this
}

export class NetServer<M extends object> extends EventEmitter {
  private readonly _connections: IndexedMap<NetConnection> = new IndexedMap<
    NetConnection
  >(['id'])
  private readonly _port: number
  private readonly _wsServer: WebSocket.server

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
      }
      this._connections.add(netConnection, netConnection.id)
      connection.on('message', (message) =>
        this.emit('message', netConnection, JSON.parse(message.utf8Data!)),
      )
      this.emit('connect', netConnection)
    })

    this._wsServer.on('close', (connection) => {
      const netConnection = this._connections.get(this.getIdFromConnection(connection))!
      this.emit('disconnect', netConnection)
      this._connections.remove(netConnection.id)
    })
  }

  sendMessage(connectionId: string, message: M): boolean {
    const netConnection = this._connections.get(connectionId)
    if (netConnection === undefined) return false
    netConnection.connection.sendUTF(JSON.stringify(message))
    return true
  }

  broadcastMessage(message: M) {
    this._wsServer.broadcast(JSON.stringify(message))
  }

  private getIdFromConnection(connection: WebSocket.connection): string {
    return `${connection.socket.remoteAddress}:${connection.socket.remotePort}`
  }
}

export declare interface NetClient<M extends object> {
  on(event: 'message', listener: (message: M) => void): this
  on(event: 'connect', listener: (connection: WebSocket.connection) => void): this
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
      this._connection.on('message', (message) =>
        this.emit('message', JSON.parse(message.utf8Data!)),
      )
      this.emit('connect', connection)
    })
  }

  sendMessage(message: M) {
    if (!this._connection)
      throw new Error(
        'NET_ERROR: Trying to send message to server without a connection',
      )
    this._connection.sendUTF(JSON.stringify(message))
  }
}
