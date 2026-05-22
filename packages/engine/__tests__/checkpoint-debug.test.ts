import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test, expect } from 'bun:test';
import { HoneycombOrchestrator } from '../src/orchestrator.js';

function setupTestEnvironment() {
  const tempDir = mkdtempSync(join(tmpdir(), 'hc-dbg-'));
  const dbPath = join(tempDir, 'test.db');
  const agentsDir = join(tempDir, 'agents');
  const domainsDir = join(tempDir, 'domains');
  const outputDir = join(tempDir, 'output');

  mkdirSync(outputDir, { recursive: true });
  mkdirSync(domainsDir, { recursive: true });

  const layers = [
    { dir: 'layer-1-research', name: 'researcher' },
  ];

  for (const layer of layers) {
    const layerDir = join(agentsDir, layer.dir);
    mkdirSync(layerDir, { recursive: true });
    writeFileSync(
      join(layerDir, `${layer.name}.md`),
      `---
name: ${layer.name}
description: Test ${layer.name}
tools: ['read']
---

# ${layer.name}
`,
    );
  }

  return { dbPath, agentsDir, domainsDir, outputDir, tempDir };
}

describe('Checkpoint Debug', () => {
  test('multiple checkpoints - debug timestamps', async () => {
    const env = setupTestEnvironment();
    const orchestrator = new HoneycombOrchestrator({
      db_path: env.dbPath,
      agents_root: env.agentsDir,
      domains_root: env.domainsDir,
      output_dir: env.outputDir,
      log_level: 'error',
      auto_checkpoint: false,
    });

    orchestrator.createProject({
      name: 'Multi-Checkpoint Test',
      description: 'Test',
      archetype: 'custom',
      goals: ['test'],
    });

    orchestrator.checkpoint('Checkpoint 1');
    const checkpoints1 = orchestrator.listCheckpoints();
    console.log('After CP1:', checkpoints1.map(c => `${c.description} (ts=${c.timestamp})`));
    
    await new Promise(r => setTimeout(r, 10));
    orchestrator.advancePhase('Moving forward');
    await new Promise(r => setTimeout(r, 10));
    
    orchestrator.checkpoint('Checkpoint 2');
    const checkpoints2 = orchestrator.listCheckpoints();
    console.log('After CP2:', checkpoints2.map(c => `${c.description} (ts=${c.timestamp})`));
    
    await new Promise(r => setTimeout(r, 10));
    orchestrator.advancePhase('Moving further');
    await new Promise(r => setTimeout(r, 10));
    
    orchestrator.checkpoint('Checkpoint 3');
    const checkpoints3 = orchestrator.listCheckpoints();
    console.log('After CP3:', checkpoints3.map(c => `${c.description} (ts=${c.timestamp})`));

    const checkpoints = orchestrator.listCheckpoints();
    console.log('Final order:', checkpoints.map((cp, i) => `${i}: ${cp.description} (ts=${cp.timestamp})`));
    
    expect(checkpoints.length).toBe(3);
    expect(checkpoints[0].description).toBe('Checkpoint 3');
    expect(checkpoints[1].description).toBe('Checkpoint 2');
    expect(checkpoints[2].description).toBe('Checkpoint 1');

    orchestrator.shutdown();
    rmSync(env.tempDir, { recursive: true, force: true });
  });
});
