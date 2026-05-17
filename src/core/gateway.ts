import type { GatewayConfig } from './config.js';
import { eventBus } from './event-bus.js';
import { router } from './router.js';
import { agentRegistry } from './agent-registry.js';
import { taskManager } from './task-manager.js';
import { contextManager } from './context-manager.js';
import { vectorStore } from './vector-store.js';
import { initLogger, logger } from './logger.js';
import { circuitBreakerRegistry } from '../model-gateway/circuit-breaker.js';
import { TaskStore } from './store.js';
import { scheduler } from './scheduler.js';
import { agentPipeline } from './pipeline.js';
import type { Agent, AgentMessage, Task, EventType } from '../types/index.js';

// 全局容器引用（供路由模块等访问）
let _instance: GatewayContainer | null = null;
export function setGateway(instance: GatewayContainer): void { _instance = instance; }
export function getGateway(): GatewayContainer | null { return _instance; }

/**
 * GatewayContainer — 核心实例生命周期管理器
 * 包装现有模块级单例，提供统一的 init → reload → dispose 生命周期
 */
export class GatewayContainer {
  readonly config: GatewayConfig;

  readonly eventBus = eventBus;
  readonly router = router;
  readonly agentRegistry = agentRegistry;
  readonly taskManager = taskManager;
  readonly contextManager = contextManager;
  readonly vectorStore = vectorStore;
  readonly circuitBreakerRegistry = circuitBreakerRegistry;
  readonly scheduler = scheduler;
  readonly pipeline = agentPipeline;
  readonly store!: TaskStore;

