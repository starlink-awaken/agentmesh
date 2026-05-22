/**
 * DataSources - Substrate 数据源接口
 *
 * 定义 13 种数据源的接口规范
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * 数据源类型枚举（13种）
 */
export enum DataSourceType {
  /** 本地文件 */
  LOCAL_FILE = 'local_file',
  /** 数据库 */
  DATABASE = 'database',
  /** API */
  API = 'api',
  /** Web 抓取 */
  WEB_SCRAPING = 'web_scraping',
  /** RSS 订阅 */
  RSS = 'rss',
  /** 邮件 */
  EMAIL = 'email',
  /** 日志 */
  LOG = 'log',
  /** 消息队列 */
  MESSAGE_QUEUE = 'message_queue',
  /** 实时流 */
  STREAM = 'stream',
  /** 云存储 */
  CLOUD_STORAGE = 'cloud_storage',
  /** 知识库 */
  KNOWLEDGE_BASE = 'knowledge_base',
  /** 向量数据库 */
  VECTOR_DB = 'vector_db',
  /** 图表数据 */
  GRAPH_DB = 'graph_db',
}

/**
 * 数据源配置
 */
export interface DataSourceConfig {
  type: DataSourceType;
  name: string;
  connection: Record<string, any>;
  options?: Record<string, any>;
}

/**
 * 数据查询选项
 */
export interface QueryOptions {
  /** 过滤条件 */
  filters?: Record<string, any>;
  /** 排序 */
  sort?: { field: string; order: 'asc' | 'desc' }[];
  /** 分页 */
  pagination?: { page: number; pageSize: number };
  /** 超时时间 */
  timeout?: number;
}

/**
 * 数据源结果
 */
export interface DataSourceResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * BaseDataSource - 数据源基类
 */
export abstract class BaseDataSource<T = any> {
  protected config: DataSourceConfig;
  protected connected: boolean = false;

  constructor(config: DataSourceConfig) {
    this.config = config;
  }

  /**
   * 连接数据源
   */
  abstract connect(): Promise<void>;

  /**
   * 断开连接
   */
  abstract disconnect(): Promise<void>;

  /**
   * 查询数据
   */
  abstract query(query: string, options?: QueryOptions): Promise<DataSourceResult<T>>;

  /**
   * 写入数据
   */
  abstract write(data: T, options?: Record<string, any>): Promise<DataSourceResult>;

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 获取数据源类型
   */
  getType(): DataSourceType {
    return this.config.type;
  }

  /**
   * 获取数据源名称
   */
  getName(): string {
    return this.config.name;
  }
}

/**
 * DataSourceFactory - 数据源工厂
 */
export class DataSourceFactory {
  private static sources: Map<string, BaseDataSource> = new Map();

  /**
   * 创建数据源实例
   */
  static create(config: DataSourceConfig): BaseDataSource {
    // 根据类型创建对应的数据源
    const source = this.createByType(config);
    this.sources.set(config.name, source);
    return source;
  }

  /**
   * 根据类型创建
   */
  private static createByType(config: DataSourceConfig): BaseDataSource {
    switch (config.type) {
      case DataSourceType.LOCAL_FILE:
        return new LocalFileDataSource(config);
      case DataSourceType.DATABASE:
        return new DatabaseDataSource(config);
      case DataSourceType.API:
        return new APIDataSource(config);
      case DataSourceType.VECTOR_DB:
        return new VectorDBDataSource(config);
      case DataSourceType.KNOWLEDGE_BASE:
        return new KnowledgeBaseDataSource(config);
      // 其他类型可以继续扩展
      default:
        throw new Error(`不支持的数据源类型: ${config.type}`);
    }
  }

  /**
   * 获取已创建的数据源
   */
  static get(name: string): BaseDataSource | undefined {
    return this.sources.get(name);
  }

  /**
   * 获取所有数据源
   */
  static getAll(): BaseDataSource[] {
    return Array.from(this.sources.values());
  }

  /**
   * 移除数据源
   */
  static remove(name: string): boolean {
    return this.sources.delete(name);
  }
}

/**
 * LocalFileDataSource - 本地文件数据源
 */
class LocalFileDataSource extends BaseDataSource<string> {
  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async query(query: string, options?: QueryOptions): Promise<DataSourceResult<string>> {
    // 预留：实现文件读取逻辑
    return {
      success: true,
      data: '',
      metadata: { type: 'local_file' },
    };
  }

  async write(data: string, options?: Record<string, any>): Promise<DataSourceResult> {
    // 预留：实现文件写入逻辑
    return { success: true };
  }
}

/**
 * DatabaseDataSource - 数据库数据源
 */
class DatabaseDataSource extends BaseDataSource {
  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async query(query: string, options?: QueryOptions): Promise<DataSourceResult> {
    // 预留：实现数据库查询逻辑
    return { success: true, data: [] };
  }

  async write(data: any, options?: Record<string, any>): Promise<DataSourceResult> {
    // 预留：实现数据库写入逻辑
    return { success: true };
  }
}

/**
 * APIDataSource - API 数据源
 */
class APIDataSource extends BaseDataSource {
  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async query(query: string, options?: QueryOptions): Promise<DataSourceResult> {
    // 预留：实现 API 调用逻辑
    return { success: true, data: {} };
  }

  async write(data: any, options?: Record<string, any>): Promise<DataSourceResult> {
    // 预留：实现 API 写入逻辑
    return { success: true };
  }
}

/**
 * VectorDBDataSource - 向量数据库数据源
 */
class VectorDBDataSource extends BaseDataSource {
  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async query(query: string, options?: QueryOptions): Promise<DataSourceResult> {
    // 预留：实现向量搜索逻辑
    return { success: true, data: [] };
  }

  async write(data: any, options?: Record<string, any>): Promise<DataSourceResult> {
    // 预留：实现向量写入逻辑
    return { success: true };
  }
}

/**
 * KnowledgeBaseDataSource - 知识库数据源
 */
class KnowledgeBaseDataSource extends BaseDataSource {
  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async query(query: string, options?: QueryOptions): Promise<DataSourceResult> {
    // 预留：实现知识库查询逻辑
    return { success: true, data: [] };
  }

  async write(data: any, options?: Record<string, any>): Promise<DataSourceResult> {
    // 预留：实现知识库写入逻辑
    return { success: true };
  }
}

