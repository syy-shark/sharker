/**
 * `/review` 派发给 Agent 的只读审查提示（对标 Codex /review）。
 * @see shared/ARCH.md
 */

/** 审查未提交工作区变更：只读、不改文件、不 commit */
export const REVIEW_WORKING_TREE_PROMPT =
  '请审查当前工作区未提交的 git 变更（含未跟踪文件）。只做只读审查：指出问题、风险、遗漏测试与可改进处。不要修改文件，不要 commit。先用 git 工具查看 status 与 diff，再给出结构化评审。'