  private _started = false;
  private _startTime = 0;
  private _configWatcher: ReturnType<typeof setInterval> | null = null;
  private _fsWatcher: any = null; // fs.StatsWatcher (类型取决于 @types/node 版本)
  private _modelProviderCount = 0;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.store = new TaskStore(config.dataDir + '/gateway.db');
  }

  /** 完整初始化：配置 → Agent → 向量存储 */
  async initialize(): Promise<void> {
    if (this._started) return;

    // Logger 桥接（由 index.ts 在 Fastify 创建后调用 setPino）
    initLogger({ dir: this.config.logDir, level: this.config.logLevel });

    // 存储路径
    this.contextManager.configure(this.config.dataDir + '/tasks');
    this.vectorStore.configure(this.config.dataDir + '/vector-db');

    // Task 持久化
    this.taskManager.useStore(this.store);

    // Router
    this.router.configure(this.config.routing.rules, this.config.routing.defaultAgent);

    // Agent Registry
    this.agentRegistry.initialize();
    for (const agent of this.agentRegistry.getAgents()) {
      this.router.registerAgent(agent);
    }

    // VectorStore 异步预热
    this.vectorStore.initialize().catch(err => {
      logger.warn('[Gateway] VectorStore init failed:', { error: String(err) });
    });

    // 启动定时任务调度器
    this.scheduler.start();

    // 缓存静态模型计数
    this._modelProviderCount = this.config.models ? Object.keys(this.config.models.providers || {}).length : 0;

    this._started = true;
    this._startTime = Date.now();
    logger.info('[Gateway] Container initialized');
  }

  /** 运行时间（秒） */
  get uptimeSeconds(): number {
    if (!this._started) return 0;
    return Math.floor((Date.now() - this._startTime) / 1000);
  }

  /** 健康状态快照 */
  health(): {
    status: 'ok' | 'degraded' | 'starting';
    uptime_seconds: number;
    agents: { total: number; online: number };
    models: { total: number };
    tasks: { pending: number; running: number; completed: number; failed: number };
    circuit_breakers: Record<string, { state: string; failures: number }>;
  } {
    const allAgents = this.router.getAllAgents();
    const onlineAgents = allAgents.filter(a => a.status === 'online');
    const allTasks = this.taskManager.getAllTasks();

    return {
      status: this._started ? 'ok' : 'starting',
      uptime_seconds: this.uptimeSeconds,
      agents: {
        total: allAgents.length,
        online: onlineAgents.length,
      },
      models: { total: this._modelProviderCount },
      tasks: {
        pending: allTasks.filter(t => t.status === 'pending').length,
        running: allTasks.filter(t => t.status === 'running').length,
        completed: allTasks.filter(t => t.status === 'completed').length,
        failed: allTasks.filter(t => t.status === 'failed').length,
      },
      circuit_breakers: this.circuitBreakerRegistry.getStatus(),
    };
  }

  /** 设置 Pino 日志桥接（Fastify 创建后调用） */
  setPinoLogger(pino: any): void {
    initLogger({ pino, dir: this.config.logDir, level: this.config.logLevel });
  }

  /** 热重载 Agent — 重新加载配置并增量更新注册 */
  async reloadAgents(): Promise<{ added: string[]; removed: string[]; updated: string[] }> {
    const before = new Set(this.agentRegistry.getAgents().map(a => a.id));

    this.agentRegistry.reload();

    const after = this.agentRegistry.getAgents();
    const afterIds = new Set(after.map(a => a.id));

    const added: string[] = [];
    const removed: string[] = [];
    const updated: string[] = [];

    for (const agent of after) {
      if (!before.has(agent.id)) {
        this.router.registerAgent(agent);
        added.push(agent.id);
        this.eventBus.publishAgentEvent('agent.registered', {
          id: agent.id, type: 'event',
          source: 'gateway', target: 'system',
          correlation_id: agent.id, timestamp: Date.now(),
        });
      } else {
        // 仅变更时重新注册
        const existing = this.router.getAgent(agent.id);
        if (!existing || existing.status !== agent.status || existing.capabilities.join(',') !== agent.capabilities.join(',')) {
          this.router.registerAgent(agent);
          updated.push(agent.id);
        }
      }
    }

    for (const oldId of before) {
      if (!afterIds.has(oldId)) {
        this.router.unregisterAgent(oldId);
        removed.push(oldId);
        this.eventBus.publishAgentEvent('agent.unregistered', {
          id: oldId, type: 'event',
          source: 'gateway', target: 'system',
          correlation_id: oldId, timestamp: Date.now(),
        });
      }
    }

    if (added.length || removed.length) {
      logger.info('[Gateway] Agents reloaded', { added, removed, updated: updated.length });
    }

    return { added, removed, updated };
  }

  /** 启动配置文件监听（热重载） */
  startConfigWatcher(configPath: string, debounceMs = 3000): void {
    if (this._configWatcher) return;

    import('node:fs').then(({ watchFile, existsSync }) => {
      const handler = () => {
        setTimeout(async () => {
          if (!existsSync(configPath)) return;

          logger.info('[Gateway] Config changed, reloading...');
          try {
            const { reloadConfig, getRoutingRules, getDefaultAgent } = await import('./config.js');
            const newConfig = reloadConfig(configPath);
            this.contextManager.configure(newConfig.dataDir + '/tasks');
            this.vectorStore.configure(newConfig.dataDir + '/vector-db');

            const rules = getRoutingRules();
            const defaultAgent = getDefaultAgent();
            this.router.configure(rules, defaultAgent);

            await this.reloadAgents();
            logger.info('[Gateway] Config reloaded successfully');
          } catch (err: any) {
            logger.error('[Gateway] Config reload failed:', { error: err.message });
          }
        }, debounceMs);
      };

      const watcher = watchFile(configPath, handler);
      this._fsWatcher = watcher;
      logger.info('[Gateway] Config watcher started: ' + configPath);
    });

    this._configWatcher = setInterval(() => {}, 2_147_483_647);
  }

  /** 停止配置文件监听 */
  async stopConfigWatcher(): Promise<void> {
    if (this._configWatcher) {
      clearInterval(this._configWatcher);
      this._configWatcher = null;
    }
    if (this._fsWatcher) {
      const { unwatchFile } = await import('node:fs');
      unwatchFile(this._fsWatcher);
      this._fsWatcher = null;
    }
  }

  // —— 委托方法 ——

  submitTask(message: AgentMessage): Promise<Task> {
    return this.taskManager.processTask(message);
  }

  getTask(taskId: string): Task | undefined {
    return this.taskManager.getTask(taskId);
  }

  getAllTasks(): Task[] {
    return this.taskManager.getAllTasks();
  }

  getOnlineAgents(): Agent[] {
    return this.router.getOnlineAgents();
  }

  getAllAgents(): Agent[] {
    return this.router.getAllAgents();
  }

  createSpace(metadata?: Record<string, unknown>): Promise<string> {
    return this.contextManager.createSharedSpace(metadata);
  }

  onEvent(eventType: EventType, handler: (event: { type: EventType; data: AgentMessage; timestamp: number }) => void): () => void {
    return this.eventBus.subscribe(eventType, handler);
  }

  /** 优雅关闭 */
  async dispose(): Promise<void> {
    this.stopConfigWatcher();
    this.scheduler.stop();
    this.taskManager.purgeCompleted(30);
    this.store.close();
    this.eventBus.removeAllListeners();
    this._started = false;
    logger.info('[Gateway] Container disposed');
  }
}
