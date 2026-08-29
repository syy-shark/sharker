/**
 * 工作区对话 CRUD — 委托至 agent/memory/conversations（PostgreSQL）。
 * @see agent/memory/conversations.ts
 */
export {
  listWorkspaceConversations,
  listArchivedConversations,
  loadConversation,
  loadOlderConversationMessages,
  saveConversation,
  deleteConversation,
  setConversationArchived,
  setActiveConversation,
  createConversationOnDisk,
  patchConversationMeta,
  clearWorkspaceConversationUnread
} from '../agent/memory/conversations'
