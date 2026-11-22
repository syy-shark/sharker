<!--
  Licensed to the Apache Software Foundation (ASF) under one
  or more contributor license agreements.  See the NOTICE file
  distributed with this work for additional information
  regarding copyright ownership.  The ASF licenses this file
  to you under the Apache License, Version 2.0 (the
  "License"); you may not use this file except in compliance
  with the License.  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing,
  software distributed under the License is distributed on an
  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
  KIND, either express or implied.  See the License for the
  specific language governing permissions and limitations
  under the License.
-->

# Devin 任务派发适配（接入准备）

状态：本地可测的准备代码。没有 Devin 订阅或密钥时也可以验证。它不是 Devin 官方 SDK，也没有在真实账号上跑过。

## 为什么是派发和监听，而不是调度

Devin 公开的 v3 API 把一次工作建成 session：提交 prompt，再读取 session 状态和消息。官方用法示例用轮询等待 `exit`、`error` 或 `suspended`。这和 Sharker 里已有的定时任务、Agent Graph 调度不是同一层。IM bot 注册表负责 Telegram、飞书、Slack 这类入站频道，Devin 也不是其中一种频道。

因此本模块只做三件事：

1. `accept` 接收并校验一条本地任务。
2. `dispatch` 通过 transport 创建会话。
3. `listen` 按调用方给定的次数读取结果。

不在这里注册 cron，不把 Devin 放进 `BotProvider`，也不替调用方决定何时重试。

## 已经核对的公开协议

核验日期：2026-11-22。只使用下面三份公开文档里的路径和字段：

| 操作 | 方法与路径 | 文档 |
|------|------------|------|
| 创建会话 | `POST /v3/organizations/{org_id}/sessions` | <https://docs.devin.ai/api-reference/v3/sessions/post-organizations-sessions> |
| 读取会话 | `GET /v3/organizations/{org_id}/sessions/{devin_id}` | <https://docs.devin.ai/api-reference/v3/sessions/get-organizations-session> |
| 读取消息 | `GET /v3/organizations/{org_id}/sessions/{devin_id}/messages` | <https://docs.devin.ai/api-reference/v3/sessions/get-organizations-session-messages> |

创建请求体只发送公开 `SessionCreateRequest` 的子集：`prompt`、`title`、`tags`、`playbook_id`、`repos`、`devin_mode`。认证使用公开文档中的 `Authorization: Bearer`。源站默认值 `https://api.devin.ai` 来自公开 curl 示例。

终态按公开轮询示例处理：`exit`、`error`、`suspended`。`running` 且 `status_detail` 为 `finished` 仍视为进行中。内部字段 `phase`（`in_progress` / `succeeded` / `failed` / `suspended` / `unknown`）是本模块的投影，不是 API 字段。

`org-` 与 `devin-` 前缀来自文档说明。模块里的字符集限制是本地路径检查，不是官方完整语法。密钥不要求 `cog_` 前缀，因为公开认证文档同时允许服务用户令牌、PAT，迁移指南也写明过渡期旧 key 仍可用。

以下公开能力这次没有实现，也不能从本模块推断它们的请求格式：向会话发送消息、归档、删除、企业端点、playbook / knowledge / secret 管理。

## 没有凭据时怎么验证

`createHttpDevinTransport` 必须传入 `fetch`。不传就不会有可用的 transport，模块自身也不调用全局 `fetch`，也不读环境变量。

测试里的写法是：用 `createMockDevinTransport({ sessions })` 准备 `running` 再 `exit` 的快照，或把 `fetch` 传给 `createHttpDevinTransport`。`DevinTaskAdapter.accept({ prompt })` 只做本地校验。完整调用见 `packages/runtime/src/devin-task/__tests__/devin-task.test.ts`。

`accept` 失败时不会碰 transport。`listen` 的 `maxPolls` 必填。`maxPolls` 大于 1 时必须显式传入 `intervalMs`；传 `0` 表示承认紧循环，测试用它避免定时器。要对真实服务放慢轮询，调用方自己传入间隔。公开示例使用的是 10 秒，本模块不把这个值写死成后台任务。

消息最多跟随 5 页，每页请求公开允许范围内的 `first=100`。超过上限时 `messagesTruncated` 为 true。

## 还不能当作已接通

有真实服务用户令牌和组织 id 之后，仍需单独验证：

- Bearer 令牌是否具备文档要求的 `UseDevinSessions`（`org.devins.use`），以及读取会话所需的可见性
- 创建响应里的 `session_id`、`url`、`status` 是否与当前账号的实际 JSON 一致
- `exit` 时消息页和 `structured_output` 是否足以代表任务结果
- `suspended` 后如果要恢复，需要另外实现公开的“发送消息”接口；本模块遇到 `suspended` 只停止监听

在那之前，注入的 fetch 或 `createMockDevinTransport` 的测试结果只说明本地适配行为，不说明 Devin 账号、订阅或额度可用。
