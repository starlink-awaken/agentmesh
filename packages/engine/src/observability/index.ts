export type TraceStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

export interface TraceRecord {
  pipelineId: string;
  stepIndex: number;
  tool: string;
  action: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: TraceStatus;
  inputSummary: string;
  outputSummary: string;
}

export const OBSERVABILITY_VERSION = '1.0';

export enum PipelineEventType {
  PIPELINE_START = 'PIPELINE_START',
  PIPELINE_STEP = 'PIPELINE_STEP',
  PIPELINE_COMPLETE = 'PIPELINE_COMPLETE',
  PIPELINE_ERROR = 'PIPELINE_ERROR',
}

export class PipelineTracer {
  private traces = new Map<string, TraceRecord[]>();

  record(event: Omit<TraceRecord, 'startedAt'> & { startedAt?: string }): TraceRecord {
    const record: TraceRecord = {
      ...event,
      startedAt: event.startedAt || new Date().toISOString(),
    };
    const key = event.pipelineId;
    const existing = this.traces.get(key) || [];
    existing.push(record);
    this.traces.set(key, existing);
    return record;
  }

  startStep(pipelineId: string, stepIndex: number, tool: string, action: string, inputSummary: string = ''): TraceRecord {
    return this.record({
      pipelineId,
      stepIndex,
      tool,
      action,
      startedAt: new Date().toISOString(),
      endedAt: null,
      durationMs: null,
      status: 'RUNNING',
      inputSummary,
      outputSummary: '',
    });
  }

  completeStep(pipelineId: string, stepIndex: number, outputSummary: string = ''): TraceRecord | null {
    const steps = this.traces.get(pipelineId);
    if (!steps) return null;
    const step = steps.find(s => s.stepIndex === stepIndex && s.status === 'RUNNING');
    if (!step) return null;
    const now = new Date().toISOString();
    step.endedAt = now;
    step.durationMs = new Date(now).getTime() - new Date(step.startedAt).getTime();
    step.status = 'COMPLETED';
    step.outputSummary = outputSummary;
    return step;
  }

  failStep(pipelineId: string, stepIndex: number, errorSummary: string = ''): TraceRecord | null {
    const steps = this.traces.get(pipelineId);
    if (!steps) return null;
    const step = steps.find(s => s.stepIndex === stepIndex && s.status === 'RUNNING');
    if (!step) return null;
    const now = new Date().toISOString();
    step.endedAt = now;
    step.durationMs = new Date(now).getTime() - new Date(step.startedAt).getTime();
    step.status = 'FAILED';
    step.outputSummary = errorSummary;
    return step;
  }

  getTrace(pipelineId: string): TraceRecord[] {
    return this.traces.get(pipelineId) || [];
  }

  getAllTraces(): Map<string, TraceRecord[]> {
    return new Map(this.traces);
  }

  clearTraces(pipelineId?: string): void {
    if (pipelineId) {
      this.traces.delete(pipelineId);
    } else {
      this.traces.clear();
    }
  }
}
