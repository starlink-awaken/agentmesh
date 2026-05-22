/**
 * OpenContext Adapter
 *
 * 连接 OpenContext 的存储后端，复用跨项目知识
 *
 * OpenContext 使用 Markdown 文件存储上下文：
 * - contexts/ 目录下按文件夹组织
 * - 每个 .md 文件包含 frontmatter 元数据
 * - 支持 Manifest 文件管理文件夹内容
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  parseMarkdownContext,
  toMarkdown,
  type MemoryEntry,
} from './MarkdownParser.js';

/**
 * OpenContext 配置
 */
export interface OpenContextConfig {
  /** OpenContext contexts 目录路径 */
  contextPath: string;
  /** 可选：上下文文件夹名称 */
  defaultFolder?: string;
  /** 是否监听文件变化 (可选，默认 false) */
  enableWatch?: boolean;
  /** 文件变化防抖毫秒数 (默认 300ms) */
  watchDebounceMs?: number;
}

/**
 * ContextManifest - 文件夹清单
 */
export interface ContextManifest {
  id: string;
  name: string;
  description: string;
  files: ContextFile[];
  updatedAt: number;
}

/**
 * ContextFile - 上下文文件
 */
export interface ContextFile {
  name: string;
  path: string;
  size: number;
  updatedAt?: number;
}

/**
 * RetrievedContext - 检索的上下文
 */
export interface RetrievedContext {
  folder: string;
  entries: MemoryEntry[];
}

/**
 * OpenContext Adapter 实现
 */
export class OpenContextAdapter {
  private config: Required<OpenContextConfig>;
  private contextsDir: string;
  private initialized = false;
  private fileWatcher?: {
    close: () => void;
  };

  constructor(config: OpenContextConfig) {
    this.config = {
      contextPath: config.contextPath,
      defaultFolder: config.defaultFolder || 'default',
      enableWatch: config.enableWatch ?? false,
      watchDebounceMs: config.watchDebounceMs ?? 300,
    };

    this.contextsDir = path.resolve(this.config.contextPath);
    // 不在构造时初始化，使用懒加载
  }

  /**
   * 确保目录已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    await fs.mkdir(this.contextsDir, { recursive: true });
    await fs.mkdir(path.join(this.contextsDir, this.config.defaultFolder), {
      recursive: true,
    });
    this.initialized = true;
  }

  /**
   * 确保指定文件夹存在
   */
  private async ensureFolderExists(folder?: string): Promise<string> {
    const targetFolder = folder || this.config.defaultFolder;
    const folderPath = path.join(this.contextsDir, targetFolder);
    await fs.mkdir(folderPath, { recursive: true });
    return folderPath;
  }

  /**
   * 获取配置
   */
  getConfig(): OpenContextConfig {
    return { ...this.config };
  }

  /**
   * 检索上下文 - 获取指定文件夹中的所有记忆
   */
  async retrieveContext(query: string | string[]): Promise<RetrievedContext> {
    await this.ensureInitialized();

    // query 可以是文件夹名称或数组（多文件夹）
    const folders = Array.isArray(query) ? query : [query];

    const entries: MemoryEntry[] = [];

    for (const folder of folders) {
      const folderPath = path.join(this.contextsDir, folder);
      const exists = await this.folderExists(folder);

      if (exists) {
        const files = await this.listMarkdownFiles(folderPath);
        for (const file of files) {
          const content = await fs.readFile(file, 'utf-8');
          const entry = parseMarkdownContext(content);
          if (isMemoryEntry(entry)) {
            entries.push(entry);
          }
        }
      }
    }

    return {
      folder: folders[0] || this.config.defaultFolder,
      entries,
    };
  }

  /**
   * 存储记忆 - 将记忆写入 Markdown 文件
   */
  async storeMemory(entry: MemoryEntry, folder?: string): Promise<void> {
    const folderPath = await this.ensureFolderExists(folder);

    // 生成文件名（使用 ID）
    const filename = this.sanitizeFilename(entry.id);
    const filePath = path.join(folderPath, `${filename}.md`);

    // 转换为 Markdown 并写入
    const markdown = toMarkdown(entry);
    await fs.writeFile(filePath, markdown, 'utf-8');
  }

  /**
   * 搜索 - 在所有上下文中搜索匹配的记忆
   */
  async search(query: string): Promise<MemoryEntry[]> {
    await this.ensureInitialized();
    const results: MemoryEntry[] = [];
    const folders = await this.listFolders();

    for (const folder of folders) {
      const folderPath = path.join(this.contextsDir, folder);
      const files = await this.listMarkdownFiles(folderPath);

      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8');

        // 简单文本匹配（可扩展为全文搜索）
        if (content.toLowerCase().includes(query.toLowerCase())) {
          const entry = parseMarkdownContext(content);
          if (isMemoryEntry(entry)) {
            results.push(entry);
          }
        }
      }
    }

