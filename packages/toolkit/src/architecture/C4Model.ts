/**
 * C4Model - C4 架构图建模工具
 *
 * C4 模型：Context（系统上下文）、Container（容器）、Component（组件）、Code（代码）
 *
 * @author PAI
 * @version 1.0.0
 */

/**
 * C4 元素类型
 */
export type C4ElementType = 'context' | 'container' | 'component' | 'code';

/**
 * C4 元素
 */
export interface C4Element {
  id: string;
  type: C4ElementType;
  name: string;
  description: string;
  technology?: string;
  children?: C4Element[];
}

/**
 * C4 关系
 */
export interface C4Relation {
  sourceId: string;
  targetId: string;
  description: string;
  technology?: string;
}

/**
 * C4Model 类
 *
 * 提供 C4 架构图的建模能力
 */
export class C4Model {
  private elements: Map<string, C4Element> = new Map();
  private relations: C4Relation[] = [];
  private title: string = 'System Architecture';
  private description: string = '';

  /**
   * 设置标题
   */
  setTitle(title: string): this {
    this.title = title;
    return this;
  }

  /**
   * 设置描述
   */
  setDescription(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * 添加系统上下文元素（最高层）
   */
  addContext(name: string, description: string, technology?: string): this {
    const element: C4Element = {
      id: `context-${name.toLowerCase().replace(/\s+/g, '-')}`,
      type: 'context',
      name,
      description,
      technology,
    };
    this.elements.set(element.id, element);
    return this;
  }

  /**
   * 添加容器元素（应用/服务）
   */
  addContainer(name: string, description: string, technology?: string): this {
    const element: C4Element = {
      id: `container-${name.toLowerCase().replace(/\s+/g, '-')}`,
      type: 'container',
      name,
      description,
      technology,
    };
    this.elements.set(element.id, element);
    return this;
  }

  /**
   * 添加组件元素
   */
  addComponent(name: string, description: string, technology?: string, containerId?: string): this {
    const element: C4Element = {
      id: `component-${name.toLowerCase().replace(/\s+/g, '-')}`,
      type: 'component',
      name,
      description,
      technology,
      children: [],
    };

    if (containerId) {
      const container = this.elements.get(containerId);
      if (container && container.children) {
        container.children.push(element);
      }
    }

    this.elements.set(element.id, element);
    return this;
  }

  /**
   * 添加关系
   */
  addRelation(
    sourceName: string,
    targetName: string,
    description: string,
    technology?: string
  ): this {
    const sourceId = this.findElementId(sourceName);
    const targetId = this.findElementId(targetName);

    if (!sourceId || !targetId) {
      throw new Error(`未找到元素: ${!sourceId ? sourceName : targetName}`);
    }

    this.relations.push({
      sourceId,
      targetId,
      description,
      technology,
    });

    return this;
  }

  /**
   * 查找元素 ID
   */
  private findElementId(name: string): string | undefined {
    const normalizedName = name.toLowerCase().replace(/\s+/g, '-');

    for (const [id, element] of this.elements) {
      const elementName = element.name.toLowerCase().replace(/\s+/g, '-');
      if (elementName === normalizedName || id.endsWith(normalizedName)) {
        return id;
      }
    }

    return undefined;
  }

  /**
   * 导出为 Mermaid 格式
   */
  toMermaid(): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# ${this.title}`);
    if (this.description) {
      lines.push('');
      lines.push(this.description);
      lines.push('');
    }

    // 根据最高层元素类型选择 C4 语法
    const hasComponents = Array.from(this.elements.values()).some(e => e.type === 'component');
    const hasContainers = Array.from(this.elements.values()).some(e => e.type === 'container');

    if (hasComponents) {
      lines.push(this.generateComponentDiagram());
    } else if (hasContainers) {
      lines.push(this.generateContainerDiagram());
    } else {
      lines.push(this.generateSystemContextDiagram());
    }

    return lines.join('\n');
  }

