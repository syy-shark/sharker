# src — 官网应用源码

## 职责

- TanStack Start 入口：路由树、落地页、Tutorial、登录壳。

## 同级目录

| 目录 | 说明 |
|------|------|
| [routes/](./routes/ARCH.md) | 文件路由：`/`、`/tutorial`、`/login` |
| [components/](./components/ARCH.md) | 落地页与共用 UI |
| `lib/` | 工具函数、鉴权、错误页 |

## 同级文件

| 文件 | 说明 |
|------|------|
| `router.tsx` | `getRouter()`，挂 `routeTree.gen.ts` |
| `routeTree.gen.ts` | 路由生成文件（加路由后需同步） |
| `styles.css` | 全站 token、产品窗、Tutorial 舞台 |
| `ARCH.md` | 本层架构说明 |
