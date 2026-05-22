/**
 * 质量门禁 ISC 表达式迁移测试
 *
 * 测试质量门禁从旧格式（pass_condition）自动转换为新格式（ISC expression）
 *
 * @since v2.0.0
 */

import { describe, it, expect } from 'bun:test';
import { DomainLoader } from '../src/domain-loader.js';
import type { QualityGateCriterion } from '../src/types.js';

describe('Quality Gate ISC Migration', () => {
  it('should auto-convert pass_condition to expression', async () => {
    const loader = new DomainLoader('../domains');  // ← 修复路径：tests/ → 根目录的 domains/

    // 加载 software 域（包含旧格式质量门禁）
    const domain = loader.loadDomain('software-dev');

    // 验证质量门禁已加载
    expect(domain.quality_gates).toBeDefined();
    expect(domain.quality_gates.length).toBeGreaterThan(0);

    // 查找 "Code Quality"（注意：domain.json 中的名称可能和 quality-gates/*.json 文件中的名称不同）
    const codeQualityGate = domain.quality_gates.find(g => g.name === 'Code Quality');
    expect(codeQualityGate).toBeDefined();

    // 验证 criteria 数组
    expect(codeQualityGate!.criteria).toBeDefined();
    expect(codeQualityGate!.criteria.length).toBeGreaterThan(0);

    // 验证第一个 criterion 的自动转换
    const firstCriterion = codeQualityGate!.criteria[0] as QualityGateCriterion;

    // ✅ 新格式：expression 字段存在
    expect(firstCriterion.expression).toBeDefined();
    expect(typeof firstCriterion.expression).toBe('string');

    // ✅ 旧格式：pass_condition 字段仍然保留（向后兼容）
    expect(firstCriterion.pass_condition).toBeDefined();
    expect(typeof firstCriterion.pass_condition).toBe('string');

    // ✅ 两个字段应该相等（自动复制）
    expect(firstCriterion.expression).toBe(firstCriterion.pass_condition);

    // ✅ expected_variables 已自动提取
    expect(firstCriterion.expected_variables).toBeDefined();
    expect(Array.isArray(firstCriterion.expected_variables)).toBe(true);

    console.log('✅ 自动转换成功！');
    console.log(`Criterion: ${firstCriterion.name}`);
    console.log(`  expression: ${firstCriterion.expression}`);
    console.log(`  pass_condition: ${firstCriterion.pass_condition}`);
    console.log(`  expected_variables: ${firstCriterion.expected_variables.join(', ')}`);
  });

  it('should extract variables from expression', async () => {
    const loader = new DomainLoader('../domains');  // ← 修复路径

    // 加载 software 域
    const domain = loader.loadDomain('software-dev');

    const codeQualityGate = domain.quality_gates.find(g => g.name === 'Code Quality');
    expect(codeQualityGate).toBeDefined();

    const firstCriterion = codeQualityGate!.criteria[0] as QualityGateCriterion;

    // 验证变量提取逻辑
    // 表达式格式：coverage >= 80
    // 应该提取出 "coverage" 变量
    expect(firstCriterion.expected_variables).toContain('coverage');
  });

  it('should support mixed format (both pass_condition and expression)', async () => {
    const loader = new DomainLoader('./domains');

    // 模拟混合格式的质量门禁配置
    const mixedConfig = {
      name: 'Test Gate',
      phase: 'feedback',
      criteria: [
        {
          id: 'test-1',
          name: 'Old Format Criterion',
          pass_condition: 'coverage >= 80',  // 旧格式
        },
        {
          id: 'test-2',
          name: 'New Format Criterion',
          expression: 'errors == 0',  // 新格式
        },
        {
          id: 'test-3',
          name: 'Mixed Format Criterion',
          pass_condition: 'performance < 100',
          expression: 'performance < 100',  // 两者都有
        },
      ],
      mandatory: true,
    };

    // 验证配置（通过 validateDomainConfig）
    const validatedDomain = loader.validateDomainConfig({
      name: 'test',
      description: 'Test domain',
      archetype: 'software-dev',
      version: '1.0.0',
      phase_prompts: {},
      agent_overrides: {},
      defaults: {},
      templates: {},
      quality_gates: [mixedConfig],
    });

    expect(validatedDomain.quality_gates).toBeDefined();
    expect(validatedDomain.quality_gates.length).toBe(1);

    const gate = validatedDomain.quality_gates[0];
    expect(gate.criteria.length).toBe(3);

    // 验证第一个 criterion（旧格式自动转换）
    const crit1 = gate.criteria[0] as QualityGateCriterion;
    expect(crit1.expression).toBe('coverage >= 80');
    expect(crit1.pass_condition).toBe('coverage >= 80');

    // 验证第二个 criterion（新格式）
    const crit2 = gate.criteria[1] as QualityGateCriterion;
    expect(crit2.expression).toBe('errors == 0');
    expect(crit2.pass_condition).toBeUndefined();

    // 验证第三个 criterion（混合格式）
    const crit3 = gate.criteria[2] as QualityGateCriterion;
    expect(crit3.expression).toBe('performance < 100');
    expect(crit3.pass_condition).toBe('performance < 100');
  });

  it('should filter out keywords from extracted variables', () => {
    // 直接测试 extractVariables 方法（通过访问私有方法的副作用）
    const loader = new DomainLoader('../domains');  // ← 修复路径

    // 加载一个包含关键字的表达式
    const config = {
      name: 'test',
      description: 'Test domain',
      archetype: 'software-dev',
      version: '1.0.0',
      phase_prompts: {},
      agent_overrides: {},
      defaults: {},
      templates: {},
      quality_gates: [
        {
          name: 'Test Gate',
          phase: 'feedback',
          criteria: [
            {
              id: 'test-1',
              name: 'Test Criterion',
              pass_condition: 'coverage >= 80 AND errors == 0',  // 包含 AND 关键字
            },
          ],
          mandatory: true,
        },
      ],
    };

    const validatedDomain = loader.validateDomainConfig(config);
    const criterion = validatedDomain.quality_gates[0].criteria[0] as QualityGateCriterion;

    // 应该提取出变量，但不包含关键字 "AND"
    expect(criterion.expected_variables).toContain('coverage');
    expect(criterion.expected_variables).toContain('errors');
    expect(criterion.expected_variables).not.toContain('AND');
  });
});
