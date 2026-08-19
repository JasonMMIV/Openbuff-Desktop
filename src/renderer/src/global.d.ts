import type { OpenbuffApi } from '../../preload'

declare global {
  interface Window {
    openbuff: OpenbuffApi
  }
}

export {}
