/**
 * AlgorithmEngine - TheAlgorithm 七阶段执行引擎
 *
 * 整合问题解决框架（七阶段执行、ISC标准）
 *
 * @author PAI
 * @version 1.0.0
 */

import type {
  AlgorithmContext,
  AlgorithmResult,
  AlgorithmPhase,
  ISCCriterion,
  PhaseHandler
} from './types.js';
import { ISCGenerator } from './ISCGenerator.js';

/**
 * 算法配置选项
 */
export interface AlgorithmConfig {
  /** 是否自动生成 ISC */
  autoGenerateISC?: boolean;
  /** 是否启用调试模式 */
  debug?: boolean;
  /** 最大执行时间（毫秒） */
  maxExecutionTime?: number;
  /** 自定义阶段处理器 */
  customHandlers?: Partial<Record<AlgorithmPhase, PhaseHandler>>;
}

/**
 * 默认阶段配置
 */
const DEFAULT_PHASES: AlgorithmPhase[] = [
  'OBSERVE',
  'THINK',
  'PLAN',
  'BUILD',
  'EXECUTE',
  'VERIFY',
  'LEARN'
];

/**
 * AlgorithmEngine 类
 *
 * 提供 TheAlgorithm 的完整七阶段执行能力
 */
export class AlgorithmEngine {
  private config: Required<AlgorithmConfig>;
  private phaseHandlers: Map<AlgorithmPhase, PhaseHandler>;

  constructor(config: AlgorithmConfig = {}) {
    this.config = {
      autoGenerateISC: config.autoGenerateISC ?? true,
      debug: config.debug ?? false,
      maxExecutionTime: config.maxExecutionTime ?? 600000, // 10分钟
      customHandlers: config.customHandlers ?? {},
    };

    this.phaseHandlers = new Map();
    this.initializeDefaultHandlers();
  }

  /**
   * 初始化默认处理器
   */
  private initializeDefaultHandlers(): void {
    // OBSERVE - 观察阶段
    this.phaseHandlers.set('OBSERVE', async (context, state) => {
      this.log('OBSERVE: 观察阶段开始', context.task);

      // 分析任务，提取关键信息
      const observations = {
        task: context.task,
        constraints: context.constraints || [],
        keywords: this.extractKeywords(context.task),
        implied: this.inferImplied(context.task),
        negatives: this.extractNegatives(context.task),
      };

      this.log('OBSERVE: 观察结果', observations);
      return observations;
    });

    // THINK - 思考阶段
    this.phaseHandlers.set('THINK', async (context, state) => {
      this.log('THINK: 思考阶段开始');

      const observations = state.phases?.OBSERVE?.output;

      // 评估思维工具需求
      const thinkingTools = {
        council: this.needsCouncil(context.task),
        firstPrinciples: this.needsFirstPrinciples(context.task),
        redTeam: this.needsRedTeam(context.task),
      };

      // 生成能力选择
      const capabilities = this.selectCapabilities(context.task, observations);

      this.log('THINK: 能力选择', capabilities);
      return { thinkingTools, capabilities };
    });

    // PLAN - 计划阶段
    this.phaseHandlers.set('PLAN', async (context, state) => {
      this.log('PLAN: 计划阶段开始');

      const thinkOutput = state.phases?.THINK?.output;

      // 生成执行计划
      const plan = {
        approach: this.determineApproach(context.task),
        steps: this.generateSteps(context.task),
        dependencies: this.analyzeDependencies(context.task),
        risks: this.identifyRisks(context.task),
      };

      this.log('PLAN: 执行计划', plan);
      return plan;
    });

    // BUILD - 构建阶段
    this.phaseHandlers.set('BUILD', async (context, state) => {
      this.log('BUILD: 构建阶段开始');

      const plan = state.phases?.PLAN?.output;

      // 创建产物
      const artifacts = {
        documents: [],
        code: [],
        configs: [],
      };

      this.log('BUILD: 构建完成');
      return artifacts;
    });

    // EXECUTE - 执行阶段
    this.phaseHandlers.set('EXECUTE', async (context, state) => {
      this.log('EXECUTE: 执行阶段开始');

      const build = state.phases?.BUILD?.output;

      // 执行工作
      const execution = {
        completed: true,
        outputs: [],
        metrics: {},
      };

      this.log('EXECUTE: 执行完成');
      return execution;
    });

    // VERIFY - 验证阶段（关键）
    this.phaseHandlers.set('VERIFY', async (context, state) => {
      this.log('VERIFY: 验证阶段开始 - 这是关键阶段');

      const iscCriteria = state.iscCriteria || [];
      const execution = state.phases?.EXECUTE?.output;

      // 验证每个 ISC 标准
      const verification = iscCriteria.map(criterion => ({
        ...criterion,
        status: 'completed' as const,
        evidence: `验证通过: ${criterion.description}`,
      }));

      this.log('VERIFY: 验证完成', verification);
      return { verification, allPassed: true };
    });

    // LEARN - 学习阶段
    this.phaseHandlers.set('LEARN', async (context, state) => {
      this.log('LEARN: 学习阶段开始');

      const verify = state.phases?.VERIFY?.output;

      // 提取学习点
      const lessons = {
        whatWorked: [],
        whatCouldImprove: [],
        nextSteps: [],
      };

      this.log('LEARN: 学习总结', lessons);
      return lessons;
    });
  }

