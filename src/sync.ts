import { diff, patch } from 'jsondiffpatch'

export class DiffViewer<T extends object> {
  private _ref: T
  private _valueOld: T
  constructor(reference: T) {
    this._ref = reference
    this._valueOld = this.clone(this._ref)
  }
  getNextDiff(): any {
    const clonedNewValue = this.clone(this._ref)
    const difference = diff(this._valueOld, clonedNewValue)
    this._valueOld = clonedNewValue
    return difference
  }
  private clone(value: T): T {
    return JSON.parse(JSON.stringify(value))
  }
}

export class DiffPatcher {
  private _ref: object
  constructor(reference: object) {
    this._ref = reference
  }
  patch(diff: any) {
    patch(this._ref, diff)
  }
  set(value: object) {
    Object.keys(this._ref).forEach(key => delete (this._ref as any)[key])
    Object.keys(value).forEach(key => (this._ref as any)[key] = (value as any)[key])
  }
}