    return results;
  }

  /**
   * 获取 Manifest - 获取文件夹的文件清单
   */
  async getManifest(folder?: string): Promise<ContextManifest> {
    await this.ensureInitialized();

    const targetFolder = folder || this.config.defaultFolder;
    const folderPath = path.join(this.contextsDir, targetFolder);

    const exists = await this.folderExists(targetFolder);
    const files: ContextFile[] = [];

    if (exists) {
      const markdownFiles = await this.listMarkdownFiles(folderPath);

      for (const file of markdownFiles) {
        const stat = await fs.stat(file);
        const content = await fs.readFile(file, 'utf-8');
        const entry = parseMarkdownContext(content);
        const memoryEntry = isMemoryEntry(entry) ? entry : null;

        files.push({
          name: path.basename(file),
          path: file,
          size: stat.size,
          updatedAt: (memoryEntry?.metadata?.updatedAt as number | undefined) || stat.mtimeMs,
        });
      }
    }

    return {
      id: targetFolder,
      name: targetFolder,
      description: `OpenContext folder: ${targetFolder}`,
      files,
      updatedAt: Date.now(),
    };
  }

  /**
   * 列出所有文件夹
   */
  async listFolders(): Promise<string[]> {
    await this.ensureInitialized();

    try {
      const entries = await fs.readdir(this.contextsDir, { withFileTypes: true });
      const folders: string[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          folders.push(entry.name);
        }
      }

      return folders.sort();
    } catch {
      return [];
    }
  }

  /**
   * 创建文件夹
   */
  async createFolder(name: string, description?: string): Promise<void> {
    await this.ensureInitialized();
    const folderPath = path.join(this.contextsDir, name);
    await fs.mkdir(folderPath, { recursive: true });

    // 可选：创建描述文件
    if (description) {
      const descPath = path.join(folderPath, '.folder-description');
      await fs.writeFile(descPath, description, 'utf-8');
    }
  }

  /**
   * 获取特定文件夹中的所有记忆
   */
  async getMemoriesInFolder(folder?: string): Promise<MemoryEntry[]> {
    await this.ensureInitialized();

    const folderPath = path.join(
      this.contextsDir,
      folder || this.config.defaultFolder
    );

    const targetFolder = folder || this.config.defaultFolder;
    if (!(await this.folderExists(targetFolder))) {
      return [];
    }

    const files = await this.listMarkdownFiles(folderPath);
    const entries: MemoryEntry[] = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const entry = parseMarkdownContext(content);
      if (isMemoryEntry(entry)) {
        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * 获取单个记忆
   */
  async getMemory(id: string, folder?: string): Promise<MemoryEntry | null> {
    await this.ensureInitialized();

    const folderPath = path.join(
      this.contextsDir,
      folder || this.config.defaultFolder
    );
    const filePath = path.join(folderPath, `${this.sanitizeFilename(id)}.md`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const entry = parseMarkdownContext(content);
      return isMemoryEntry(entry) ? entry : null;
    } catch {
      return null;
    }
  }

  /**
   * 更新记忆
   */
  async updateMemory(
    id: string,
    updates: Partial<MemoryEntry>,
    folder?: string
  ): Promise<boolean> {
    const existing = await this.getMemory(id, folder);
    if (!existing) return false;

    const updated: MemoryEntry = {
      ...existing,
      ...updates,
      id: existing.id, // 保持 ID 不变
    };

    await this.storeMemory(updated, folder);
    return true;
  }

  /**
   * 删除记忆
   */
  async deleteMemory(id: string, folder?: string): Promise<boolean> {
    await this.ensureInitialized();

    const folderPath = path.join(
      this.contextsDir,
      folder || this.config.defaultFolder
    );
    const filePath = path.join(folderPath, `${this.sanitizeFilename(id)}.md`);

    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 同步 - 同步远程（目前为 no-op，未来可扩展）
   */
  async sync(): Promise<void> {
    await this.ensureInitialized();
    // TODO: 实现与 OpenContext MCP 服务器的同步
    // 当前只是占位，未来可以调用 oc CLI 或 MCP 工具
    return Promise.resolve();
  }

  /**
   * 监听文件变化
   */
  async watch(onChange: (file: string) => void): Promise<void> {
    if (!this.config.enableWatch) return;

    // 使用 fs.watch 监听目录变化
    const watcher = fs.watch(this.contextsDir, { recursive: true });
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    for await (const event of watcher) {
      if (debounceTimer) clearTimeout(debounceTimer);

      debounceTimer = setTimeout(() => {
        onChange(event.filename || '');
      }, this.config.watchDebounceMs);
    }
  }

  /**
   * 关闭监视器
   */
  closeWatcher(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = undefined;
    }
  }

  // ============================================================================
  // 私有辅助方法
  // ============================================================================

  /**
   * 检查文件夹是否存在
   */
  private async folderExists(folderPath: string): Promise<boolean> {
    const fullPath = path.join(this.contextsDir, folderPath);
    try {
      const stat = await fs.stat(fullPath);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * 列出 Markdown 文件
   */
  private async listMarkdownFiles(folderPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(path.join(folderPath, entry.name));
        }
      }

      return files;
    } catch {
      return [];
    }
  }

  /**
   * 清理文件名（安全化）
   */
  private sanitizeFilename(id: string): string {
    return id
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
  }
}

// ============================================================================
// 类型守卫
// ============================================================================

/**
 * 检查是否是 MemoryEntry
 */
function isMemoryEntry(obj: unknown): obj is MemoryEntry {
  if (!obj || typeof obj !== 'object') return false;
  const entry = obj as Record<string, unknown>;
  return typeof entry.id === 'string' && typeof entry.content === 'string';
}

// ============================================================================
// 导出
// ============================================================================

export {
  parseMarkdownContext,
  toMarkdown,
};