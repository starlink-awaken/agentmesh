# 贡献指南

感谢你对 @starlink-awaken/agentmesh 项目的兴趣！我们欢迎任何形式的贡献，包括但不限于代码提交、文档改进、问题报告和功能请求。

## 行为准则

请阅读并遵守我们的 [行为准则](./CODE_OF_CONDUCT.md)，保持社区友好和包容。

## 如何贡献

### 报告问题

如果你发现了 bug 或有功能建议：

1. 搜索 [Issues](https://github.com/starlink-awaken/agentmesh/issues) 确保问题未被报告
2. 创建新 Issue，清晰描述问题和复现步骤
3. 使用 Bug 报告模板或功能请求模板

### 提交代码

1. **Fork** 项目仓库
2. 创建特性分支：`git checkout -b feature/your-feature-name`
3. 进行开发并确保代码符合项目规范
4. 编写测试覆盖新代码（如果适用）
5. 提交你的更改：`git commit -m 'Add some feature'`
6. 推送分支：`git push origin feature/your-feature-name`
7. 创建 **Pull Request**

### 开发环境设置

```bash
# 克隆仓库
git clone https://github.com/starlink-awaken/agentmesh.git
cd agentmesh

# 安装依赖
bun install

# 运行测试
bun test

# 启动开发服务器
bun run dev
```

## 代码规范

- 使用 TypeScript 进行开发
- 遵循项目现有的代码风格
- 确保代码通过 ESLint 检查
- 编写有意义的提交信息

### 提交信息规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

类型 (type)：
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 代码重构
- `test`: 测试相关
- `chore`: 构建过程或辅助工具变动

示例：
```
feat(agent): 添加新的 Ollama 适配器

fix(router): 修复路由匹配问题

docs(api): 更新 API 文档
```

## Pull Request 流程

1. 确保所有测试通过
2. 更新相关文档
3. PR 描述清楚更改内容和目的
4. 等待代码审查
5. 根据反馈进行修改
6. 合并后删除分支

## 财务贡献

我们接受以下方式的支持：

- GitHub Sponsors
- Open Collective

## 联系方式

- 问题反馈：https://github.com/starlink-awaken/agentmesh/issues
- 讨论交流：https://github.com/starlink-awaken/agentmesh/discussions

感谢你的贡献！
