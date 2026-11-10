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
  'skills/project-map/assets/index.html', 'skills/project-map/assets/app.js',
  'skills/project-map/assets/styles.css', 'skills/project-map/references/config.md',
  'examples/sample-app/package.json'
];
for (const file of required) {
  if (!(await fs.stat(path.join(root, file))).isFile()) throw new Error(`Missing package file: ${file}`);
}
const skill = await fs.readFile(path.join(root, 'skills/project-map/SKILL.md'), 'utf8');
if (!/^---\r?\nname: project-map\r?\ndescription: /m.test(skill) || /\[TODO|TODO:/.test(skill)) throw new Error('Skill metadata is incomplete.');
const agent = await fs.readFile(path.join(root, 'skills/project-map/agents/openai.yaml'), 'utf8');
if (!agent.includes('$project-map')) throw new Error('The default prompt must name the skill.');
let checked = 0;
async function visit(folder) {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.project-map', 'examples'].includes(entry.name)) continue;
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
