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

# runtime/src/devin-task — Devin 任务派发准备

## 职责

- 接收一条本地编码任务，通过可替换 transport 派发，并按调用方给出的次数读取会话结果
- 提供内存 mock，以及一份只覆盖已核对 Devin API v3 路径的 HTTP transport
- **不管**：定时调度、IM bot 注册、会话恢复、密钥存储、向 `api.devin.ai` 主动连线

接入说明见 [devin-task-adapter.zh-CN.md](../../../../docs/architecture/devin-task-adapter.zh-CN.md)。

## 同级目录

| 目录 | 说明 |
|------|------|
| [__tests__/](./__tests__/devin-task.test.ts) | 正常路径与失败路径测试，只使用 mock 或注入的 fetch |

## 同级文件

| 文件 | 说明 |
|------|------|
| `contract.ts` | 内部快照、公开 status / devin_mode 枚举、transport 接口、本地 id 检查 |
| `parse.ts` | 把公开 SessionResponse 与消息页解析成内部快照 |
| `http-transport.ts` | 注入 fetch 的 v3 HTTP 映射；构造时不发请求 |
| `mock-transport.ts` | 可脚本化的进程内 transport，供没有 Devin 凭据时验证 |
| `adapter.ts` | `accept` / `dispatch` / `listen` |
| `index.ts` | `@sharker/runtime/devin-task` 导出入口 |
| `ARCH.md` | 本层架构说明 |

## 对外接口

- `DevinTaskAdapter.accept`：只做本地校验
- `DevinTaskAdapter.dispatch`：调用 `createSession`
- `DevinTaskAdapter.listen`：轮询到公开终态，或在超时、取消、传输失败时停下
- `createHttpDevinTransport` / `createMockDevinTransport`

## 依赖

- 仅 Node 标准库。HTTP 实现不读取环境变量，也不引用全局 `fetch`
