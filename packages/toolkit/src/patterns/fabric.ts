/**
 * Fabric 精选模式库
 *
 * 从 240+ 模式中精选的 50+ 高频模式
 *
 * @author PAI
 * @version 1.0.0
 */

import type { PatternDefinition } from './types.js';

/**
 * PatternCategory - 模式分类
 */
export type PatternCategory = 'analyze' | 'extract' | 'summarize' | 'transform';

/**
 * 分析类模式
 */
export const analyzePatterns: PatternDefinition[] = [
  {
    id: 'analyze/trend',
    name: '趋势分析',
    description: '分析数据趋势和变化方向',
    category: 'analyze',
    template: `分析以下内容的趋势：
{{content}}

请识别：
1. 主要趋势方向
2. 关键转折点
3. 异常变化
4. 预测建议`,
    variables: ['content'],
    examples: ['销售数据趋势分析', '用户增长趋势'],
  },
  {
    id: 'analyze/compare',
    name: '对比分析',
    description: '对比多个对象的异同',
    category: 'analyze',
    template: `对比分析以下内容：
{{content}}

请提供：
1. 相同点
2. 不同点
3. 优劣势对比
4. 适用场景建议`,
    variables: ['content'],
    examples: ['方案对比', '产品对比'],
  },
  {
    id: 'analyze/risk',
    name: '风险分析',
    description: '识别和评估潜在风险',
    category: 'analyze',
    template: `对以下内容进行风险分析：
{{content}}

请识别：
1. 主要风险点
2. 风险等级评估
3. 风险原因
4. 缓解建议`,
    variables: ['content'],
    examples: ['项目风险', '投资风险'],
  },
  {
    id: 'analyze/cause',
    name: '原因分析',
    description: '深入分析问题的根本原因',
    category: 'analyze',
    template: `分析以下问题的根本原因：
{{problem}}

请使用根本原因分析方法：
1. 直接原因
2. 间接原因
3. 根本原因
4. 解决方案建议`,
    variables: ['problem'],
    examples: ['问题诊断', '故障分析'],
  },
  {
    id: 'analyze/sentiment',
    name: '情感分析',
    description: '分析文本的情感倾向',
    category: 'analyze',
    template: `分析以下文本的情感：
{{content}}

请识别：
1. 情感倾向（正面/负面/中性）
2. 情感强度
3. 关键情感词
4. 情感原因`,
    variables: ['content'],
    examples: ['评论分析', '反馈分析'],
  },
  {
    id: 'analyze/impact',
    name: '影响分析',
    description: '分析决策或变化的影响',
    category: 'analyze',
    template: `分析以下决策的影响：
{{decision}}

请评估：
1. 正面影响
2. 负面影响
3. 长期影响
4. 利益相关者影响`,
    variables: ['decision'],
    examples: ['决策影响', '变更影响'],
  },
  {
    id: 'analyze/strength',
    name: '优势分析',
    description: '分析竞争优势和优势',
    category: 'analyze',
    template: `分析以下内容的优势：
{{content}}

请识别：
1. 核心优势
2. 差异化特点
3. 竞争壁垒
4. 潜在弱点`,
    variables: ['content'],
    examples: ['竞争优势分析', 'SWOT分析'],
  },
  {
    id: 'analyze/gap',
    name: '差距分析',
    description: '分析现状与目标的差距',
    category: 'analyze',
    template: `分析当前状态与目标的差距：
当前状态：{{current}}
目标状态：{{target}}

请提供：
1. 差距描述
2. 差距原因
3. 缩小差距的建议
4. 优先级建议`,
    variables: ['current', 'target'],
    examples: ['绩效差距', '能力差距'],
  },
];

/**
 * 提取类模式
 */
