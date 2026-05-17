import { CronExpressionParser } from 'cron-parser';
import { taskManager } from './task-manager.js';
import { logger } from './logger.js';
import { v4 as uuidv4 } from 'uuid';
import type { AgentMessage } from '../types/index.js';

interface ScheduledTask {
  id: string;
  name: string;
  cron: string;
  message: AgentMessage;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number | null;
}

export class Scheduler {
  private jobs = new Map<string, ScheduledTask>();
  private timer: ReturnType<typeof setInterval> | null = null;

  /** 添加定时任务 */
  add(name: string, cronExpr: string, message: AgentMessage): string {
    const id = uuidv4();
    const nextRun = this._nextRun(cronExpr);
    if (nextRun === null) throw new Error(`Invalid cron expression: ${cronExpr}`);
    this.jobs.set(id, {
      id, name, cron: cronExpr,
      message: { ...message, id: uuidv4(), type: 'request' as const, source: 'scheduler', target: 'gateway', correlation_id: uuidv4(), timestamp: Date.now() },
      enabled: true,
      nextRun,
    });
    return id;
  }

  /** 移除定时任务 */
  remove(id: string): boolean {
    return this.jobs.delete(id);
  }

  /** 列出所有定时任务 */
  list(): ScheduledTask[] {
    return Array.from(this.jobs.values());
  }

  /** 启动调度器 */
  start(intervalMs = 30000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this._tick(), intervalMs);
    logger.info('[Scheduler] Started');
  }

  /** 停止调度器 */
  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    logger.info('[Scheduler] Stopped');
  }

  private _tick(): void {
    const now = Date.now();
    for (const job of this.jobs.values()) {
      if (!job.enabled || !job.nextRun || job.nextRun > now) continue;

      logger.info(`[Scheduler] Running: ${job.name}`);
      taskManager.processTask(job.message).catch(err => {
        logger.error(`[Scheduler] ${job.name} failed:`, { error: String(err) });
      });
      job.lastRun = now;
      job.nextRun = this._nextRun(job.cron, now);
    }
  }

  private _nextRun(cronExpr: string, from = Date.now()): number | null {
    try {
      const expr = CronExpressionParser.parse(cronExpr, { currentDate: new Date(from) });
      return expr.next().toDate().getTime();
    } catch {
      return null;
    }
  }
}

export const scheduler = new Scheduler();