  /**
   * 生成系统上下文图
   */
  private generateSystemContextDiagram(): string {
    const lines: string[] = ['```mermaid', 'C4Context'];

    // 添加系统
    for (const element of this.elements.values()) {
      if (element.type === 'context') {
        lines.push(`  Person_${this.sanitize(element.name)}(${element.name}, ${element.description})`);
      }
    }

    // 添加关系
    for (const rel of this.relations) {
      const source = this.elements.get(rel.sourceId);
      const target = this.elements.get(rel.targetId);
      if (source && target) {
        lines.push(`  Rel(${this.sanitize(source.name)}, ${this.sanitize(target.name)}, ${rel.description})`);
      }
    }

    lines.push('```');
    return lines.join('\n');
  }

  /**
   * 生成容器图
   */
  private generateContainerDiagram(): string {
    const lines: string[] = ['```mermaid', 'C4Container'];

    // 添加人物
    for (const element of this.elements.values()) {
      if (element.type === 'context') {
        lines.push(`  Person(${this.sanitize(element.name)}, ${element.name}, ${element.description})`);
      }
    }

    // 添加容器
    for (const element of this.elements.values()) {
      if (element.type === 'container') {
        const tech = element.technology ? `, "${element.technology}"` : '';
        lines.push(`  Container(${this.sanitize(element.name)}, ${element.name}, ${element.description}${tech})`);
      }
    }

    // 添加关系
    for (const rel of this.relations) {
      const source = this.elements.get(rel.sourceId);
      const target = this.elements.get(rel.targetId);
      if (source && target) {
        lines.push(`  Rel(${this.sanitize(source.name)}, ${this.sanitize(target.name)}, ${rel.description})`);
      }
    }

    lines.push('```');
    return lines.join('\n');
  }

  /**
   * 生成组件图
   */
  private generateComponentDiagram(): string {
    const lines: string[] = ['```mermaid', 'C4Component'];

    // 找到父容器
    const containers = Array.from(this.elements.values()).filter(e => e.type === 'container');

    // 添加容器和组件
    for (const container of containers) {
      lines.push(`  ContainerDb(${this.sanitize(container.name)}, ${container.name}, ${container.description})`);

      if (container.children) {
        for (const component of container.children) {
          const tech = component.technology ? `, "${component.technology}"` : '';
          lines.push(`    Component(${this.sanitize(component.name)}, ${component.name}, ${component.description}${tech})`);
        }
      }
    }

    // 添加关系
    for (const rel of this.relations) {
      const source = this.elements.get(rel.sourceId);
      const target = this.elements.get(rel.targetId);
      if (source && target) {
        lines.push(`  Rel(${this.sanitize(source.name)}, ${this.sanitize(target.name)}, ${rel.description})`);
      }
    }

    lines.push('```');
    return lines.join('\n');
  }

  /**
   * 导出为 PlantUML 格式
   */
  toPlantUML(): string {
    const lines: string[] = ['@startuml', '!pragma layout metamodel C4'];

    // 添加元素
    for (const element of this.elements.values()) {
      if (element.type === 'context') {
        lines.push(`Person(${this.sanitize(element.name)}, "${element.name}", "${element.description}")`);
      } else if (element.type === 'container') {
        lines.push(`Container(${this.sanitize(element.name)}, "${element.name}", "${element.description}"${element.technology ? `, "${element.technology}"` : ''})`);
      } else if (element.type === 'component') {
        lines.push(`Component(${this.sanitize(element.name)}, "${element.name}", "${element.description}"${element.technology ? `, "${element.technology}"` : ''})`);
      }
    }

    // 添加关系
    for (const rel of this.relations) {
      const source = this.elements.get(rel.sourceId);
      const target = this.elements.get(rel.targetId);
      if (source && target) {
        lines.push(`Rel(${this.sanitize(source.name)}, ${this.sanitize(target.name)}, "${rel.description}"${rel.technology ? `, "${rel.technology}"` : ''})`);
      }
    }

    lines.push('@enduml');
    return lines.join('\n');
  }

  /**
   * 导出为 JSON
   */
  toJSON(): any {
    return {
      title: this.title,
      description: this.description,
      elements: Array.from(this.elements.values()),
      relations: this.relations,
    };
  }

  /**
   * 获取元素列表
   */
  getElements(): C4Element[] {
    return Array.from(this.elements.values());
  }

  /**
   * 获取关系列表
   */
  getRelations(): C4Relation[] {
    return [...this.relations];
  }

  /**
   * 清理名称用于 ID
   */
  private sanitize(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '');
  }
}

export default C4Model;
