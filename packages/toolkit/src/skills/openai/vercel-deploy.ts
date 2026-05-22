/**
 * Vercel 部署技能
 *
 * 用于 Vercel 项目配置、部署和预览管理
 */
import type { OpenAISkillDefinition } from './types.js';
import type { ReferenceRoute } from '../types.js';

const vercelReferences: ReferenceRoute[] = [
  { topic: 'Vercel Basics', file: 'vercel-basics.md', loadWhen: 'Getting started with Vercel' },
  { topic: 'Environment Variables', file: 'env-vars.md', loadWhen: 'Configuring environment variables' },
  { topic: 'Edge Functions', file: 'edge-functions.md', loadWhen: 'Deploying Edge Functions' },
];

export const vercelDeploySkill: OpenAISkillDefinition = {
  id: 'vercel-deploy',
  name: 'Vercel Deploy',
  description: 'Use for Vercel deployment configuration, preview URLs, and production deployments',
  longDescription: `## Vercel Deployment

This skill provides comprehensive Vercel deployment guidance:

### Capabilities
- **Project Setup**: Initialize and configure Vercel projects
- **Deployment**: Trigger and manage deployments
- **Preview URLs**: Work with preview deployments for PRs
- **Environment Variables**: Configure env vars securely
- **Edge Functions**: Deploy Vercel Edge Functions
- **Serverless Functions**: Configure API routes
- **Performance**: Optimize for Vercel (Images, Analytics, Speed)

### Configuration Files
- **vercel.json**: Project configuration
- **next.config.js**: Next.js specific settings
- **package.json**: Scripts for deployment

### Common Triggers
- "Deploy to Vercel"
- "Configure environment variables"
- "Set up preview deployments"
- "Fix Vercel build error"
- "Deploy Next.js app"
- "Configure Vercel Analytics"`,
  triggers: [
    'vercel', 'deploy', 'preview', 'production', 'edge',
    'serverless', 'nextjs', 'function', 'environment', 'env',
    'domain', 'ssl', 'analytics', '部署', '预览',
  ],
  role: 'specialist',
  scope: 'implementation',
  outputFormat: 'code',
  category: 'deployment',
  dependencies: [],
  references: vercelReferences,
  mcpServers: [],
  externalScripts: [],
  yamlConfig: {
    display_name: 'Vercel Deploy',
    short_description: 'Use for Vercel deployment configuration, preview URLs, and production deployments',
    default_prompt: 'You are a Vercel expert. Help configure and deploy applications on Vercel.',
  },
};

export default vercelDeploySkill;
