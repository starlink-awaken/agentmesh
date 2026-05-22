/**
 * 实体状态
 */
export interface EntityState {
  current: string;
  previous: string | null;
  timestamp: number;
}
