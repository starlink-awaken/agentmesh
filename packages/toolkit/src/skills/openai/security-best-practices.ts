/**
 * 安全最佳实践技能
 *
 * 用于代码安全审查、漏洞检测、安全加固等
 */
import type { OpenAISkillDefinition } from './types.js';
import type { ReferenceRoute } from '../types.js';

const securityReferences: ReferenceRoute[] = [
  { topic: 'OWASP Top 10', file: 'owasp-top-10.md', loadWhen: 'General security review' },
  { topic: 'Authentication', file: 'authentication.md', loadWhen: 'Auth-related code' },
  { topic: 'Authorization', file: 'authorization.md', loadWhen: 'Permission checks' },
];

export const securityBestPracticesSkill: OpenAISkillDefinition = {
  id: 'security-best-practices',
  name: 'Security Best Practices',
  description: 'Use for security review, vulnerability detection, and secure coding guidance',
  longDescription: `## Security Best Practices

This skill provides comprehensive security guidance:

### Capabilities
- **Vulnerability Detection**: Identify OWASP Top 10 and common vulnerabilities
- **Security Review**: Perform thorough security code reviews
- **Secure Coding**: Guide on implementing secure authentication and authorization
- **Encryption**: Help with data encryption and key management
- **Compliance**: Ensure adherence to security standards (SOC2, GDPR, etc.)

### Security Checkpoints
1. Input validation and sanitization
2. Authentication and session management
3. Authorization and access control
4. Data protection (encryption at rest/transit)
5. Secure API design
6. Error handling and logging
7. Dependency vulnerability scanning

### Common Triggers
- "Review this code for security issues"
- "How to implement secure authentication"
- "Check for SQL injection vulnerabilities"
- "What are the security best practices for [topic]"
- "Perform a security audit"`,
  triggers: [
    'security', 'secure', 'vulnerability', 'owasp', 'audit',
    'authentication', 'authorization', 'encryption', 'privacy',
    'compliance', 'soc2', 'gdpr', 'pentest', 'exploit',
    '安全', '漏洞', '审计', '加密', '认证',
  ],
  role: 'reviewer',
  scope: 'review',
  outputFormat: 'text',
  category: 'security',
  dependencies: [],
  references: securityReferences,
  mcpServers: [],
  externalScripts: [],
  yamlConfig: {
    display_name: 'Security Best Practices',
    short_description: 'Use for security review, vulnerability detection, and secure coding guidance',
    default_prompt: 'You are a security expert. Analyze the provided code for security vulnerabilities and suggest improvements.',
  },
};

export default securityBestPracticesSkill;
