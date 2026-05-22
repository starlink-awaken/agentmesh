/**
 * AgentToolkitPlugin - Agent Toolkit 插件实现
 *
 * 提供 Agent Toolkit 官方插件实现，支持延迟加载和按需导入
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  AgentToolkitPlugin as AgentToolkitPluginType,
  PluginRegistration,
  PluginInitConfig,
  PluginInitResult,
  LazyModule,
} from './types.js';

// 核心模块映射（延迟加载）
const moduleLoaders: Record<keyof PluginRegistration, () => Promise<unknown>> = {
  llm: () => import('../llm/index.js'),
  team: () => import('../team/index.js'),
  skills: () => import('../skills/index.js'),
  memory: () => import('../memory/index.js'),
  tools: () => import('../tools/index.js'),
  middleware: () => import('../middleware/index.js'),
  observability: () => import('../observability/index.js'),
  session: () => import('../session/index.js'),
  retry: () => import('../retry/index.js'),
  errors: () => import('../errors/index.js'),
  context: () => import('../context/index.js'),
  qa: () => import('../qa/index.js'),
  edge: () => import('../edge/index.js'),
  autogen: () => import('../autogen/index.js'),
  langchain: () => import('../langchain/index.js'),
};

/**
 * 创建延迟加载模块
 */
function createLazyModule<T>(loader: () => Promise<T>): LazyModule<T> {
  let cachedModule: T | undefined;
  let loadingPromise: Promise<T> | undefined;

  return {
    async load(): Promise<T> {
      if (cachedModule) {
        return cachedModule;
      }

      if (!loadingPromise) {
        loadingPromise = loader().then((mod) => {
          cachedModule = mod as T;
          return cachedModule!;
        });
      }

      return loadingPromise;
    },

    isLoaded(): boolean {
      return cachedModule !== undefined;
    },

    get(): T | undefined {
      return cachedModule;
    },
  };
}

// 预定义的模块列表
const ALL_MODULES = Object.keys(moduleLoaders) as (keyof PluginRegistration)[];

/**
 * AgentToolkitPlugin 类
 * 实现 AgentToolkitPlugin 接口
 */
export class AgentToolkitPluginImpl implements AgentToolkitPluginType {
  public readonly name: 'agent-toolkit' = 'agent-toolkit';
  public readonly version: '1.0.0' = '1.0.0';
  public readonly description = 'Multi-agent collaboration and LLM framework';

  private lazyModules: Map<keyof PluginRegistration, LazyModule<unknown>>;
  private loadedModules: Set<keyof PluginRegistration>;
  private debug: boolean;

  constructor(config: PluginInitConfig = {}) {
    this.debug = config.debug ?? false;
    this.lazyModules = new Map();
    this.loadedModules = new Set();

    // 初始化所有模块的延迟加载器
    const modulesToLoad = config.modules ?? ALL_MODULES;
    for (const moduleName of modulesToLoad) {
      if (moduleLoaders[moduleName]) {
        this.lazyModules.set(
          moduleName,
          createLazyModule(moduleLoaders[moduleName])
        );
      }
    }

    if (this.debug) {
      console.log(`[AgentToolkitPlugin] Initialized with ${modulesToLoad.length} modules`);
    }
  }

  /**
   * 注册插件，返回插件注册对象
   * 支持延迟加载所有模块
   */
  register(): PluginRegistration {
    const registration: PluginRegistration = {} as PluginRegistration;

    for (const moduleName of ALL_MODULES) {
      // 使用 Object.defineProperty 实现懒加载
      Object.defineProperty(registration, moduleName, {
        get: async () => {
          const lazyModule = this.lazyModules.get(moduleName);
          if (!lazyModule) {
            throw new Error(`Module ${moduleName} not found`);
          }

          const module = await lazyModule.load();
          this.loadedModules.add(moduleName);

          if (this.debug) {
            console.log(`[AgentToolkitPlugin] Loaded module: ${moduleName}`);
          }

          return module;
        },
        configurable: false,
        enumerable: true,
      });
    }

    return registration;
  }

  /**
   * 初始化插件
   * 预加载指定的模块
   */
  async init(config?: PluginInitConfig): Promise<PluginInitResult> {
    const modulesToInit = config?.modules ?? ALL_MODULES;
    const loadedModules: (keyof PluginRegistration)[] = [];

    for (const moduleName of modulesToInit) {
      const lazyModule = this.lazyModules.get(moduleName);
      if (lazyModule) {
        await lazyModule.load();
        loadedModules.push(moduleName);
        this.loadedModules.add(moduleName);
      }
    }

    if (this.debug) {
      console.log(`[AgentToolkitPlugin] Preloaded ${loadedModules.length} modules`);
    }

    return {
      plugin: this,
      registration: this.register(),
      loadedModules,
    };
  }

  /**
   * 获取已加载的模块列表
   */
  getLoadedModules(): (keyof PluginRegistration)[] {
    return Array.from(this.loadedModules);
  }

  /**
   * 检查模块是否已加载
   */
  isModuleLoaded(moduleName: keyof PluginRegistration): boolean {
    return this.loadedModules.has(moduleName);
  }

  /**
   * 动态加载指定模块
   */
  async loadModule<K extends keyof PluginRegistration>(
    moduleName: K
  ): Promise<PluginRegistration[K]> {
    const lazyModule = this.lazyModules.get(moduleName);
    if (!lazyModule) {
      throw new Error(`Module ${moduleName} not found`);
    }

    const module = await lazyModule.load() as PluginRegistration[K];
    this.loadedModules.add(moduleName);

    return module;
  }
}

// 默认实例（延迟初始化）
let defaultPluginInstance: AgentToolkitPluginImpl | undefined;

/**
 * 获取默认 AgentToolkitPlugin 实例
 */
export function getDefaultPlugin(config?: PluginInitConfig): AgentToolkitPluginImpl {
  if (!defaultPluginInstance) {
    defaultPluginInstance = new AgentToolkitPluginImpl(config);
  }
  return defaultPluginInstance;
}

/**
 * 重置默认插件实例
 * 主要用于测试
 */
export function resetDefaultPlugin(): void {
  defaultPluginInstance = undefined;
}