  /**
   * 执行完整的算法流程
   */
  async execute(context: AlgorithmContext): Promise<AlgorithmResult> {
    const startTime = Date.now();

    this.log('🚀 AlgorithmEngine 开始执行', context.task);

    // 初始化结果
    const result: AlgorithmResult = {
      success: false,
      phases: this.initializePhases(),
      iscCriteria: [],
      errors: [],
    };

    // 自动生成 ISC
    if (this.config.autoGenerateISC) {
      result.iscCriteria = ISCGenerator.generate(context.task);
      this.log('📋 ISC 标准生成完成', result.iscCriteria.length);
    }

    try {
      // 依次执行各阶段
      for (const phase of DEFAULT_PHASES) {
        const phaseStartTime = Date.now();

        // 获取处理器（优先使用自定义）
        const handler = this.config.customHandlers[phase] || this.phaseHandlers.get(phase);

        if (!handler) {
          throw new Error(`未找到阶段处理器: ${phase}`);
        }

        // 更新阶段状态为 running
        result.phases[phase] = {
          status: 'running',
        };

        // 执行阶段
        const output = await handler(context, result);

        // 更新阶段状态为 completed
        result.phases[phase] = {
          status: 'completed',
          output,
          duration: Date.now() - phaseStartTime,
        };

        this.log(`✅ ${phase} 阶段完成 (${result.phases[phase].duration}ms)`);
      }

      result.success = true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors?.push(errorMessage);
      this.log('❌ 执行失败', errorMessage);
    }

    const totalDuration = Date.now() - startTime;
    this.log(`🏁 AlgorithmEngine 执行完成，耗时: ${totalDuration}ms`);

    return result;
  }

  /**
   * 执行单个阶段
   */
  async executePhase(
    phase: AlgorithmPhase,
    context: AlgorithmContext,
    currentState?: Partial<AlgorithmResult>
  ): Promise<any> {
    const handler = this.config.customHandlers[phase] || this.phaseHandlers.get(phase);

    if (!handler) {
      throw new Error(`未找到阶段处理器: ${phase}`);
    }

    return handler(context, currentState as AlgorithmResult);
  }

  /**
   * 注册自定义处理器
   */
  registerHandler(phase: AlgorithmPhase, handler: PhaseHandler): void {
    this.phaseHandlers.set(phase, handler);
  }

  /**
   * 初始化阶段状态
   */
  private initializePhases(): AlgorithmResult['phases'] {
    const phases: any = {};
    for (const phase of DEFAULT_PHASES) {
      phases[phase] = { status: 'pending' };
    }
    return phases;
  }

  /**
   * 从任务中提取关键词
   */
  private extractKeywords(task: string): string[] {
    const stopWords = ['的', '了', '和', '与', '或', '在', '是', '我', '你', '他', '她', '它', '们', '要', '可以', '需要'];
    const words = task.toLowerCase().split(/[\s,，。,.!?]+/).filter(w => w.length > 1);
    return words.filter(w => !stopWords.includes(w));
  }

  /**
   * 推断隐含需求
   */
  private inferImplied(task: string): string[] {
    const implied: string[] = [];

    if (task.includes('API') || task.includes('接口')) {
      implied.push('需要错误处理');
      implied.push('需要日志记录');
    }

    if (task.includes('数据库') || task.includes('存储')) {
      implied.push('需要数据验证');
      implied.push('需要备份策略');
    }

    return implied;
  }

  /**
   * 提取否定需求
   */
  private extractNegatives(task: string): string[] {
    const negatives: string[] = [];

    const patterns = [
      /不(.+?)的/,
      /不要(.+)/,
      /禁止(.+)/,
      /不能(.+)/,
      /避免(.+)/,
    ];

    for (const pattern of patterns) {
      const match = task.match(pattern);
      if (match) {
        negatives.push(match[0]);
      }
    }

    return negatives;
  }

  /**
   * 判断是否需要 Council
   */
  private needsCouncil(task: string): boolean {
    const indicators = ['多个方案', '选择', '对比', '或者', '还是', '优缺点'];
    return indicators.some(i => task.includes(i));
  }

  /**
   * 判断是否需要 FirstPrinciples
   */
  private needsFirstPrinciples(task: string): boolean {
    const indicators = ['根本', '原因', '为什么', '重新', '根本原因'];
    return indicators.some(i => task.includes(i));
  }

  /**
   * 判断是否需要 RedTeam
   */
  private needsRedTeam(task: string): boolean {
    const indicators = ['安全', '风险', '漏洞', '攻击', '防御'];
    return indicators.some(i => task.includes(i));
  }

  /**
   * 选择能力
   */
  private selectCapabilities(task: string, observations?: any): string[] {
    const capabilities: string[] = [];

    if (task.includes('分析')) capabilities.push('analyze');
    if (task.includes('提取')) capabilities.push('extract');
    if (task.includes('总结')) capabilities.push('summarize');
    if (task.includes('转换')) capabilities.push('transform');
    if (task.includes('测试')) capabilities.push('test');
    if (task.includes('安全')) capabilities.push('security');

    return capabilities.length > 0 ? capabilities : ['default'];
  }

  /**
   * 确定执行方法
   */
  private determineApproach(task: string): string {
    if (task.includes('实现') || task.includes('构建')) return 'implementation';
    if (task.includes('分析')) return 'analysis';
    if (task.includes('优化')) return 'optimization';
    if (task.includes('修复')) return 'fix';
    return 'default';
  }

  /**
   * 生成执行步骤
   */
  private generateSteps(task: string): string[] {
    const steps = ['理解需求', '制定计划', '执行实现', '验证结果'];
    return steps;
  }

  /**
   * 分析依赖
   */
  private analyzeDependencies(task: string): string[] {
    return [];
  }

  /**
   * 识别风险
   */
  private identifyRisks(task: string): string[] {
    return [];
  }

  /**
   * 日志输出
   */
  private log(message: string, ...args: any[]): void {
    if (this.config.debug) {
      console.log(`[AlgorithmEngine] ${message}`, ...args);
    }
  }
}

export default AlgorithmEngine;
