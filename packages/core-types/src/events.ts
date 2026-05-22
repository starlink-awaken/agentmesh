/** 系统事件类型 */
export type CoreEventType =
  | 'task.submitted'
  | 'task.assigned'
  | 'task.started'
  | 'task.progress'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  | 'agent.registered'
  | 'agent.unregistered'
  | 'agent.status_changed'
  | 'model.discovered'
  | 'model.health_changed'
  | 'model.route_selected'
  | 'system.health'
  | 'system.error';

/** 系统事件 */
export interface CoreEvent {
  type: CoreEventType;
  timestamp: number;
  source: string;
  data: Record<string, unknown>;
}