export const extractPatterns: PatternDefinition[] = [
  {
    id: 'extract/keywords',
    name: '关键词提取',
    description: '从文本中提取关键信息',
    category: 'extract',
    template: `从以下内容中提取关键词：
{{content}}

请提取：
1. 核心关键词（5-10个）
2. 辅助关键词
3. 主题标签
4. 重要术语`,
    variables: ['content'],
    examples: ['关键词提取', '标签提取'],
  },
  {
    id: 'extract/entities',
    name: '实体识别',
    description: '识别文本中的实体信息',
    category: 'extract',
    template: `从以下内容中识别实体：
{{content}}

请识别：
1. 人物
2. 机构/组织
3. 地点
4. 时间
5. 事件
6. 产品/服务`,
    variables: ['content'],
    examples: ['NER', '信息抽取'],
  },
  {
    id: 'extract/structure',
    name: '结构提取',
    description: '提取文本的结构化信息',
    category: 'extract',
    template: `从以下内容中提取结构化信息：
{{content}}

请按以下格式提取：
1. 标题
2. 主要观点
3. 支持证据
4. 结论`,
    variables: ['content'],
    examples: ['文章结构', '大纲提取'],
  },
  {
    id: 'extract/action-items',
    name: '行动项提取',
    description: '从会议或文档中提取行动项',
    category: 'extract',
    template: `从以下内容中提取行动项：
{{content}}

请提取：
1. 任务描述
2. 负责人
3. 截止时间
4. 优先级
5. 依赖关系`,
    variables: ['content'],
    examples: ['会议纪要', '任务提取'],
  },
  {
    id: 'extract/questions',
    name: '问题提取',
    description: '从文本中提取需要回答的问题',
    category: 'extract',
    template: `从以下内容中提取问题：
{{content}}

请识别：
1. 明确问题
2. 隐含问题
3. 待决问题
4. 问题优先级`,
    variables: ['content'],
    examples: ['FAQ提取', '问题梳理'],
  },
  {
    id: 'extract/criteria',
    name: '标准提取',
    description: '提取判断或评估的标准',
    category: 'extract',
    template: `从以下内容中提取评估标准：
{{content}}

请提取：
1. 评估维度
2. 评分标准
3. 权重分配
4. 合格线`,
    variables: ['content'],
    examples: ['标准提取', '要求提取'],
  },
  {
    id: 'extract/metrics',
    name: '指标提取',
    description: '提取性能指标和度量',
    category: 'extract',
    template: `从以下内容中提取关键指标：
{{content}}

请提取：
1. KPI指标
2. 基准值
3. 目标值
4. 测量方法`,
    variables: ['content'],
    examples: ['指标提取', '度量提取'],
  },
  {
    id: 'extract/requirements',
    name: '需求提取',
    description: '从描述中提取需求',
    category: 'extract',
    template: `从以下内容中提取需求：
{{content}}

请分类提取：
1. 功能需求
2. 非功能需求
3. 约束条件
4. 优先级`,
    variables: ['content'],
    examples: ['需求分析', '需求提取'],
  },
];

/**
 * 总结类模式
 */
export const summarizePatterns: PatternDefinition[] = [
  {
    id: 'summarize/executive',
    name: '执行摘要',
    description: '生成简洁的执行摘要',
    category: 'summarize',
    template: `为以下内容生成执行摘要：
{{content}}

要求：
1. 不超过3句话
2. 包含核心信息
3. 面向决策者
4. 关键结论先行`,
    variables: ['content'],
    examples: ['会议摘要', '报告摘要'],
  },
  {
    id: 'summarize/meeting',
    name: '会议纪要',
    description: '生成结构化会议纪要',
    category: 'summarize',
    template: `为以下会议内容生成纪要：
{{content}}

请包含：
1. 会议主题
2. 参与者
3. 讨论要点
4. 决策事项
5. 行动项
6. 下次会议安排`,
    variables: ['content'],
    examples: ['会议记录', '会议总结'],
  },
  {
    id: 'summarize/document',
    name: '文档摘要',
    description: '生成文档的主要内容摘要',
    category: 'summarize',
    template: `为以下文档生成摘要：
{{content}}

请提供：
1. 文档目的
2. 主要内容
3. 关键结论
4. 建议行动`,
    variables: ['content'],
    examples: ['文档总结', '文章摘要'],
  },
  {
    id: 'summarize/code',
    name: '代码摘要',
    description: '生成代码的功能摘要',
    category: 'summarize',
    template: `为以下代码生成功能摘要：
{{code}}

请说明：
1. 代码功能
2. 输入输出
3. 依赖关系
4. 使用示例`,
    variables: ['code'],
    examples: ['代码注释', '函数说明'],
  },
  {
    id: 'summarize/changes',
    name: '变更摘要',
    description: '总结变更内容和影响',
    category: 'summarize',
    template: `总结以下变更：
{{content}}

请包含：
1. 变更内容
2. 变更原因
3. 影响范围
4. 回滚方案（如需要）`,
    variables: ['content'],
    examples: ['变更记录', '版本说明'],
  },
  {
    id: 'summarize/comparison',
    name: '对比摘要',
    description: '生成多选项的对比摘要',
    category: 'summarize',
    template: `为以下选项生成对比摘要：
{{options}}

请提供：
1. 各选项概述
2. 主要差异
3. 适用场景
4. 推荐选择`,
    variables: ['options'],
    examples: ['方案对比', '产品对比'],
  },
  {
    id: 'summarize/progress',
    name: '进度摘要',
    description: '总结项目或任务进度',
    category: 'summarize',
    template: `总结以下进度：
{{content}}

请包含：
1. 总体进度
2. 已完成
3. 进行中
4. 风险与问题
5. 下一步计划`,
    variables: ['content'],
    examples: ['周报', '进度报告'],
  },
  {
    id: 'summarize/decision',
    name: '决策摘要',
    description: '总结决策内容和理由',
    category: 'summarize',
    template: `总结以下决策：
{{content}}

请说明：
1. 决策内容
2. 决策依据
3. 备选方案
4. 预期结果
5. 风险与对策`,
    variables: ['content'],
    examples: ['决策记录', '结论总结'],
  },
];

