#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const required = [
  'README.md', 'README.en.md', 'LICENSE', 'scripts/install.mjs',
  'skills/project-map/SKILL.md', 'skills/project-map/agents/openai.yaml',
  'skills/project-map/scripts/project-map.mjs',
  'skills/project-map/scripts/lib/core.mjs', 'skills/project-map/scripts/lib/server.mjs',
  'skills/project-map/scripts/lib/flow.mjs', 'skills/project-map/references/plan-format.md',
  'skills/project-map/assets/index.html', 'skills/project-map/assets/app.js',
  'skills/project-map/assets/styles.css', 'skills/project-map/references/config.md',
  'skills/project-map/scripts/commands.mjs', 'skills/project-map/scripts/lib/version.mjs',
  'skills/project-map/scripts/lib/analyzer.mjs',
  'skills/project-map/scripts/lib/workspace.mjs',
  'skills/project-map/scripts/lib/feature-map.mjs',
  'skills/project-map/assets/workbench.html', 'skills/project-map/assets/workbench.js',
  'skills/project-map/assets/workbench.css', 'examples/sample-app/package.json',
  ...['state-store','inventory','assurance','safety','efficiency','codex-bridge','verification','finalize','task-lock','graph-review','storage','activity','bridge-preflight'].map(name => `skills/project-map/scripts/lib/${name}.mjs`),
  ...['assurance-ui','safety-ui','bridge-ui'].map(name => `skills/project-map/assets/${name}.js`),
  'skills/project-map/references/bridge.md'
];
for (const file of required) {
  if (!(await fs.stat(path.join(root, file))).isFile()) throw new Error(`Missing package file: ${file}`);
}
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const { VERSION } = await import('../skills/project-map/scripts/lib/version.mjs');
if (pkg.version !== VERSION) throw new Error('Version metadata differs.');
const skill = await fs.readFile(path.join(root, 'skills/project-map/SKILL.md'), 'utf8');
if (!/^---\r?\nname: project-map\r?\ndescription: /m.test(skill) || /\[TODO|TODO:/.test(skill)) throw new Error('Skill metadata is incomplete.');
const agent = await fs.readFile(path.join(root, 'skills/project-map/agents/openai.yaml'), 'utf8');
if (!agent.includes('$project-map')) throw new Error('The default prompt must name the skill.');
let checked = 0;
async function visit(folder) {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.project-map', '.agents', 'examples'].includes(entry.name)) continue;
    const file = path.join(folder, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected packaged symlink: ${path.relative(root, file)}`);
    if (entry.isDirectory()) await visit(file);
    else if (/\.(?:mjs|js)$/.test(entry.name)) {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
      checked++;
    }
  }
}
await visit(root);
console.log(`Package files and ${checked} JavaScript entry points validated.`);
