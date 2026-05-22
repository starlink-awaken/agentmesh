/**
 * Figma 设计集成技能
 *
 * 用于与 Figma 进行深度集成，支持设计稿分析、组件提取、样式提取等
 */
import type { OpenAISkillDefinition } from './types.js';
import type { ReferenceRoute } from '../types.js';

const figmaReferences: ReferenceRoute[] = [
  { topic: 'Figma API', file: 'figma-api.md', loadWhen: 'Using Figma API' },
  { topic: 'Component Extraction', file: 'component-extraction.md', loadWhen: 'Extracting components' },
  { topic: 'Design to Code', file: 'design-to-code.md', loadWhen: 'Converting designs to code' },
];

export const figmaSkill: OpenAISkillDefinition = {
  id: 'figma',
  name: 'Figma',
  description: 'Use for Figma design integration, component extraction, and design-to-code workflows',
  longDescription: `## Figma Design Integration

This skill enables deep Figma integration for AI agents:

### Capabilities
- **Design Analysis**: Analyze Figma files, frames, and components
- **Component Extraction**: Extract components, variants, and properties
- **Style Extraction**: Pull colors, typography, spacing tokens
- **Design-to-Code**: Convert designs to implementation-ready code
- **Prototype Navigation**: Navigate through Figma prototypes

### Usage
When user mentions Figma, design files, or design-to-code tasks, activate this skill.

### MCP Servers
- figma: Figma API integration

### Example Triggers
- "Extract styles from this Figma file"
- "Convert this design to React components"
- "Analyze the Figma design system"
- "Get component variants from Figma"`,
  triggers: [
    'figma', 'design', 'ui', 'ux', 'component', 'style',
    'extract', 'convert', 'prototype', 'frame', 'variant',
    '设计', 'UI', '组件', '样式',
  ],
  role: 'specialist',
  scope: 'implementation',
  outputFormat: 'code',
  category: 'design',
  dependencies: [],
  references: figmaReferences,
  mcpServers: ['figma'],
  externalScripts: [],
  yamlConfig: {
    display_name: 'Figma',
    short_description: 'Use for Figma design integration, component extraction, and design-to-code workflows',
    default_prompt: 'You are a Figma expert. Analyze the provided Figma file and extract relevant design information.',
  },
};

export default figmaSkill;
