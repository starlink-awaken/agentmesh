# Engineering Resilience: Test Isolation + Config Validation + CI Pipeline

**Context:** 原始 monorepo 架构计划（Phase 0-4）已全部完成。当前 AgentMesh 的核心短板是工程韧性：4个测试隔离失败导致 `bun test` 无法全绿，配置零运行时校验导致错误静默吞掉，CI 管道残缺不全。

## P0: Fix 4 Test Isolation Failures

**目标：** `bun test` 全绿，零隔离性失败

### 文件修改

#### 1. gateway routes.ts — `_modelOrch` 单例泄漏
- `packages/gateway/src/model-gateway/routes.ts` 添加 `resetModelOrch()` 导出
- `packages/gateway/__tests__/model-gateway/routes.test.ts` 在 `beforeEach` 中调用 `resetModelOrch() + reloadConfig()`

#### 2. gateway config.ts — `cachedConfig` 缓存泄漏
- `packages/gateway/src/core/config.ts` 确保测试可清除缓存
- routes.test.ts 增加 `reloadConfig()` 调用

#### 3. quality-gate-migration.test.ts — 相对路径依赖 CWD
- `packages/engine/__tests__/quality-gate-migration.test.ts` 
- `'../domains'` → `path.resolve(import.meta.dir, '../../domains')`
- `'./domains'` → 基于 `import.meta.dir` 的绝对路径

#### 4. agent-call-integration.test.ts — 超时硬等 5s
- `packages/engine/__tests__/agent-call-integration.test.ts`
- 添加 `{ timeout: 15000 }` 到 test 配置
- 或实现 MockAgentExecutor 的 AbortSignal 超时取消

### 验证
```bash
bun test  # 4 个失败归零
```

## P1: Startup Config Validation

**目标：** 配置错误在启动时即报出，不等到运行时爆炸

### 文件创建/修改

#### 1. `packages/core-types/src/config-validator.ts` (NEW)
- 纯函数 validate: `(config: unknown) => { valid: boolean; errors: string[] }`
- 检查必填字段（port、agents[].id、agents[].capabilities）
- 检查字段类型（port 是 number、enabled 是 boolean）
- 友好错误消息："config.gateway.port must be a number, got "three thousand""

#### 2. `packages/model-orchestrator/src/loader.ts`
- `loadAppConfig()` 调用 validate 后 `console.error` 错误
- 不阻止启动（向后兼容），但打印清晰的警告

#### 3. `packages/gateway/src/index.ts`
- 启动时调用 validate 并打印警告

#### 4. 淘汰 `as any` 强转
- `loadConfig()` 中 `parse(...) as any` → 改为 `parse(...) as GatewayConfig` 加 validate
- `index.ts` 中 `(config as any).models = ...` → 类型安全的 merge

### 验证
```bash
bun run packages/gateway/src/index.ts  # 启动时看到配置摘要
```

## P2: CI Pipeline Enhancement

**目标：** CI 覆盖 typecheck + test + lint，跑 engine + e2e

### 文件修改

#### 1. `.github/workflows/ci.yml`
- 打开 engine typecheck：移除 `--exclude engine` 或单跑 `cd packages/engine && tsc --noEmit`
- 加 E2E 步骤：`bun test __e2e__`
- 加全量 `bun test` 步骤（P0 修完后）
- 加 bun install/build 缓存

### 验证
```bash
# 本地模拟 CI
bun run typecheck && bun test && bun test __e2e__
```

## 实施顺序

1. **P0** → 4 个修复串行（互相独立）
2. **P1** → config-validator + 集成到 loader/index
3. **P2** → CI yaml 修改

## 关键文件清单

| 文件 | 操作 |
|------|------|
| `packages/gateway/src/model-gateway/routes.ts` | 加 resetModelOrch() |
| `packages/gateway/src/core/config.ts` | 确保缓存可清 |
| `packages/gateway/__tests__/model-gateway/routes.test.ts` | 加 beforeEach 重置 |
| `packages/engine/__tests__/quality-gate-migration.test.ts` | 改相对路径为绝对路径 |
| `packages/engine/__tests__/agent-call-integration.test.ts` | 加 timeout 或修 MockExecutor |
| `packages/core-types/src/config-validator.ts` | 新建 |
| `packages/model-orchestrator/src/loader.ts` | 集成 validate |
| `packages/gateway/src/index.ts` | 集成 validate + 去 as any |
| `.github/workflows/ci.yml` | 扩测试覆盖 |
