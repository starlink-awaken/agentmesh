/**
 * Honeycomb v2 - Capability Validator
 *
 * 能力定义验证器，负责：
 * - 验证能力定义的完整性
 * - 检测循环依赖
 * - 验证能力等级一致性
 * - 验证 Schema 有效性
 */

import type {
  CapabilityDefinition,
  CapabilityValidationResult,
  CapabilityLevel,
  CapabilityDependency,
  IOSchema,
  AgentCapabilities,
} from './capability-schema.js';
import {
  isValidCapabilityType,
  isValidCapabilityLevel,
  meetsCapabilityLevel,
} from './capability-schema.js';

// ============================================================
// 验证结果辅助函数
// ============================================================

function createValidationResult(
  valid: boolean,
  errors: string[] = [],
  warnings: string[] = [],
): CapabilityValidationResult {
  return { valid, errors, warnings };
}

function mergeValidationResults(
  ...results: CapabilityValidationResult[]
): CapabilityValidationResult {
  const valid = results.every((r) => r.valid);
  const errors = results.flatMap((r) => r.errors);
  const warnings = results.flatMap((r) => r.warnings);
  return { valid, errors, warnings };
}

// ============================================================
// Schema 验证
// ============================================================

/**
 * 验证 IOSchema 定义的有效性
 */
