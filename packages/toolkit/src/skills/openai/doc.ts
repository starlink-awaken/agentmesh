/**
 * 文档处理技能
 *
 * 用于文档生成、Markdown 处理、API 文档等
 */
import type { OpenAISkillDefinition } from './types.js';
import type { ReferenceRoute } from '../types.js';

const docReferences: ReferenceRoute[] = [
  { topic: 'Markdown Guide', file: 'markdown-guide.md', loadWhen: 'Writing Markdown' },
  { topic: 'API Documentation', file: 'api-docs.md', loadWhen: 'Creating API docs' },
  { topic: 'TypeDoc Setup', file: 'typedoc.md', loadWhen: 'Setting up TypeDoc' },
];

export const docSkill: OpenAISkillDefinition = {
  id: 'doc',
  name: 'Documentation',
  description: 'Use for documentation generation, Markdown processing, and API docs',
  longDescription: `## Documentation Processing

This skill enables comprehensive documentation work:

### Capabilities
- **Markdown**: Create and format Markdown documentation
- **API Docs**: Generate and maintain API documentation
- **Code Comments**: Add meaningful documentation to code
- **README**: Write comprehensive README files
- **CHANGELOG**: Maintain changelog entries
- **TypeDoc/JSDoc**: Generate documentation from code
- **OpenAPI**: Work with OpenAPI/Swagger specs

### Documentation Best Practices
1. Start with a clear README (overview, installation, usage)
2. Document public APIs with examples
3. Keep documentation close to the code (inline docs)
4. Use consistent formatting and style
5. Include code examples where helpful
6. Maintain a CHANGELOG for version tracking

### Common Triggers
- "Write documentation for this code"
- "Generate API docs"
- "Create a README"
- "Document this function"
- "How to write good documentation"
- "Set up TypeDoc"`,
  triggers: [
    'doc', 'documentation', 'readme', 'markdown', 'md',
    'api', 'apidoc', 'swagger', 'openapi', 'typedoc', 'jsdoc',
    'comment', 'changelog', 'guide', 'tutorial', 'manual',
    '文档', '说明', '注释',
  ],
  role: 'specialist',
  scope: 'implementation',
  outputFormat: 'text',
  category: 'documentation',
  dependencies: [],
  references: docReferences,
  mcpServers: [],
  externalScripts: [],
  yamlConfig: {
    display_name: 'Documentation',
    short_description: 'Use for documentation generation, Markdown processing, and API docs',
    default_prompt: 'You are a documentation expert. Create clear, comprehensive documentation with examples.',
  },
};

export default docSkill;
