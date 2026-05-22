#!/usr/bin/env bun
// agentmesh release — 一键发版：check → test → build → bump → commit → push → publish

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
// logger 由 cli 入口统一初始化，此模块不需要

const PROJECT_ROOT = dirname(dirname((import.meta as any).dir || (import.meta as any).dirname || '.'));

class ReleaseError extends Error {}

async function sh(cmd: string[], cwd?: string): Promise<string> {
  const proc = Bun.spawn(cmd, { cwd: cwd || PROJECT_ROOT, stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  if (proc.exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new ReleaseError(`${cmd.join(' ')} failed (exit ${proc.exitCode}): ${err || out}`);
  }
  return out.trim();
}

function bumpVersion(current: string, level: string): string {
  const parts = current.split('.').map(Number);
  if (parts.length !== 3) throw new ReleaseError(`Invalid version: ${current}`);
  switch (level) {
    case 'major': parts[0]!++; parts[1]=0; parts[2]=0; break;
    case 'minor': parts[1]!++; parts[2]=0; break;
    case 'patch': parts[2]!++; break;
    default: throw new ReleaseError(`Unknown bump level: ${level}`);
  }
  return parts.join('.');
}

function updateVersionFiles(newVer: string) {
  const pkgPath = join(PROJECT_ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  pkg.version = newVer;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  const cliPath = join(PROJECT_ROOT, 'src', 'cli.ts');
  let cli = readFileSync(cliPath, 'utf-8');
  cli = cli.replace(/const VERSION = '[^']+'/, `const VERSION = '${newVer}'`);
  writeFileSync(cliPath, cli);
}

export async function runRelease(level: string = 'patch') {
  const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const oldVer = pkg.version;
  const newVer = bumpVersion(oldVer, level);

  console.log(`\n  🚀 Release: ${oldVer} → ${newVer} (${level})\n`);

  // 1. Typecheck
  console.log('  [1/6] Typecheck...');
  await sh(['bun', 'run', 'typecheck']);
  console.log('  ✅ Typecheck passed');

  // 2. Test
  console.log('  [2/6] Test...');
  await sh(['bun', 'test']);
  console.log('  ✅ Tests passed');

  // 3. Build
  console.log('  [3/6] Build...');
  await sh(['bun', 'run', 'build']);
  console.log('  ✅ Build done');

  // 4. Bump version
  console.log(`  [4/6] Bump version: ${oldVer} → ${newVer}`);
  updateVersionFiles(newVer);
  console.log('  ✅ Version updated');

  // 5. Commit + Push
  console.log('  [5/6] Commit + Push...');
  await sh(['git', 'add', '-A']);
  await sh(['git', 'commit', '-m', `Release v${newVer}`]);
  await sh(['git', 'push', 'origin', 'main']);
  console.log('  ✅ Pushed to GitHub');

  // 6. Publish to npm
  console.log('  [6/7] Publish to npm...');
  const pubOut = await sh(['npm', 'publish']);
  console.log(`  ✅ Published: ${pubOut}`);

  // 7. Install latest globally
  console.log('  [7/7] Install latest...');
  await sh(['npm', 'install', '-g', `@starlink-awaken/agentmesh@${newVer}`]);
  console.log('  ✅ Installed globally');

  console.log(`\n  🎉 v${newVer} released & installed!\n`);
  return newVer;
}

if (import.meta.main) {
  const level = Bun.argv[2] || 'patch';
  runRelease(level).catch(err => {
    console.error(`\n  ❌ Release failed: ${err.message}\n`);
    process.exit(1);
  });
}
