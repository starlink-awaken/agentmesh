/**
 * Markdown Parser
 *
 * 解析和生成 OpenContext 格式的 Markdown 文件
 * 支持 YAML frontmatter 元数据
 */

/**
 * 带 frontmatter 的记忆条目
 */
export interface MarkdownMemoryEntry {
  id: string;
  title?: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

/**
 * 解析 Markdown 内容为 MemoryEntry
 */
export function parseMarkdownContext(content: string): MarkdownMemoryEntry | MemoryEntry {
  let frontmatter: Record<string, unknown> = {};
  let body = content;

  // 提取 frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (frontmatterMatch) {
    frontmatter = parseYaml(frontmatterMatch[1]);
    body = frontmatterMatch[2] || '';
  }

  // 检查是否有 frontmatter
  const hasFrontmatter = frontmatterMatch !== null;

  const id = (frontmatter.id as string) || generateId();
  const tags = extractTags(frontmatter);
  const metadata: Record<string, unknown> = { ...frontmatter };
  delete metadata.id;
  delete metadata.tags;
  delete metadata.title;

  // 提取标题（第一个 H1）
  let title: string | undefined;
  const titleMatch = body.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].trim();
    // 如果有 frontmatter，从 body 中移除标题
    if (hasFrontmatter) {
      body = body.replace(/^#\s+.+\n?/m, '').trim();
    }
  }

  // 如果没有 frontmatter，保留 body 原样（包括可能的 H1 标题）

  return {
    id,
    title,
    content: body,
    tags,
    metadata,
  };
}

/**
 * 将 MemoryEntry 转换为 Markdown 格式
 */
export function toMarkdown(entry: MemoryEntry): string {
  const lines: string[] = ['---'];

  // 构建 frontmatter（排除 content, title, tags, metadata）
  const { content, title, tags, metadata: _metadata, ...restValues } = entry as unknown as Record<string, unknown>;
  // restValues 是其他直接属性（如 source, createdAt 等）

  // 添加 ID
  lines.push(`id: ${escapeYaml(entry.id)}`);

  // 添加标题（如果存在）
  if (entry.title) {
    lines.push(`title: ${escapeYaml(entry.title)}`);
  }

  // 添加标签
  if (entry.tags && entry.tags.length > 0) {
    if (entry.tags.length === 1) {
      lines.push(`tags: [${escapeYaml(entry.tags[0])}]`);
    } else {
      lines.push('tags:');
      for (const tag of entry.tags) {
        lines.push(`  - ${escapeYaml(tag)}`);
      }
    }
  }

  // 添加其他元数据（来自 metadata 字段）
  if (entry.metadata) {
    const meta = entry.metadata as Record<string, unknown>;
    for (const [key, value] of Object.entries(meta)) {
      if (value !== undefined) {
        lines.push(`${key}: ${formatYamlValue(value)}`);
      }
    }
  }

  // 也添加顶层属性（非 metadata）
  for (const [key, value] of Object.entries(restValues)) {
    if (value !== undefined && key !== 'id' && key !== 'title' && key !== 'tags' && key !== 'content' && key !== 'metadata') {
      lines.push(`${key}: ${formatYamlValue(value)}`);
    }
  }

  lines.push('---');

  // 添加标题
  if (entry.title) {
    lines.push(`# ${entry.title}`);
  }

  // 添加内容
  if (entry.content) {
    lines.push(entry.content);
  }

  return lines.join('\n');
}

// ============================================================================
// YAML 解析辅助函数
// ============================================================================

function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let currentKey = '';
  let currentIndent = 0;
  let inArray = false;
  let arrayItems: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const indent = line.match(/^(\s*)/)?.[1].length || 0;

    if (inArray && indent <= currentIndent) {
      // 结束数组
      if (arrayItems.length > 0) {
        result[currentKey] = arrayItems;
      }
      inArray = false;
      arrayItems = [];
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex !== -1) {
      const key = trimmed.slice(0, colonIndex).trim();
      const value = trimmed.slice(colonIndex + 1).trim();

      if (value === '' || value.startsWith('|')) {
        // 多行值开始
        currentKey = key;
        currentIndent = indent;
        if (value.startsWith('|')) {
          // 处理块标量
          result[key] = trimmed.slice(colonIndex + 2).trim();
        }
        inArray = false;
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // 内联数组
        result[key] = parseInlineArray(value);
        inArray = false;
      } else if (value === 'true') {
        result[key] = true;
        inArray = false;
      } else if (value === 'false') {
        result[key] = false;
        inArray = false;
      } else if (!isNaN(Number(value))) {
        result[key] = Number(value);
        inArray = false;
      } else {
        // 字符串
        result[key] = parseStringValue(value);
        inArray = false;
      }
    } else if (trimmed.startsWith('- ')) {
      // 数组项
      const item = trimmed.slice(2).trim();
      inArray = true;
      arrayItems.push(parseStringValue(item));
    }
  }

  // 处理最后剩余的数组
  if (inArray && arrayItems.length > 0) {
    result[currentKey] = arrayItems;
  }

  return result;
}

function parseInlineArray(str: string): string[] {
  const content = str.slice(1, -1).trim();
  if (!content) return [];

  const items: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (const char of content) {
    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = '';
    } else if (char === ',' && !inQuote) {
      if (current.trim()) items.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) items.push(current.trim());

  return items.map(item => parseStringValue(item));
}

function parseStringValue(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function extractTags(frontmatter: Record<string, unknown>): string[] {
  const tags = frontmatter.tags;

  if (Array.isArray(tags)) {
    return tags.map(t => String(t));
  }

  if (typeof tags === 'string') {
    return parseInlineArray(tags);
  }

  return [];
}

function generateId(): string {
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeYaml(value: string): string {
  // 检查是否需要转义
  if (value.includes(':') || value.includes('#') || value.includes('\n') ||
      value.includes('"') || value.includes("'") || value.includes('[') ||
      value.includes(']') || value.includes('{') || value.includes('}') ||
      value.startsWith(' ') || value.endsWith(' ') || value === 'true' ||
      value === 'false' || value === 'null' || !isNaN(Number(value))) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}

function formatYamlValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'string') return escapeYaml(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.map(v => formatYamlValue(v)).join(', ')}]`;
  }
  // 对象
  return escapeYaml(String(value));
}

// ============================================================================
// 类型导出
// ============================================================================

/**
 * 记忆条目接口
 */
export interface MemoryEntry {
  id: string;
  title?: string;
  content: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * 检索的上下文
 */
export interface RetrievedContext {
  folder: string;
  entries: MemoryEntry[];
}

/**
 * OpenContext 配置
 */
export interface OpenContextConfig {
  contextPath: string;
  enableWatch?: boolean;
  watchDebounceMs?: number;
}

/**
 * Context Manifest
 */
export interface ContextManifest {
  id: string;
  name: string;
  description: string;
  files: ContextFile[];
  updatedAt: number;
}

/**
 * 上下文文件
 */
export interface ContextFile {
  name: string;
  path: string;
  size: number;
  updatedAt?: number;
}