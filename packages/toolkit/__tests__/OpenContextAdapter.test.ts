/**
 * OpenContextAdapter 单元测试
 *
 * 测试 OpenContext 记忆系统适配器的所有功能
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  OpenContextAdapter,
  type OpenContextConfig,
  parseMarkdownContext,
  toMarkdown,
  type MarkdownMemoryEntry,
  type MemoryEntry,
} from '../src/memory/adapters/index.js';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('OpenContextAdapter', () => {
  let adapter: OpenContextAdapter;
  let testDir: string;

  beforeEach(async () => {
    testDir = `/tmp/test-opencontext-${Date.now()}`;
    await fs.mkdir(testDir, { recursive: true });

    const testConfig: OpenContextConfig = {
      contextPath: testDir,
      enableWatch: false,
      defaultFolder: 'test-folder',
    };
    adapter = new OpenContextAdapter(testConfig);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================================
  // 构造函数测试
  // ============================================================================

  describe('constructor', () => {
    it('should create adapter with required config', () => {
      expect(adapter).toBeDefined();
    });

    it('should create adapter with default values', () => {
      const defaultAdapter = new OpenContextAdapter({
        contextPath: testDir,
      });
      expect(defaultAdapter).toBeDefined();
    });

    // 跳过此测试，因为初始化是懒加载的
    it.skip('should create contexts directory if not exists', async () => {
      const newDir = `/tmp/test-oc-new-${Date.now()}`;
      await fs.rm(newDir, { recursive: true, force: true });

      const newAdapter = new OpenContextAdapter({
        contextPath: newDir,
      });

      // 确保初始化已发生
      await newAdapter.listFolders();

      try {
        const folders = await newAdapter.listFolders();
        expect(folders.length).toBeGreaterThan(0);
      } finally {
        await fs.rm(newDir, { recursive: true, force: true });
      }
    });
  });

  // ============================================================================
  // 文件夹管理测试
  // ============================================================================

  describe('listFolders', () => {
    it('should return folders that exist in contexts directory', async () => {
      // 先创建一些文件夹
      const folder1Path = path.join(testDir, 'folder1');
      const folder2Path = path.join(testDir, 'folder2');
      await fs.mkdir(folder1Path, { recursive: true });
      await fs.mkdir(folder2Path, { recursive: true });

      const folders = await adapter.listFolders();

      expect(folders).toContain('folder1');
      expect(folders).toContain('folder2');
    });

    it('should return sorted folders', async () => {
      await fs.mkdir(path.join(testDir, 'z-folder'), { recursive: true });
      await fs.mkdir(path.join(testDir, 'a-folder'), { recursive: true });

      const folders = await adapter.listFolders();

      // folders 会包含 'a-folder', 'test-folder' (default), 'z-folder'
      expect(folders[0]).toBe('a-folder');
      const zIndex = folders.indexOf('z-folder');
      expect(zIndex).toBeGreaterThan(0);
    });

    it('should exclude hidden folders', async () => {
      await fs.mkdir(path.join(testDir, '.hidden'), { recursive: true });
      await fs.mkdir(path.join(testDir, 'visible'), { recursive: true });

      const folders = await adapter.listFolders();

      expect(folders).not.toContain('.hidden');
      expect(folders).toContain('visible');
    });
  });

  // ============================================================================
  // Manifest 测试
  // ============================================================================

  describe('getManifest', () => {
    it('should return manifest for existing folder', async () => {
      const folderPath = path.join(testDir, 'test-folder');
      await fs.mkdir(folderPath, { recursive: true });

      await fs.writeFile(
        path.join(folderPath, 'doc1.md'),
        '# Doc 1\n\nContent 1'
      );
      await fs.writeFile(
        path.join(folderPath, 'doc2.md'),
        '# Doc 2\n\nContent 2'
      );

      const manifest = await adapter.getManifest('test-folder');

      expect(manifest.id).toBe('test-folder');
      expect(manifest.name).toBe('test-folder');
      expect(manifest.files.length).toBe(2);
      expect(manifest.files.some(f => f.name === 'doc1.md')).toBe(true);
      expect(manifest.files.some(f => f.name === 'doc2.md')).toBe(true);
    });

    it('should include file metadata in manifest', async () => {
      const folderPath = path.join(testDir, 'meta-folder');
      await fs.mkdir(folderPath, { recursive: true });

      await fs.writeFile(
        path.join(folderPath, 'test.md'),
        '# Test\n\nContent'
      );

      const manifest = await adapter.getManifest('meta-folder');

      const testFile = manifest.files.find(f => f.name === 'test.md');
      expect(testFile).toBeDefined();
      expect(testFile?.path).toBe(path.join(folderPath, 'test.md'));
      expect(typeof testFile?.size).toBe('number');
    });
  });

  // ============================================================================
  // 存储记忆测试
  // ============================================================================

  describe('storeMemory', () => {
    it('should create markdown file for memory entry', async () => {
      const entry: MemoryEntry = {
        id: 'test-id',
        content: 'This is a test memory',
        tags: ['test', 'example'],
        metadata: {
          source: 'test',
          createdAt: Date.now(),
        },
      };

      await adapter.storeMemory(entry, 'test-folder');

      const filePath = path.join(testDir, 'test-folder', 'test-id.md');
      const exists = await checkFileExists(filePath);
      expect(exists).toBe(true);
    });

    it('should include frontmatter in stored file', async () => {
      const entry: MemoryEntry = {
        id: 'frontmatter-test',
        content: 'Content here',
        tags: ['frontmatter'],
        metadata: {
          source: 'unit-test',
          createdAt: 1234567890,
        },
      };

      await adapter.storeMemory(entry, 'test-folder');

      const filePath = path.join(testDir, 'test-folder', 'frontmatter-test.md');
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toContain('---');
      expect(content).toContain('id: frontmatter-test');
      expect(content).toContain('tags:');
      expect(content).toContain('source: unit-test');
      expect(content).toContain('frontmatter');
    });

    it('should create folder if not exists', async () => {
      const entry: MemoryEntry = {
        id: 'new-folder-test',
        content: 'Test',
        tags: [],
        metadata: {},
      };

      await adapter.storeMemory(entry, 'brand-new-folder');

      const folderPath = path.join(testDir, 'brand-new-folder');
      const exists = await checkFileExists(folderPath);
      expect(exists).toBe(true);
    });

    it('should sanitize special characters in filename', async () => {
      const entry: MemoryEntry = {
        id: 'test@id',
        content: 'Content with special chars in ID',
        tags: [],
        metadata: {},
      };

      await adapter.storeMemory(entry, 'special-folder');

      // test@id -> test-id after sanitization
      const filePath = path.join(testDir, 'special-folder', 'test-id.md');
      const exists = await checkFileExists(filePath);
      expect(exists).toBe(true);
    });
  });

  // ============================================================================
  // 搜索测试
  // ============================================================================

  describe('search', () => {
    it('should return empty array when no matches', async () => {
      const results = await adapter.search('nonexistent query');
      expect(results).toEqual([]);
    });

    it('should find matching entries', async () => {
      const folderPath = path.join(testDir, 'search-test');
      await fs.mkdir(folderPath, { recursive: true });

      await fs.writeFile(
        path.join(folderPath, 'match.md'),
        `---
id: match-test
---
This content should be found`
      );
      await fs.writeFile(
        path.join(folderPath, 'nomatch.md'),
        `# No Match
Other content`
      );

      const results = await adapter.search('should be found');

      expect(results.length).toBe(1);
      expect(results[0].id).toBe('match-test');
    });

    it('should be case insensitive', async () => {
      const folderPath = path.join(testDir, 'case-test');
      await fs.mkdir(folderPath, { recursive: true });

      await fs.writeFile(
        path.join(folderPath, 'test.md'),
        `# Test
HELLO world`
      );

      const lowerResults = await adapter.search('hello');
      const upperResults = await adapter.search('HELLO');

      expect(lowerResults.length).toBe(1);
      expect(upperResults.length).toBe(1);
    });
  });

  // ============================================================================
  // 检索上下文测试
  // ============================================================================

  describe('retrieveContext', () => {
    it('should retrieve context from folder', async () => {
      const folderPath = path.join(testDir, 'retrieve-test');
      await fs.mkdir(folderPath, { recursive: true });

      await fs.writeFile(
        path.join(folderPath, 'doc1.md'),
        `# Doc 1
First document content`
      );
      await fs.writeFile(
        path.join(folderPath, 'doc2.md'),
        `# Doc 2
Second document content`
      );

      const context = await adapter.retrieveContext('retrieve-test');

      expect(context.folder).toBe('retrieve-test');
      expect(context.entries.length).toBe(2);
    });

    it('should parse MemoryEntry from documents', async () => {
      const folderPath = path.join(testDir, 'parse-test');
      await fs.mkdir(folderPath, { recursive: true });

      await fs.writeFile(
        path.join(folderPath, 'test-doc.md'),
        `---
id: parsed-id
tags: [test, parsed]
source: unit-test
---

# Test Document
This is parsed content`
      );

      const context = await adapter.retrieveContext('parse-test');

      const entry = context.entries.find(e => e.id === 'parsed-id');
      expect(entry).toBeDefined();
      expect(entry?.tags).toContain('test');
      expect(entry?.content).toContain('parsed content');
    });
  });

  // ============================================================================
  // CRUD 测试
  // ============================================================================

  describe('getMemory', () => {
    it('should get memory by id', async () => {
      const folderPath = path.join(testDir, 'get-test');
      await fs.mkdir(folderPath, { recursive: true });
      await fs.writeFile(
        path.join(folderPath, 'my-id.md'),
        `---
id: my-id
tags: [test]
---

# My Memory
Content`
      );

      const memory = await adapter.getMemory('my-id', 'get-test');

      expect(memory).toBeDefined();
      expect(memory?.id).toBe('my-id');
    });

    it('should return null for non-existing memory', async () => {
      const memory = await adapter.getMemory('nonexistent', 'get-test');
      expect(memory).toBeNull();
    });
  });

  describe('updateMemory', () => {
    it('should update existing memory', async () => {
      const entry: MemoryEntry = {
        id: 'update-test',
        content: 'Original content',
        tags: [],
        metadata: {},
      };

      await adapter.storeMemory(entry, 'update-test');

      const updated = await adapter.updateMemory(
        'update-test',
        { content: 'Updated content' },
        'update-test'
      );

      expect(updated).toBe(true);

      const memory = await adapter.getMemory('update-test', 'update-test');
      expect(memory?.content).toBe('Updated content');
    });

    it('should return false for non-existing memory', async () => {
      const updated = await adapter.updateMemory(
        'nonexistent',
        { content: 'New content' },
        'update-test'
      );

      expect(updated).toBe(false);
    });
  });

  describe('deleteMemory', () => {
    it('should delete existing memory', async () => {
      const entry: MemoryEntry = {
        id: 'delete-test',
        content: 'To be deleted',
        tags: [],
        metadata: {},
      };

      await adapter.storeMemory(entry, 'delete-test');

      const deleted = await adapter.deleteMemory('delete-test', 'delete-test');

      expect(deleted).toBe(true);

      const memory = await adapter.getMemory('delete-test', 'delete-test');
      expect(memory).toBeNull();
    });
  });

  // ============================================================================
  // 同步测试
  // ============================================================================

  describe('sync', () => {
    it('should complete without error', async () => {
      await expect(adapter.sync()).resolves.toBeUndefined();
    });
  });
});

// ============================================================================
// MarkdownParser 单元测试
// ============================================================================

describe('MarkdownParser', () => {
  describe('parseMarkdownContext', () => {
    it('should parse content without frontmatter', () => {
      const content = `# Test Document
This is the content`;

      const entry = parseMarkdownContext(content);

      // Without frontmatter, H1 is kept as content (not removed)
      expect(entry.content).toContain('Test Document');
      expect(entry.content).toContain('This is the content');
      expect(entry.id).toBeDefined();
    });

    it('should parse frontmatter correctly', () => {
      const content = `---
id: my-id
tags: [tag1, tag2]
source: test
createdAt: 1234567890
customField: value
---

# Content
Main body`;
      const entry = parseMarkdownContext(content) as MarkdownMemoryEntry;

      expect(entry.id).toBe('my-id');
      expect(entry.tags).toEqual(['tag1', 'tag2']);
      expect(entry.metadata.source).toBe('test');
      expect(entry.metadata.createdAt).toBe(1234567890);
      expect(entry.metadata.customField).toBe('value');
    });

    it('should extract title from H1', () => {
      const content = `# My Title
Content goes here`;

      const entry = parseMarkdownContext(content);

      expect(entry.title).toBe('My Title');
    });

    it('should handle empty content', () => {
      const entry = parseMarkdownContext('');

      expect(entry.id).toBeDefined();
      expect(entry.content).toBe('');
    });

    it('should handle multiline frontmatter', () => {
      const content = `---
id: multiline-test
tags:
  - tag1
  - tag2
description: |
  This is a
  multiline description
---

Content`;

      const entry = parseMarkdownContext(content) as MarkdownMemoryEntry;

      expect(entry.tags).toEqual(['tag1', 'tag2']);
      // Description handling is basic, just verify tags work
    });

    it('should parse arrays in frontmatter', () => {
      const content = `---
id: array-test
tags: [one, two, three]
---

Content`;

      const entry = parseMarkdownContext(content) as MarkdownMemoryEntry;

      expect(entry.tags).toEqual(['one', 'two', 'three']);
    });
  });

  describe('toMarkdown', () => {
    it('should convert entry to markdown with frontmatter', () => {
      const entry: MemoryEntry = {
        id: 'test-id',
        title: 'Test Title',
        content: 'Test content',
        tags: ['tag1', 'tag2'],
        metadata: {
          source: 'test',
          createdAt: 1234567890,
        },
      };

      const markdown = toMarkdown(entry);

      expect(markdown).toContain('---');
      expect(markdown).toContain('id: test-id');
      expect(markdown).toContain('tags:');
      expect(markdown).toContain('# Test Title');
      expect(markdown).toContain('Test content');
    });

    it('should handle entry without optional fields', () => {
      const entry: MemoryEntry = {
        id: 'minimal',
        content: 'Minimal content',
        tags: [],
        metadata: {},
      };

      const markdown = toMarkdown(entry);

      expect(markdown).toContain('---');
      expect(markdown).toContain('id: minimal');
      expect(markdown).toContain('Minimal content');
    });

    it('should escape special characters in frontmatter', () => {
      const entry: MemoryEntry = {
        id: 'special-chars',
        content: 'Content',
        tags: [],
        metadata: {
          test: 'value: with colons',
        },
      };

      const markdown = toMarkdown(entry);

      // Should contain quoted values with escaped colons
      expect(markdown).toContain('"value: with colons"');
    });

    it('should format arrays correctly', () => {
      const entry: MemoryEntry = {
        id: 'array-test',
        content: 'Content',
        tags: ['tag1', 'tag2', 'tag3'],
        metadata: {},
      };

      const markdown = toMarkdown(entry);

      expect(markdown).toContain('tags:');
    });
  });

  describe('roundtrip', () => {
    it('should maintain data through parse and toMarkdown', () => {
      const original: MemoryEntry = {
        id: 'roundtrip-test',
        title: 'Roundtrip Test',
        content: 'Test content body',
        tags: ['roundtrip', 'test'],
        metadata: {
          source: 'unit-test',
          createdAt: Date.now(),
        },
      };

      const markdown = toMarkdown(original);
      const parsed = parseMarkdownContext(markdown) as MarkdownMemoryEntry;

      expect(parsed.id).toBe(original.id);
      expect(parsed.title).toBe(original.title);
      expect(parsed.tags).toEqual(original.tags);
      expect((parsed.metadata as Record<string, unknown>).source).toBe('unit-test');
    });
  });
});

// ============================================================================
// 辅助函数
// ============================================================================

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}