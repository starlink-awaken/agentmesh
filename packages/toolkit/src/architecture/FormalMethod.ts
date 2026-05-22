/**
 * FormalMethod - 形式化方法建模工具
 *
 * 支持 TLA+ 和 Alloy 建模与验证
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * 形式化方法类型
 */
export type FormalMethodType = 'tla+' | 'alloy';

/**
 * 状态定义
 */
export interface State {
  name: string;
  invariant?: string;
  action?: string;
}

/**
 * 转换定义
 */
export interface Transition {
  from: string;
  to: string;
  action: string;
  preconditions: string[];
  postconditions: string[];
}

/**
 * 不变量
 */
export interface Invariant {
  name: string;
  expression: string;
  description?: string;
}

/**
 * 性质/属性
 */
export interface Property {
  name: string;
  type: 'safety' | 'liveness';
  expression: string;
  description?: string;
}

/**
 * FormalMethod 类
 */
export class FormalMethod {
  private type: FormalMethodType;
  private states: Map<string, State> = new Map();
  private transitions: Transition[] = [];
  private invariants: Invariant[] = [];
  private properties: Property[] = [];
  private variables: Map<string, string> = new Map();
  private constants: Map<string, string> = new Map();
  private moduleName: string = 'FormalModel';

  constructor(type: FormalMethodType = 'tla+') {
    this.type = type;
  }

  setModuleName(name: string): this {
    this.moduleName = name;
    return this;
  }

  addVariable(name: string, type: string): this {
    this.variables.set(name, type);
    return this;
  }

  addConstant(name: string, value: string): this {
    this.constants.set(name, value);
    return this;
  }

  addState(name: string, invariant?: string, action?: string): this {
    this.states.set(name, { name, invariant, action });
    return this;
  }

  addTransition(
    from: string,
    to: string,
    action: string,
    preconditions: string[] = [],
    postconditions: string[] = []
  ): this {
    if (!this.states.has(from)) this.addState(from);
    if (!this.states.has(to)) this.addState(to);

    this.transitions.push({ from, to, action, preconditions, postconditions });
    return this;
  }

  addInvariant(name: string, expression: string, description?: string): this {
    this.invariants.push({ name, expression, description });
    return this;
  }

  addProperty(
    name: string,
    type: 'safety' | 'liveness',
    expression: string,
    description?: string
  ): this {
    this.properties.push({ name, type, expression, description });
    return this;
  }

  toTLAPlus(): string {
    const lines: string[] = [];
    const andOp = '/\\';

    lines.push(`---- MODULE ${this.moduleName} ----`);
    lines.push('');
    lines.push('EXTENDS Naturals, Sequences');
    lines.push('');

    if (this.constants.size > 0) {
      lines.push('CONSTANTS');
      for (const [name, value] of this.constants) {
        lines.push(`  ${name} = ${value}`);
      }
      lines.push('');
    }

    if (this.variables.size > 0) {
      lines.push('VARIABLES');
      const varNames = Array.from(this.variables.keys());
      lines.push('  ' + varNames.join(', '));
      lines.push('');
    }

    if (this.states.size > 0) {
      lines.push('(* State definitions *)');
      lines.push('State == {' + Array.from(this.states.keys()).join(', ') + '}');
      lines.push('');
    }

    lines.push('(* Initial state *)');
    lines.push('Init == ');
    const initVars = Array.from(this.variables.keys());
    if (initVars.length > 0) {
      lines.push(`  ${andOp} ${initVars.map(v => `${v} = 0`).join(` ${andOp} `)}`);
    } else {
      lines.push('  TRUE');
    }
    lines.push('');

    if (this.transitions.length > 0) {
      lines.push('(* Actions *)');
      for (const trans of this.transitions) {
        const actionName = trans.action.replace(/\s+/g, '');
        lines.push(`${actionName} ==`);
        lines.push(`  ${andOp} ${initVars[0] || 'TRUE'} = "${trans.from}"`);
        lines.push(`  ${andOp} ${initVars[0] || 'TRUE'}\' = "${trans.to}"`);
        lines.push('');
      }
    }

    if (this.invariants.length > 0) {
      lines.push('(* Invariants *)');
      for (const inv of this.invariants) {
        lines.push(`(* @${inv.name}: ${inv.expression} *)`);
      }
      lines.push('');
    }

    if (this.properties.length > 0) {
      lines.push('(* Properties *)');
      for (const prop of this.properties) {
        lines.push(`THEOREM ${prop.name} == ${prop.expression}`);
        lines.push(`(* ${prop.type}: ${prop.description || ''} *)`);
      }
      lines.push('');
    }

    lines.push('====');
    return lines.join('\n');
  }

