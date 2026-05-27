import { describe, it, expect } from 'bun:test';
import { PipelineTracer, OBSERVABILITY_VERSION } from '../index';

describe('PipelineTracer', () => {
  const tracer = new PipelineTracer();

  it('startStep creates a RUNNING trace', () => {
    const trace = tracer.startStep('pipeline-1', 0, 'eidos', 'validate');
    expect(trace.pipelineId).toBe('pipeline-1');
    expect(trace.stepIndex).toBe(0);
    expect(trace.status).toBe('RUNNING');
    expect(trace.endedAt).toBeNull();
  });

  it('completeStep finishes a trace', () => {
    const tr = new PipelineTracer();
    tr.startStep('pipeline-c', 0, 'eidos', 'validate');
    const completed = tr.completeStep('pipeline-c', 0);
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe('COMPLETED');
    expect(completed!.endedAt).not.toBeNull();
    expect(completed!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('failStep marks trace as FAILED', () => {
    const tr = new PipelineTracer();
    tr.startStep('pipeline-f', 0, 'ontoderive', 'derive');
    const failed = tr.failStep('pipeline-f', 0, 'error: timeout');
    expect(failed).not.toBeNull();
    expect(failed!.status).toBe('FAILED');
    expect(failed!.outputSummary).toBe('error: timeout');
  });

  it('getTrace returns pipeline steps', () => {
    const tr = new PipelineTracer();
    tr.startStep('pipeline-g', 0, 'tool-a', 'action-a');
    tr.startStep('pipeline-g', 1, 'tool-b', 'action-b');
    const trace = tr.getTrace('pipeline-g');
    expect(trace).toHaveLength(2);
  });

  it('getAllTraces returns all pipelines', () => {
    const tr = new PipelineTracer();
    tr.startStep('p-x', 0, 't1', 'a1');
    tr.startStep('p-y', 0, 't2', 'a2');
    const all = tr.getAllTraces();
    expect(all.size).toBe(2);
  });

  it('clearTraces removes specific pipeline', () => {
    const tr = new PipelineTracer();
    tr.startStep('p-clr', 0, 't', 'a');
    tr.clearTraces('p-clr');
    expect(tr.getTrace('p-clr')).toHaveLength(0);
  });

  it('clearTraces without arg removes all', () => {
    const tr = new PipelineTracer();
    tr.startStep('p-a', 0, 't', 'a');
    tr.startStep('p-b', 0, 't', 'a');
    tr.clearTraces();
    expect(tr.getAllTraces().size).toBe(0);
  });

  it('OBSERVABILITY_VERSION is 1.0', () => {
    expect(OBSERVABILITY_VERSION).toBe('1.0');
  });
});