export function validateIOSchema(schema: IOSchema, path = ''): CapabilityValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查 type 字段
  const validTypes = ['string', 'number', 'boolean', 'object', 'array', 'null'];
  if (!validTypes.includes(schema.type)) {
    errors.push(`Invalid type at ${path || 'root'}: ${schema.type}`);
  }

  // 检查 object 类型的 properties
  if (schema.type === 'object') {
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const propResult = validateIOSchema(propSchema, `${path}.${key}`.replace(/^\./, ''));
        errors.push(...propResult.errors);
        warnings.push(...propResult.warnings);
      }
    }

    // 检查 required 字段是否都在 properties 中
    if (schema.required && schema.properties) {
      for (const requiredField of schema.required) {
        if (!(requiredField in schema.properties)) {
          warnings.push(
            `Required field "${requiredField}" not defined in properties at ${path || 'root'}`,
          );
        }
      }
    }
  }

  // 检查数组类型的 items
  if (schema.type === 'array' && schema.items) {
    const itemsResult = validateIOSchema(schema.items, `${path}[]`.replace(/^\./, ''));
    errors.push(...itemsResult.errors);
    warnings.push(...itemsResult.warnings);
  }

  // 检查数值约束
  if (schema.type === 'number') {
    if (schema.minimum !== undefined && schema.maximum !== undefined) {
      if (schema.minimum > schema.maximum) {
        errors.push(
          `Minimum value ${schema.minimum} is greater than maximum ${schema.maximum} at ${path || 'root'}`,
        );
      }
    }
  }

  // 检查字符串约束
  if (schema.type === 'string') {
    if (schema.minLength !== undefined && schema.maxLength !== undefined) {
      if (schema.minLength > schema.maxLength) {
        errors.push(
          `MinLength ${schema.minLength} is greater than maxLength ${schema.maxLength} at ${path || 'root'}`,
        );
      }
    }

    // 检查 pattern 是否为有效正则
    if (schema.pattern) {
      try {
        new RegExp(schema.pattern);
      } catch (e) {
        errors.push(`Invalid regex pattern at ${path || 'root'}: ${schema.pattern}`);
      }
    }
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

// ============================================================
// 能力定义验证
// ============================================================

/**
 * 验证能力定义的完整性
 */
export function validateCapabilityDefinition(
  definition: CapabilityDefinition,
): CapabilityValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查必需字段
  if (!definition.id || typeof definition.id !== 'string') {
    errors.push('Capability id is required and must be a string');
  }

  if (!definition.type) {
    errors.push('Capability type is required');
  } else if (!isValidCapabilityType(definition.type)) {
    errors.push(`Invalid capability type: ${definition.type}`);
  }

  if (!definition.name || typeof definition.name !== 'string') {
    errors.push('Capability name is required and must be a string');
  }

  if (!definition.description || typeof definition.description !== 'string') {
    errors.push('Capability description is required and must be a string');
  }

  if (!definition.level) {
    errors.push('Capability level is required');
  } else if (!isValidCapabilityLevel(definition.level)) {
    errors.push(`Invalid capability level: ${definition.level}`);
  }

  // 验证 input schema
  if (definition.input) {
    const inputResult = validateIOSchema(definition.input, 'input');
    errors.push(...inputResult.errors);
    warnings.push(...inputResult.warnings);
  }

  // 验证 output schema
  if (definition.output) {
    const outputResult = validateIOSchema(definition.output, 'output');
    errors.push(...outputResult.errors);
    warnings.push(...outputResult.warnings);
  }

  // 验证依赖
  if (definition.dependencies) {
    for (let i = 0; i < definition.dependencies.length; i++) {
      const dep = definition.dependencies[i];
      const depPath = `dependencies[${i}]`;

      if (!dep.capability || typeof dep.capability !== 'string') {
        errors.push(`${depPath}: capability name is required`);
      }

      if (dep.minLevel && !isValidCapabilityLevel(dep.minLevel)) {
        errors.push(`${depPath}: invalid minLevel: ${dep.minLevel}`);
      }

      if (dep.capability === definition.id) {
        errors.push(`${depPath}: self-dependency detected for capability "${definition.id}"`);
      }
    }
  }

  // 验证性能指标
  if (definition.performance) {
    const { avgDurationMs, avgTokens, successRate } = definition.performance;

    if (avgDurationMs !== undefined && (typeof avgDurationMs !== 'number' || avgDurationMs < 0)) {
      errors.push('performance.avgDurationMs must be a non-negative number');
    }

    if (avgTokens !== undefined && (typeof avgTokens !== 'number' || avgTokens < 0)) {
      errors.push('performance.avgTokens must be a non-negative number');
    }

    if (successRate !== undefined && (typeof successRate !== 'number' || successRate < 0 || successRate > 1)) {
      errors.push('performance.successRate must be a number between 0 and 1');
    }
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

// ============================================================
// 循环依赖检测
// ============================================================

/**
 * 检测能力之间的循环依赖
 * @param capabilities 所有能力定义的映射
 * @returns 包含循环路径的错误信息
 */
export function detectCircularDependencies(
  capabilities: Map<string, CapabilityDefinition>,
): string[] {
  const errors: string[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(capabilityId: string, path: string[]): boolean {
    if (recursionStack.has(capabilityId)) {
      // 找到循环
      const cycleStart = path.indexOf(capabilityId);
      const cycle = path.slice(cycleStart).concat(capabilityId);
      errors.push(`Circular dependency detected: ${cycle.join(' -> ')}`);
      return true;
    }

    if (visited.has(capabilityId)) {
      return false;
    }

    visited.add(capabilityId);
    recursionStack.add(capabilityId);

    const capability = capabilities.get(capabilityId);
    if (capability?.dependencies) {
      for (const dep of capability.dependencies) {
        if (capabilities.has(dep.capability)) {
          if (dfs(dep.capability, [...path, capabilityId])) {
            return true;
          }
        }
      }
    }

    recursionStack.delete(capabilityId);
    return false;
  }

  for (const [id] of capabilities) {
    if (!visited.has(id)) {
      dfs(id, []);
    }
  }

  return errors;
}

// ============================================================
// 等级一致性验证
// ============================================================

/**
 * 验证能力等级一致性
 * 检查依赖的能力等级是否合理
 */
export function validateLevelConsistency(
  capabilities: Map<string, CapabilityDefinition>,
): CapabilityValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [id, capability] of capabilities) {
    if (capability.dependencies) {
      for (const dep of capability.dependencies) {
        const depCapability = capabilities.get(dep.capability);

        if (depCapability) {
          // 检查依赖等级要求
          if (dep.minLevel) {
            // 检查被依赖的能力是否声明了足够的等级
            if (!meetsCapabilityLevel(depCapability.level, dep.minLevel)) {
              warnings.push(
                `Capability "${id}" requires "${dep.capability}" at level ${dep.minLevel}, ` +
                  `but "${dep.capability}" is declared as ${depCapability.level}`,
              );
            }
          }

          // 检查等级倒挂：高级能力依赖低级能力（可能是设计问题）
          if (compareLevels(capability.level, depCapability.level) > 0 && dep.required) {
            warnings.push(
              `Higher-level capability "${id}" (${capability.level}) ` +
                `depends on lower-level capability "${dep.capability}" (${depCapability.level})`,
            );
          }
        }
      }
    }
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

// 辅助函数：比较能力等级
function compareLevels(level1: CapabilityLevel, level2: CapabilityLevel): number {
  const levels = { basic: 0, intermediate: 1, advanced: 2, expert: 3 };
  return levels[level1] - levels[level2];
}

// ============================================================
// Agent 能力集合验证
// ============================================================

/**
 * 验证 Agent 能力集合
 */
export function validateAgentCapabilities(
  agentCapabilities: AgentCapabilities,
): CapabilityValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查 Agent 名称
  if (!agentCapabilities.agentName) {
    errors.push('agentName is required');
  }

  // 检查默认等级
  if (agentCapabilities.defaultLevel && !isValidCapabilityLevel(agentCapabilities.defaultLevel)) {
    errors.push(`Invalid defaultLevel: ${agentCapabilities.defaultLevel}`);
  }

  // 验证每个能力定义
  const capabilityResults: CapabilityValidationResult[] = [];
  for (let i = 0; i < agentCapabilities.capabilities.length; i++) {
    const result = validateCapabilityDefinition(agentCapabilities.capabilities[i]);
    capabilityResults.push(result);
  }

  // 检查能力 ID 重复
  const ids = agentCapabilities.capabilities.map((c) => c.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    errors.push(`Duplicate capability IDs: [...${duplicateIds}]`);
  }

  // 构建能力映射用于循环依赖检测
  const capabilityMap = new Map<string, CapabilityDefinition>();
  for (const cap of agentCapabilities.capabilities) {
    capabilityMap.set(cap.id, cap);
  }

  // 检测循环依赖
  const circularDeps = detectCircularDependencies(capabilityMap);
  errors.push(...circularDeps);

  // 验证等级一致性
  const levelResult = validateLevelConsistency(capabilityMap);
  warnings.push(...levelResult.warnings);

  // 合并所有验证结果
  const allResults = [createValidationResult(errors.length === 0 && circularDeps.length === 0, errors, warnings), ...capabilityResults];
  return mergeValidationResults(...allResults);
}

// ============================================================
// 导出
// ============================================================

export {
  createValidationResult,
  mergeValidationResults,
};
