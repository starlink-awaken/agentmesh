/**
 * SkillLoader - 技能加载器
 * 支持 YAML/JSON 定义加载、按需加载 references
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  SkillDefinition,
  SkillInstance,
  SkillLoadOptions,
} from './types.js';

export class SkillLoader {
  private skills: Map<string, SkillDefinition> = new Map();
  private referencesCache: Map<string, Map<string, string>> = new Map();

  constructor() {
    this.initializeBuiltInSkills();
  }

  /**
   * 注册技能
   */
  register(skill: SkillDefinition): void {
    if (this.skills.has(skill.id)) {
      console.warn(`Skill ${skill.id} already registered, overwriting...`);
    }
    this.skills.set(skill.id, skill);
  }

  /**
   * 批量注册技能
   */
  registerMany(skills: SkillDefinition[]): void {
    for (const skill of skills) {
      this.register(skill);
    }
  }

  /**
   * 获取所有技能
   */
  getAll(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * 根据 ID 获取技能定义
   */
  get(id: string): SkillDefinition | undefined {
    return this.skills.get(id);
  }

  /**
   * 加载技能实例
   */
  async load(id: string, options: SkillLoadOptions = {}): Promise<SkillInstance | null> {
    const definition = this.skills.get(id);
    if (!definition) {
      return null;
    }

    const instance: SkillInstance = {
      definition,
      loadedReferences: new Map(),
    };

    // 加载参考文档
    if (options.loadReferences || options.loadSpecificReferences) {
      await this.loadReferences(instance, options);
    }

    return instance;
  }

  /**
   * 加载参考文档
   */
  private async loadReferences(
    instance: SkillInstance,
    options: SkillLoadOptions
  ): Promise<void> {
    const { definition } = instance;

    if (options.loadSpecificReferences) {
      // 加载指定的参考文档
      for (const topic of options.loadSpecificReferences) {
        const route = definition.references.find(r => r.topic === topic);
        if (route) {
          const content = await this.loadReferenceContent(definition.id, route.file);
          instance.loadedReferences.set(topic, content);
        }
      }
    } else if (options.loadReferences) {
      // 加载所有参考文档
      for (const route of definition.references) {
        const content = await this.loadReferenceContent(definition.id, route.file);
        instance.loadedReferences.set(route.topic, content);
      }
    }
  }

  /**
   * 加载单个参考文档内容
   */
  private async loadReferenceContent(skillId: string, file: string): Promise<string> {
    const cacheKey = `${skillId}`;
    const fileCache = this.referencesCache.get(cacheKey);

    if (fileCache?.has(file)) {
      return fileCache.get(file)!;
    }

    // 尝试从文件系统加载
    try {
      const path = `./skills/${skillId}/references/${file}`;
      const content = await this.loadFile(path);

      if (!this.referencesCache.has(cacheKey)) {
        this.referencesCache.set(cacheKey, new Map());
      }
      this.referencesCache.get(cacheKey)!.set(file, content);

      return content;
    } catch {
      // 如果文件不存在，返回占位符
      return `# ${file}\n\n> Reference content not found.`;
    }
  }

  /**
   * 加载文件内容
   * 支持从文件系统读取 SKILL.md、YAML、JSON 配置
   * 处理相对路径和绝对路径
   * @param filePath 文件路径
   * @param baseDir 可选的基准目录，用于解析相对路径
   */
  async loadFile(filePath: string, baseDir?: string): Promise<string> {
    // 解析路径
    let resolvedPath: string;

    if (path.isAbsolute(filePath)) {
      resolvedPath = filePath;
    } else if (baseDir) {
      // 相对于指定基准目录
      resolvedPath = path.resolve(baseDir, filePath);
    } else {
      // 相对于当前工作目录
      resolvedPath = path.resolve(process.cwd(), filePath);
    }

    try {
      const content = await fs.readFile(resolvedPath, 'utf-8');
      return content;
    } catch (error) {
      // 如果文件不存在，尝试多种扩展名
      const extensions = ['', '.md', '.yaml', '.yml', '.json'];

      for (const ext of extensions) {
        try {
          const extPath = resolvedPath + ext;
          const content = await fs.readFile(extPath, 'utf-8');
          return content;
        } catch {
          // 继续尝试下一个扩展名
        }
      }

      throw new Error(`File not found: ${filePath}`);
    }
  }

  /**
   * 根据关键词搜索技能
   */
  search(query: string): SkillDefinition[] {
    const lowerQuery = query.toLowerCase();
    const results: Array<{ skill: SkillDefinition; score: number }> = [];

    for (const skill of this.skills.values()) {
      let score = 0;

      // 名称匹配
      if (skill.name.toLowerCase().includes(lowerQuery)) {
        score += 10;
      }

      // 描述匹配
      if (skill.description.toLowerCase().includes(lowerQuery)) {
        score += 5;
      }

      // 触发词匹配
      for (const trigger of skill.triggers) {
        if (trigger.toLowerCase().includes(lowerQuery)) {
          score += 3;
        }
      }

      // 分类匹配
      if (skill.category.toLowerCase().includes(lowerQuery)) {
        score += 2;
      }

      if (score > 0) {
        results.push({ skill, score });
      }
    }

    // 按分数排序
    results.sort((a, b) => b.score - a.score);
    return results.map(r => r.skill);
  }

  /**
   * 初始化内置技能
   */
  private initializeBuiltInSkills(): void {
    // 这里会在后面添加内置技能
    // 临时占位，后续迁移 AlgorithmEngine、C4Model 等
  }
}
