/**
 * SkillDiscovery - 技能动态发现与加载
 * 支持目录扫描、自动加载、版本管理、热更新、依赖解析
 */
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import type {
  SkillManifest,
  SkillDefinition,
  DiscoveryOptions,
  DiscoveryEvent,
  SkillInstance,
  ReferenceRoute,
} from './types.js';

/**
 * SkillDependencyGraph - 技能依赖图
 */
class SkillDependencyGraph {
  private graph: Map<string, Set<string>> = new Map();

  add(skillId: string, dependencies: string[]): void {
    if (!this.graph.has(skillId)) {
      this.graph.set(skillId, new Set());
    }
    for (const dep of dependencies) {
      this.graph.get(skillId)!.add(dep);
    }
  }

  getDependencies(skillId: string): string[] {
    return Array.from(this.graph.get(skillId) || []);
  }

  hasCircularDependency(skillId: string, visited = new Set<string>()): boolean {
    if (visited.has(skillId)) return true;
    visited.add(skillId);

    const deps = this.graph.get(skillId);
    if (!deps) return false;

    for (const dep of deps) {
      if (this.hasCircularDependency(dep, new Set(visited))) {
        return true;
      }
    }
    return false;
  }

  resolveLoadOrder(skillIds: string[]): string[] {
    const result: string[] = [];
    const visited = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const deps = this.graph.get(id) || [];
      for (const dep of deps) {
        if (skillIds.includes(dep)) {
          visit(dep);
        }
      }
      result.push(id);
    };

    for (const id of skillIds) {
      visit(id);
    }

    return result;
  }
}

/**
 * SkillDiscovery - 技能发现器
 */
export class SkillDiscovery {
  private basePath: string;
  private recursive: boolean = true;
  private patterns: string[] = ['SKILL.md', 'skill.yaml', 'skill.json'];
  private enableWatch: boolean = false;
  private manifests: Map<string, SkillManifest> = new Map();
  private filePaths: Map<string, string> = new Map();
  private dependencyGraph: SkillDependencyGraph = new SkillDependencyGraph();
  private watchers: ReturnType<typeof fsSync.watch>[] = [];

  constructor(options: DiscoveryOptions) {
    this.basePath = options.basePath;
    this.recursive = options.recursive ?? true;
    this.patterns = options.patterns || this.patterns;
    this.enableWatch = options.watch ?? false;
  }

  /**
   * 从指定目录发现所有 Skills
   */
  async discover(options?: Partial<DiscoveryOptions>): Promise<SkillManifest[]> {
    const basePath = options?.basePath || this.basePath;
    const recursive = options?.recursive ?? this.recursive;
    const patterns = options?.patterns || this.patterns;

    const manifests: SkillManifest[] = [];
    await this.scanDirectory(basePath, basePath, recursive, patterns, manifests);

    // 保存发现的 manifest
    for (const manifest of manifests) {
      this.manifests.set(manifest.id, manifest);
      if (manifest.dependencies) {
        this.dependencyGraph.add(manifest.id, manifest.dependencies);
      }
    }

    // 启动文件监听
    if (this.enableWatch) {
      await this.startWatching(basePath, recursive);
    }

    return manifests;
  }

