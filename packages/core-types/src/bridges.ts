/**
 * Bridge Interface Contracts
 *
 * Formal type contracts for cross-package dependencies in AgentMesh.
 * Each interface defines what one package expects from another,
 * making cross-package compatibility compile-time verifiable.
 */

/** What the gateway expects from @agentmesh/model-orchestrator */
export interface ModelOrchestratorBridge {
  chat(modelId: string, messages: unknown[], options?: unknown): Promise<{ content: string } | null>;
  getModels(): Promise<Array<{ id: string; provider: string; location: string }>>;
  healthCheck(): Promise<Record<string, boolean>>;
}

/** What the gateway expects from @agentmesh/toolkit */
export interface ToolkitBridge {
  getSkills(category?: string): unknown[];
  searchSkills(task: string): unknown[];
  executeSkill(skillId: string, input: unknown): Promise<unknown>;
}

/** What the MCP server expects from each package */
export interface MCPDependencyBridge {
  modelOrchestrator?: ModelOrchestratorBridge;
  toolkit?: ToolkitBridge;
  taskManager?: unknown;
}
