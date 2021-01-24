import { NetServer, NetClient } from './net'
import { DiffViewer, DiffPatcher } from './sync'

type NetSyncMessage = NSM_Empty | NSM_Diff | NSM_FullState
interface NSM_Empty {
  type: 'empty'
}
interface NSM_Diff {
  type: 'diff'
  diff: any
}
interface NSM_FullState {
  type: 'fullstate'
  fullstate: any
}

export interface NetMessageBase {
  type: string
}
type NetMessage<T extends NetMessageBase> = NetSyncMessage | T

export class NetSyncServer<T extends NetMessageBase> extends NetServer<NetMessage<T>> {
  private readonly _stateRef: object
  private readonly _diffViewer: DiffViewer<object>
  constructor(stateRef: object, port: number) {
    super(port)
    this._stateRef = stateRef
    this._diffViewer = new DiffViewer(stateRef)
    this.on('connect', (netConnection) => {
      this.sendMessage(netConnection.id, {
        type: 'fullstate',
        fullstate: this._stateRef,
      })
    })
  }
  sync() {
    const diffSinceLastTurn = this._diffViewer.getNextDiff()
    if (diffSinceLastTurn !== undefined) {
      this.broadcastMessage({
        type: 'diff',
        diff: diffSinceLastTurn,
      })
    } else {
      this.broadcastMessage({
        type: 'empty',
      })
    }
  }
}

export class NetSyncClient<T extends NetMessageBase> extends NetClient<NetMessage<T>> {
  private readonly _stateRef: object
  private readonly _diffPatcher: DiffPatcher
  constructor(stateRef: object, hostname: string, port: number) {
    super(hostname, port)
    this._stateRef = stateRef
    this._diffPatcher = new DiffPatcher(stateRef)
    this.on('message', (message) => {
      if (message.type === 'diff') {
        this._diffPatcher.patch((message as NSM_Diff).diff)
      } else if (message.type === 'fullstate') {
        this._diffPatcher.set((message as NSM_FullState).fullstate)
      }
    })
  }
}
