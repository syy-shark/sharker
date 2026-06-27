/**
 * 工作区对话 CRUD — 委托至 agent/memory/conversations（PostgreSQL）。
 * @see agent/memory/conversations.ts
 */
export {
  listWorkspaceConversations,
  loadConversation,
  saveConversation,
  deleteConversation,
  setActiveConversation,
  createConversationOnDisk
} from '../../agent/memory/conversations'
