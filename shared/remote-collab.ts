/**
 * 远程协作会话（Claude Code 风格）：本地 relay 占位，可扩展 WebSocket 同步。
 */
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

/** 远程协作房间 */
export interface RemoteCollabRoom {
  id: string
  name: string
  relayUrl: string
  shareCode: string
  createdAt: string
  active: boolean
}

interface RemoteStore {
  rooms: RemoteCollabRoom[]
  activeRoomId?: string
}

function storePath(): string {
  return path.join(os.homedir(), '.sharker', 'remote-collab.json')
}

/** 读取远程协作配置 */
export async function loadRemoteCollab(): Promise<RemoteStore> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    return JSON.parse(raw) as RemoteStore
  } catch {
    return { rooms: [] }
  }
}

/** 保存远程协作配置 */
export async function saveRemoteCollab(store: RemoteStore): Promise<void> {
  const dir = path.dirname(storePath())
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(storePath(), JSON.stringify(store, null, 2), 'utf8')
}

/** 创建协作房间（生成 shareCode） */
export async function createRemoteRoom(name: string): Promise<RemoteCollabRoom> {
  const store = await loadRemoteCollab()
  const room: RemoteCollabRoom = {
    id: crypto.randomUUID(),
    name,
    relayUrl: process.env.SHARKER_RELAY_URL ?? 'wss://relay.sharker.local/v1',
    shareCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
    createdAt: new Date().toISOString(),
    active: true
  }
  store.rooms.unshift(room)
  store.activeRoomId = room.id
  await saveRemoteCollab(store)
  return room
}