  toAlloy(): string {
    const lines: string[] = [];

    lines.push(`module ${this.moduleName}`);
    lines.push('');

    if (this.states.size > 0) {
      lines.push('// State signatures');
      lines.push('sig State {');
      for (const [name, state] of this.states) {
        if (state.invariant) {
          lines.push(`  ${name}: one State,`);
        }
      }
      lines.push('}');
      lines.push('');
    }

    if (this.variables.size > 0) {
      lines.push('// Variables');
      for (const [name, type] of this.variables) {
        lines.push(`var${name.charAt(0).toUpperCase() + name.slice(1)}: ${type}`);
      }
      lines.push('');
    }

    if (this.invariants.length > 0 || this.transitions.length > 0) {
      lines.push('// Facts (constraints)');
      lines.push('fact {');
      for (const inv of this.invariants) {
        lines.push(`  // ${inv.name}: ${inv.description || ''}`);
        lines.push(`  ${inv.expression}`);
      }
      lines.push('}');
      lines.push('');
    }

    if (this.properties.length > 0) {
      lines.push('// Assertions');
      for (const prop of this.properties) {
        lines.push(`assert ${prop.name} {`);
        lines.push(`  ${prop.expression}`);
        lines.push('}');
        lines.push('');
      }
      lines.push(`check ${this.properties[0]?.name || 'all'} for 5`);
    }

    lines.push('');
    lines.push('// Run example');
    lines.push('run {} for 5');

    return lines.join('\n');
  }

  generate(): string {
    return this.type === 'tla+' ? this.toTLAPlus() : this.toAlloy();
  }

  getModel() {
    return {
      type: this.type,
      moduleName: this.moduleName,
      states: Array.from(this.states.values()),
      transitions: [...this.transitions],
      invariants: [...this.invariants],
      properties: [...this.properties],
    };
  }

  async verify(): Promise<{ success: boolean; errors?: string[]; warnings?: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (this.states.size === 0) warnings.push('No states defined');
    if (this.transitions.length === 0) warnings.push('No transitions defined');

    for (const trans of this.transitions) {
      if (!this.states.has(trans.from)) {
        errors.push(`Transition "${trans.action}" references non-existent state: ${trans.from}`);
      }
      if (!this.states.has(trans.to)) {
        errors.push(`Transition "${trans.action}" references non-existent state: ${trans.to}`);
      }
    }

    return { success: errors.length === 0, errors, warnings };
  }

  toJSON() {
    return {
      type: this.type,
      moduleName: this.moduleName,
      variables: Object.fromEntries(this.variables),
      constants: Object.fromEntries(this.constants),
      states: Array.from(this.states.values()),
      transitions: this.transitions,
      invariants: this.invariants,
      properties: this.properties,
    };
  }

  static fromJSON(json: any): FormalMethod {
    const method = new FormalMethod(json.type || 'tla+');
    method.moduleName = json.moduleName || 'FormalModel';

    if (json.constants) {
      for (const [name, value] of Object.entries(json.constants)) {
        method.addConstant(name, value as string);
      }
    }

    if (json.variables) {
      for (const [name, type] of Object.entries(json.variables)) {
        method.addVariable(name, type as string);
      }
    }

    if (json.states) {
      for (const state of json.states) {
        method.addState(state.name, state.invariant, state.action);
      }
    }

    if (json.transitions) {
      for (const trans of json.transitions) {
        method.addTransition(trans.from, trans.to, trans.action, trans.preconditions, trans.postconditions);
      }
    }

    if (json.invariants) {
      for (const inv of json.invariants) {
        method.addInvariant(inv.name, inv.expression, inv.description);
      }
    }

    if (json.properties) {
      for (const prop of json.properties) {
        method.addProperty(prop.name, prop.type, prop.expression, prop.description);
      }
    }

    return method;
  }
}

export default FormalMethod;
