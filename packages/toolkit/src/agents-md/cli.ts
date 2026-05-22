/**
 * AGENTS.md CLI 工具
 *
 * 提供 build、serve、watch 命令
 */

import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { DocumentParser } from './DocumentParser.js';
import { KeywordExtractor } from './KeywordExtractor.js';
import { AgentsMdIndexer } from './AgentsMdIndexer.js';
import { createVectorStore } from '../knowledge/VectorStore.js';
import type { CLIConfig } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 查找 AGENTS.md 文件
 */
async function findAgentsMdFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      const subFiles = await findAgentsMdFiles(fullPath);
      files.push(...subFiles);
    } else if (entry.isFile() && entry.name.toLowerCase() === 'agents.md') {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Build 命令
 *
 * @param config - CLI 配置
 */
export async function buildCommand(config: CLIConfig): Promise<void> {
  const inputPath = config.inputPath || process.cwd();
  const outputPath = config.outputPath || join(process.cwd(), '.agents-md-index');

  console.log('🔍 扫描 AGENTS.md 文件...');

  const files = await findAgentsMdFiles(inputPath);

  if (files.length === 0) {
    console.log('❌ 未找到 AGENTS.md 文件');
    return;
  }

  console.log(`📄 找到 ${files.length} 个 AGENTS.md 文件`);

  // 初始化组件
  const parser = new DocumentParser();
  const extractor = new KeywordExtractor();
  const vectorStore = createVectorStore({
    provider: 'memory',
    dimension: 384,
  });

  const indexer = new AgentsMdIndexer({
    vectorStore,
    enableBM25: true,
    enableVector: true,
  });

  // 索引所有文档
  for (const file of files) {
    console.log(`📑 处理: ${file}`);

    try {
      const content = await readFile(file, 'utf-8');
      const docId = file.replace(/[^a-zA-Z0-9]/g, '_');

      // 解析文档
      const sections = parser.parse(content);
      console.log(`   - 章节数: ${sections.length}`);

      // 提取关键词
      const keywords = extractor.extract(content);
      console.log(`   - 关键词数: ${keywords.length}`);

      // 压缩索引
      const compressed = parser.compress(sections);
      console.log(`   - 压缩后大小: ${(compressed.compressedSize / 1024).toFixed(2)} KB`);

      // 添加到索引
      await indexer.indexDocument(docId, content, {
        filePath: file,
        stats: parser.getStats(content),
      });

      // 输出压缩索引
      const indexOutput = join(outputPath, `${docId}.json`);
      await writeFile(
        indexOutput,
        JSON.stringify(compressed, null, 2),
        'utf-8'
      );
      console.log(`   ✅ 已保存: ${indexOutput}`);
    } catch (error) {
      console.error(`   ❌ 处理失败: ${error}`);
    }
  }

  const stats = indexer.getStats();
  console.log('\n📊 索引统计:');
  console.log(`   - 文档数: ${stats.documentCount}`);
  console.log(`   - 章节数: ${stats.sectionCount}`);
  console.log(`   - 总字符数: ${stats.totalChars}`);

  console.log('\n✅ Build 完成!');
}

/**
 * Serve 命令
 *
 * @param config - CLI 配置
 */
export async function serveCommand(config: CLIConfig): Promise<void> {
  const port = config.port || 3000;
  const inputPath = config.inputPath || process.cwd();

  console.log('🔍 初始化索引...');

  // 初始化组件
  const parser = new DocumentParser();
  const extractor = new KeywordExtractor();
  const vectorStore = createVectorStore({
    provider: 'memory',
    dimension: 384,
  });

  const indexer = new AgentsMdIndexer({
    vectorStore,
    enableBM25: true,
    enableVector: true,
  });

  // 查找并索引文件
  const files = await findAgentsMdFiles(inputPath);

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const docId = file.replace(/[^a-zA-Z0-9]/g, '_');
    await indexer.indexDocument(docId, content, { filePath: file });
  }

  console.log(`✅ 索引加载完成，已索引 ${files.length} 个文档`);
  console.log(`\n🌐 服务器启动在 http://localhost:${port}`);
  console.log('📝 API 端点:');
  console.log(`   - GET  /search?q=<query> - 搜索`);
  console.log(`   - GET  /stats           - 统计信息`);
  console.log(`   - GET  /documents       - 所有文档`);
  console.log('\n按 Ctrl+C 停止服务器');

  // 简单的 HTTP 服务器
  const http = await import('http');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    res.setHeader('Content-Type', 'application/json');

    try {
      if (url.pathname === '/search' && url.searchParams.has('q')) {
        const query = url.searchParams.get('q')!;
        const topK = parseInt(url.searchParams.get('k') || '5');
        const results = await indexer.search(query, topK);
        res.end(JSON.stringify({ results }));
      } else if (url.pathname === '/stats') {
        res.end(JSON.stringify(indexer.getStats()));
      } else if (url.pathname === '/documents') {
        res.end(JSON.stringify(indexer.getAllDocuments().map(d => ({
          id: d.id,
          title: d.title,
          importance: d.importance,
        }))));
      } else if (url.pathname === '/health') {
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(error) }));
    }
  });

  server.listen(port, () => {
    // 服务器已启动
  });

  // 处理关闭
  process.on('SIGINT', () => {
    console.log('\n\n🛑 关闭服务器...');
    server.close(() => {
      console.log('✅ 服务器已关闭');
      process.exit(0);
    });
  });
}

/**
 * Watch 命令
 *
 * @param config - CLI 配置
 */
export async function watchCommand(config: CLIConfig): Promise<void> {
  console.log('👀 Watch 模式启动...');
  console.log('📝 监听文件变化，自动重建索引');
  console.log('\n按 Ctrl+C 停止');

  // 初始 build
  await buildCommand(config);

  // 使用 fs.watch 监听变化
  const fs = await import('fs');
  const inputPath = config.inputPath || process.cwd();

  const watcher = fs.watch(inputPath, { recursive: true }, async (eventType, filename) => {
    if (filename && filename.toLowerCase().includes('agents.md')) {
      console.log(`\n📝 检测到变化: ${eventType} - ${filename}`);
      await buildCommand(config);
    }
  });

  process.on('SIGINT', () => {
    console.log('\n\n🛑 停止 Watch...');
    watcher.close();
    process.exit(0);
  });
}

/**
 * CLI 主入口
 */
export async function main(args: string[]): Promise<void> {
  const command = args[2];

  const config: CLIConfig = {
    inputPath: args.find(a => a.startsWith('--input='))?.replace('--input=', ''),
    outputPath: args.find(a => a.startsWith('--output='))?.replace('--output=', ''),
    port: parseInt(args.find(a => a.startsWith('--port='))?.replace('--port=', '') || '3000'),
    watch: args.includes('--watch'),
  };

  switch (command) {
    case 'build':
      await buildCommand(config);
      break;

    case 'serve':
      await serveCommand(config);
      break;

    case 'watch':
      await watchCommand(config);
      break;

    default:
      console.log(`
AGENTS.md 优化工具

用法:
  agents-md <command> [options]

命令:
  build     构建索引
  serve     启动搜索服务器
  watch     监听文件变化自动重建

选项:
  --input=<path>   输入目录 (默认: 当前目录)
  --output=<path>  输出目录 (默认: .agents-md-index)
  --port=<port>    服务器端口 (默认: 3000)
  --watch          监听模式

示例:
  agents-md build
  agents-md serve --port=8080
  agents-md watch --input=./docs
      `);
  }
}

// 如果直接运行
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch(console.error);
}
