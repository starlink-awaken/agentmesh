/**
 * Plugin Types - 插件系统类型定义
 *
 * 提供插件接口定义，支持延迟加载和按需导入
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * 基础 Plugin 接口
 */
export interface Plugin {
  /** 插件名称 */
  name: string;
  /** 插件版本 */
  version: string;
  /** 插件描述 */
  description?: string;
}

/**
 * AgentToolkit 插件接口
 * 扩展基础 Plugin 接口，增加注册方法
 */
export interface AgentToolkitPlugin extends Plugin {
  /** 插件名称（固定为 agent-toolkit） */
  name: 'agent-toolkit';
  /** 插件版本 */
  version: '1.0.0';
  /** 注册插件，返回插件注册对象 */
  register(): PluginRegistration;
}

/**
 * 插件注册对象
 * 提供对各个模块的访问（延迟加载）
 */
export interface PluginRegistration {
  /** LLM 模块 */
  llm: typeof import('../llm/index.js');
  /** Team 模块 */
  team: typeof import('../team/index.js');
  /** Skills 模块 */
  skills: typeof import('../skills/index.js');
  /** Memory 模块 */
  memory: typeof import('../memory/index.js');
  /** Tools 模块 */
  tools: typeof import('../tools/index.js');
  /** Middleware 模块 */
  middleware: typeof import('../middleware/index.js');
  /** Observability 模块 */
  observability: typeof import('../observability/index.js');
  /** Session 模块 */
  session: typeof import('../session/index.js');
  /** Retry 模块 */
  retry: typeof import('../retry/index.js');
  /** Errors 模块 */
  errors: typeof import('../errors/index.js');
  /** Context 模块 */
  context: typeof import('../context/index.js');
  /** QA 模块 */
  qa: typeof import('../qa/index.js');
  /** Edge 模块 */
  edge: typeof import('../edge/index.js');
  /** Autogen 模块 */
  autogen: typeof import('../autogen/index.js');
  /** LangChain 模块 */
  langchain: typeof import('../langchain/index.js');
}

/**
 * 插件初始化配置
 */
export interface PluginInitConfig {
  /** 按需加载的模块列表 */
  modules?: (keyof PluginRegistration)[];
  /** 是否启用调试模式 */
  debug?: boolean;
}

/**
 * 插件初始化结果
 */
export interface PluginInitResult {
  /** 插件实例 */
  plugin: AgentToolkitPlugin;
  /** 注册对象 */
  registration: PluginRegistration;
  /** 已加载的模块列表 */
  loadedModules: (keyof PluginRegistration)[];
}

/**
 * 模块加载器类型
 */
export type ModuleLoader<T> = () => Promise<T>;

/**
 * 延迟加载模块的接口
 */
export interface LazyModule<T> {
  /** 加载模块 */
  load(): Promise<T>;
  /** 检查模块是否已加载 */
  isLoaded(): boolean;
  /** 获取模块（如果已加载） */
  get(): T | undefined;
}
