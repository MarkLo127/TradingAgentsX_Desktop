import { contextBridge, ipcRenderer } from 'electron'
import type { TaxBridge, Unsubscribe } from '../shared/bridge'

/** 統一的訂閱封裝，回傳取消訂閱函式 */
function subscribe<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_e: unknown, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.off(channel, listener)
  }
}

const api: TaxBridge = {
  app: {
    info: () => ipcRenderer.invoke('app:info'),
  },

  window: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
    close: () => ipcRenderer.invoke('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
    onMaximizedChange: (cb) => subscribe('win:maximized', cb),
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    selectDir: (current) => ipcRenderer.invoke('settings:selectDir', current),
    selectFile: (current) => ipcRenderer.invoke('settings:selectFile', current),
    detect: () => ipcRenderer.invoke('settings:detect'),
  },

  theme: {
    onResolved: (cb) => subscribe('theme:resolved', cb),
  },

  secrets: {
    state: () => ipcRenderer.invoke('secrets:state'),
    set: (id, value) => ipcRenderer.invoke('secrets:set', id, value),
    remove: (id) => ipcRenderer.invoke('secrets:remove', id),
    verify: (id) => ipcRenderer.invoke('secrets:verify', id),
  },

  backend: {
    status: () => ipcRenderer.invoke('backend:status'),
    logs: () => ipcRenderer.invoke('backend:logs'),
    restart: () => ipcRenderer.invoke('backend:restart'),
    stop: () => ipcRenderer.invoke('backend:stop'),
    get: (apiPath) => ipcRenderer.invoke('backend:get', apiPath),
    onStatus: (cb) => subscribe('backend:status', cb),
    onLog: (cb) => subscribe('backend:log', cb),
  },

  analysis: {
    start: (input) => ipcRenderer.invoke('analysis:start', input),
    status: (taskId) => ipcRenderer.invoke('analysis:status', taskId),
    cleanup: (taskId) => ipcRenderer.invoke('analysis:cleanup', taskId),
  },

  reports: {
    list: () => ipcRenderer.invoke('reports:list'),
    get: (fileName) => ipcRenderer.invoke('reports:get', fileName),
    save: (report) => ipcRenderer.invoke('reports:save', report),
    remove: (fileName) => ipcRenderer.invoke('reports:delete', fileName),
    usage: () => ipcRenderer.invoke('reports:usage'),
    reveal: (fileName) => ipcRenderer.invoke('reports:reveal', fileName),
  },

  data: {
    clearAll: () => ipcRenderer.invoke('data:clearAll'),
  },

  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
}

contextBridge.exposeInMainWorld('tax', api)