  /**
   * 扫描目录
   */
  private async scanDirectory(
    dirPath: string,
    basePath: string,
    recursive: boolean,
    patterns: string[],
    manifests: SkillManifest[]
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory() && recursive) {
          // 递归扫描子目录
          await this.scanDirectory(fullPath, basePath, recursive, patterns, manifests);
        } else if (entry.isFile()) {
          // 检查是否匹配模式
          for (const pattern of patterns) {
            if (entry.name === pattern) {
              try {
                const manifest = await this.loadManifest(fullPath, basePath);
                if (manifest) {
                  manifests.push(manifest);
                  this.filePaths.set(manifest.id, fullPath);
                }
              } catch (error) {
                console.warn(`Failed to load skill from ${fullPath}:`, error);
              }
              break;
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to scan directory ${dirPath}:`, error);
    }
  }

  /**
   * 加载 Skill 清单文件
   */
  private async loadManifest(filePath: string, basePath: string): Promise<SkillManifest | null> {
    const content = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    let manifest: Partial<SkillManifest>;

    if (ext === '.json') {
      manifest = JSON.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
      manifest = parseYaml(content);
    } else {
      // SKILL.md - 解析 markdown 中的 frontmatter
      manifest = this.parseMarkdownManifest(content);
    }

    if (!manifest.id || !manifest.name) {
      console.warn(`Invalid skill manifest: missing id or name in ${filePath}`);
      return null;
    }

    // 转换 manifest 为 SkillDefinition 格式
    return this.convertToManifest(manifest, filePath, basePath);
  }

  /**
   * 解析 Markdown 中的 manifest（支持 frontmatter）
   */
  private parseMarkdownManifest(content: string): Partial<SkillManifest> {
    // 检查是否有 frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      try {
        return parseYaml(frontmatterMatch[1]);
      } catch {
        // 解析失败，返回空对象
        return {};
      }
    }

    // 从 Markdown 内容中提取
    const lines = content.split('\n');
    const manifest: Partial<SkillManifest> = {};
    let inTriggers = false;
    let triggers: string[] = [];
    let inReferences = false;
    let references: Array<{ topic: string; file: string; loadWhen: string }> = [];

    for (const line of lines) {
      if (line.startsWith('# ')) {
        if (!manifest.name) {
          manifest.name = line.slice(2).trim();
        }
      } else if (line.startsWith('## ')) {
        const section = line.slice(3).trim().toLowerCase();
        if (section === 'triggers') {
          inTriggers = true;
          inReferences = false;
        } else if (section === 'references') {
          inReferences = true;
          inTriggers = false;
        } else {
          inTriggers = false;
          inReferences = false;
        }
      } else if (inTriggers && line.trim().startsWith('-')) {
        const trigger = line.trim().slice(1).trim();
        if (trigger) triggers.push(trigger);
      } else if (inReferences && line.trim().startsWith('-')) {
        const refMatch = line.trim().match(/- \*\*(\w+)\*\*: `([^`]+)` \((.+)\)/);
        if (refMatch) {
          references.push({
            topic: refMatch[1],
            file: refMatch[2],
            loadWhen: refMatch[3],
          });
        }
      }
    }

    manifest.triggers = triggers;
    if (references.length > 0) {
      manifest.references = references;
    }

    return manifest;
  }

  /**
   * 转换 manifest 格式
   */
  private convertToManifest(
    manifest: Partial<SkillManifest>,
    filePath: string,
    basePath: string
  ): SkillManifest {
    // 确定 category 和 role（如果未指定）
    const category = manifest.category || this.inferCategory(filePath, basePath);
    const role = manifest.role || 'specialist';

    return {
      id: manifest.id!,
      name: manifest.name!,
      version: manifest.version || '1.0.0',
      description: manifest.description || '',
      longDescription: manifest.longDescription,
      triggers: manifest.triggers || [],
      role: role as SkillManifest['role'],
      scope: manifest.scope || 'implementation',
      outputFormat: manifest.outputFormat || 'mixed',
      category,
      dependencies: manifest.dependencies,
      references: manifest.references || [],
      author: manifest.author,
    };
  }

  /**
   * 推断 category
   */
  private inferCategory(filePath: string, basePath: string): string {
    const relativePath = path.relative(basePath, filePath);
    const parts = relativePath.split(path.sep);
    if (parts.length >= 2) {
      return parts[0];
    }
    return 'general';
  }

  /**
   * 加载 Skill 实例
   */
  async load(skillId: string): Promise<SkillInstance | null> {
    const manifest = this.manifests.get(skillId);
    if (!manifest) {
      return null;
    }

    // 解析依赖
    const definition = this.manifestToDefinition(manifest);

    const instance: SkillInstance = {
      definition,
      loadedReferences: new Map(),
    };

    return instance;
  }

  /**
   * 转换 manifest 为 SkillDefinition
   */
  private manifestToDefinition(manifest: SkillManifest): SkillDefinition {
    return {
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      longDescription: manifest.longDescription,
      triggers: manifest.triggers,
      role: manifest.role,
      scope: manifest.scope,
      outputFormat: manifest.outputFormat,
      category: manifest.category,
      dependencies: manifest.dependencies,
      references: manifest.references as ReferenceRoute[],
    };
  }

  /**
   * 重新加载 Skill
   */
  async reload(skillId: string): Promise<void> {
    const filePath = this.filePaths.get(skillId);
    if (!filePath) {
      throw new Error(`Skill ${skillId} not found in discovered skills`);
    }

    const manifest = await this.loadManifest(filePath, this.basePath);
    if (manifest) {
      this.manifests.set(skillId, manifest);
      if (manifest.dependencies) {
        this.dependencyGraph.add(skillId, manifest.dependencies);
      }
    }
  }

  /**
   * 监听文件变化
   */
  async watch(callback: (event: DiscoveryEvent) => void): Promise<void> {
    await this.startWatching(this.basePath, this.recursive);
    // 启动轮询
    this.pollChanges(callback);
  }

  /**
   * 轮询变化
   */
  private pollChanges(callback: (event: DiscoveryEvent) => void): void {
    setInterval(async () => {
      const currentManifests = new Map<string, SkillManifest>();
      const manifests: SkillManifest[] = [];
      await this.scanDirectory(this.basePath, this.basePath, this.recursive, this.patterns, manifests);

      for (const manifest of manifests) {
        currentManifests.set(manifest.id, manifest);
      }

      // 检测新增
      for (const [id, manifest] of currentManifests) {
        if (!this.manifests.has(id)) {
          this.manifests.set(id, manifest);
          callback({
            type: 'added',
            skillId: id,
            path: this.filePaths.get(id) || '',
            timestamp: Date.now(),
          });
        }
      }

      // 检测变化
      for (const [id, manifest] of currentManifests) {
        const existing = this.manifests.get(id);
        if (existing && this.isManifestChanged(existing, manifest)) {
          this.manifests.set(id, manifest);
          callback({
            type: 'changed',
            skillId: id,
            path: this.filePaths.get(id) || '',
            timestamp: Date.now(),
          });
        }
      }

      // 检测删除
      for (const [id] of this.manifests) {
        if (!currentManifests.has(id)) {
          const removedPath = this.filePaths.get(id) || '';
          this.manifests.delete(id);
          callback({
            type: 'removed',
            skillId: id,
            path: removedPath,
            timestamp: Date.now(),
          });
        }
      }
    }, 1000);
  }

  /**
   * 比较 manifest 是否变化
   */
  private isManifestChanged(a: SkillManifest, b: SkillManifest): boolean {
    return (
      a.version !== b.version ||
      a.name !== b.name ||
      a.description !== b.description ||
      JSON.stringify(a.triggers) !== JSON.stringify(b.triggers)
    );
  }

  /**
   * 启动文件监听
   */
  private async startWatching(basePath: string, recursive: boolean): Promise<void> {
    if (this.watchers.length > 0) {
      return;
    }

    try {
      const watcher = fsSync.watch(basePath, { recursive }, (eventType: string, filename: string | null) => {
        if (filename) {
          console.log(`File ${eventType}: ${filename}`);
        }
      });
      this.watchers.push(watcher);
    } catch (error) {
      console.warn(`Failed to start watching ${basePath}:`, error);
    }
  }

  /**
   * 获取所有已发现的 Skills
   */
  getDiscoveredSkills(): SkillManifest[] {
    return Array.from(this.manifests.values());
  }

  /**
   * 获取技能依赖
   */
  getDependencies(skillId: string): string[] {
    return this.dependencyGraph.getDependencies(skillId);
  }

  /**
   * 解析并加载依赖
   */
  async resolveDependencies(skillId: string): Promise<SkillInstance[]> {
    const allIds = Array.from(this.manifests.keys());
    const loadOrder = this.dependencyGraph.resolveLoadOrder(allIds);

    const instances: SkillInstance[] = [];
    const loaded = new Set<string>();

    for (const id of loadOrder) {
      if (id === skillId || this.dependsOn(id, skillId, loaded)) {
        const instance = await this.load(id);
        if (instance) {
          instances.push(instance);
          loaded.add(id);
        }
      }
    }

    return instances;
  }

  /**
   * 检查是否依赖
   */
  private dependsOn(skillId: string, targetId: string, loaded: Set<string>): boolean {
    const deps = this.dependencyGraph.getDependencies(skillId);
    return deps.includes(targetId) || deps.some((d) => loaded.has(d) && this.dependsOn(d, targetId, loaded));
  }

  /**
   * 停止监听
   */
  async stopWatching(): Promise<void> {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
  }
}

/**
 * 创建 SkillDiscovery 实例
 */
export function createSkillDiscovery(options: DiscoveryOptions): SkillDiscovery {
  return new SkillDiscovery(options);
}
