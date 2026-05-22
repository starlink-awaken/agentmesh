/**
 * Playwright 测试技能
 *
 * 用于编写和运行 Playwright E2E 测试
 */
import type { OpenAISkillDefinition } from './types.js';
import type { ReferenceRoute } from '../types.js';

const playwrightReferences: ReferenceRoute[] = [
  { topic: 'Playwright Basics', file: 'playwright-basics.md', loadWhen: 'Getting started with Playwright' },
  { topic: 'Selectors', file: 'selectors.md', loadWhen: 'Element selection' },
  { topic: 'Page Object Model', file: 'page-object.md', loadWhen: 'Test organization' },
];

export const playwrightSkill: OpenAISkillDefinition = {
  id: 'playwright',
  name: 'Playwright',
  description: 'Use for writing, running, and maintaining Playwright E2E tests',
  longDescription: `## Playwright Testing

This skill enables comprehensive Playwright test automation:

### Capabilities
- **Test Writing**: Create E2E tests with Playwright
- **Selectors**: Use best practices for element selection
- **Assertions**: Implement proper assertions and soft assertions
- **Page Objects**: Guide on Page Object Model pattern
- **Test Organization**: Structure tests for maintainability
- **Debugging**: Help debug failing tests

### Best Practices
1. Use **role-based selectors** (getByRole) over CSS selectors
2. Implement proper waiting strategies (auto-waiting)
3. Use test fixtures for shared setup
4. Leverage beforeEach/afterEach appropriately
5. Run tests in parallel with fully isolated contexts
6. Take screenshots/videos on failure for debugging

### Example Triggers
- "Write a Playwright test for login"
- "How to select elements in Playwright"
- "Debug Playwright test failure"
- "Set up Playwright in this project"
- "Create E2E tests for the checkout flow"`,
  triggers: [
    'playwright', 'test', 'e2e', 'end-to-end', 'automation',
    'browser', 'chromium', 'firefox', 'webkit', 'selector',
    'assertion', 'page object', 'fixture', 'debug',
    '测试', '自动化', '浏览器',
  ],
  role: 'specialist',
  scope: 'implementation',
  outputFormat: 'code',
  category: 'testing',
  dependencies: [],
  references: playwrightReferences,
  mcpServers: [],
  externalScripts: [],
  yamlConfig: {
    display_name: 'Playwright',
    short_description: 'Use for writing, running, and maintaining Playwright E2E tests',
    default_prompt: 'You are a Playwright expert. Write comprehensive E2E tests following best practices.',
  },
};

export default playwrightSkill;