/**
 * 转换类模式
 */
export const transformPatterns: PatternDefinition[] = [
  {
    id: 'transform/format',
    name: '格式转换',
    description: '将内容转换为不同格式',
    category: 'transform',
    template: `将以下内容转换为{{targetFormat}}格式：
{{content}}

要求：
1. 保持语义完整
2. 符合{{targetFormat}}规范
3. 结构清晰`,
    variables: ['content', 'targetFormat'],
    examples: ['格式转换', '格式规范化'],
  },
  {
    id: 'transform/simplify',
    name: '简化表达',
    description: '将复杂内容简化',
    category: 'transform',
    template: `简化以下内容：
{{content}}

要求：
1. 保留核心信息
2. 使用简单语言
3. 不超过原长度的30%`,
    variables: ['content'],
    examples: ['内容简化', '通俗化'],
  },
  {
    id: 'transform/elaborate',
    name: '详细阐述',
    description: '将简略内容详细化',
    category: 'transform',
    template: `详细阐述以下内容：
{{content}}

请：
1. 添加详细解释
2. 提供例子
3. 补充背景
4. 说明细节`,
    variables: ['content'],
    examples: ['详细说明', '扩展内容'],
  },
  {
    id: 'transform/translate',
    name: '翻译',
    description: '将内容翻译为目标语言',
    category: 'transform',
    template: `将以下内容翻译成{{targetLanguage}}：
{{content}}

要求：
1. 准确传达原意
2. 符合目标语言习惯
3. 保持风格一致`,
    variables: ['content', 'targetLanguage'],
    examples: ['中译英', '语言转换'],
  },
  {
    id: 'transform/structure',
    name: '结构重组',
    description: '重新组织内容结构',
    category: 'transform',
    template: `重新组织以下内容的结构：
{{content}}

请：
1. 重新分类
2. 调整顺序
3. 添加标题
4. 优化层级`,
    variables: ['content'],
    examples: ['结构重组', '大纲重构'],
  },
  {
    id: 'transform/tone',
    name: '语气调整',
    description: '调整内容的语气风格',
    category: 'transform',
    template: `将以下内容调整为{{tone}}语气：
{{content}}

要求：
1. 保持原意
2. 符合{{tone}}风格
3. 自然流畅`,
    variables: ['content', 'tone'],
    examples: ['正式/口语', '友好/严肃'],
  },
  {
    id: 'transform/audience',
    name: '受众调整',
    description: '根据目标受众调整内容',
    category: 'transform',
    template: `将以下内容调整为面向{{audience}}的版本：
{{content}}

请：
1. 调整专业程度
2. 使用适当例子
3. 符合受众习惯`,
    variables: ['content', 'audience'],
    examples: ['面向技术人员', '面向管理层'],
  },
  {
    id: 'transform/refactor',
    name: '代码重构',
    description: '重构优化代码',
    category: 'transform',
    template: `重构以下代码：
{{code}}

请：
1. 提高可读性
2. 优化性能
3. 遵循最佳实践
4. 添加必要注释`,
    variables: ['code'],
    examples: ['代码优化', '代码重构'],
  },
];

/**
 * 所有模式汇总
 */
export const allPatterns: PatternDefinition[] = [
  ...analyzePatterns,
  ...extractPatterns,
  ...summarizePatterns,
  ...transformPatterns,
];

/**
 * 根据 ID 获取模式
 */
export function getPatternById(id: string): PatternDefinition | undefined {
  return allPatterns.find(p => p.id === id);
}

/**
 * 根据分类获取模式
 */
export function getPatternsByCategory(category: PatternDefinition['category']): PatternDefinition[] {
  return allPatterns.filter(p => p.category === category);
}

/**
 * 根据关键词搜索模式
 */
export function searchPatterns(keyword: string): PatternDefinition[] {
  const lower = keyword.toLowerCase();
  return allPatterns.filter(p =>
    p.name.toLowerCase().includes(lower) ||
    p.description.toLowerCase().includes(lower) ||
    p.id.toLowerCase().includes(lower)
  );
}
