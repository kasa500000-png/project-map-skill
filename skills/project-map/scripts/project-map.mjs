#!/usr/bin/env node
import path from 'node:path';
import { realpath, stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main as commands } from './commands.mjs';
import { getStateDir, getTask, recordEvidence } from './lib/core.mjs';
import { readFile } from 'node:fs/promises';
import { VERSION } from './lib/version.mjs';

export async function main(argv = process.argv.slice(2)) {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20 or newer is required.');
  if (!argv.length || argv.includes('--help') || argv[0] === 'help') {
    console.log(`Project Map ${VERSION} — feature map → plan → review → implementation → evidence.
Usage: node project-map.mjs COMMAND --project /path/to/app [options]

  evidence --id ID --file JSON   Record an explicit check command or PNG/JPEG
  doctor                         Check runtime and selected project
  scan [--summary]               Refresh the map
  serve [--open] [--port N]      Open the feature workspace on loopback
  impact --node PATH             Inspect initial impact
  tasks [--status queued]        List saved requests
  task --id ID                   Read the request and feature context
  plan --id ID --file JSON       Publish a visual plan
  review --id ID --decision approve|revise --revision N --snapshot ID
  start --id ID                  Start only after the user's plan review
  complete --id ID --summary TEXT --checks-file JSON
  wait [--timeout 50]            Wait in an active session, never wake an ended one

Use --state-dir PATH for custom local state. Plans and checks follow the schemas
in references/plan-format.md. The agent must never approve its own plan.
`); return;
  }
  if (argv[0] === 'evidence') {
    const args = {};
    for (let i=1;i<argv.length;i+=2) {
      if (!['--project','--state-dir','--id','--file'].includes(argv[i]) || !argv[i+1] || argv[i+1].startsWith('--')) throw new Error('evidence accepts --project, --state-dir, --id, --file.');
      args[argv[i]]=argv[i+1];
    }
    const root=await realpath(path.resolve(args['--project'] || process.cwd())), options={stateDir:args['--state-dir']};
    const task=await getTask(root,args['--id'],options);
    const spec=JSON.parse(await readFile(args['--file'],'utf8'));
    console.log(JSON.stringify(await recordEvidence(root,task,spec,options),null,2));return;
  }
  if (argv[0] === 'doctor') {
    const allowed = new Set(['--project', '--state-dir']); const values = {};
    for (let i = 1; i < argv.length; i += 2) {
      if (!allowed.has(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('doctor accepts --project PATH and --state-dir PATH.');
      values[argv[i]] = argv[i + 1];
    }
    const root = await realpath(path.resolve(values['--project'] || process.cwd()));
    if (!(await stat(root)).isDirectory()) throw new Error('Project must be a directory.');
    await access(root, constants.R_OK);
    const git = spawnSync('git', ['--version'], { encoding: 'utf8', shell: false });
    console.log(JSON.stringify({ ok: true, version: VERSION, node: process.version,
      git: git.status === 0 ? git.stdout.trim() : null, projectRoot: root,
      stateDir: getStateDir(root, values['--state-dir']),
      browserIntegration: 'Feature workspace; copyable request handoff by default.',
      codeExecution: 'Codex executes after user review; saving is not execution.' }, null, 2)); return;
  }
  return commands(argv);
}
const invoked = process.argv[1] ? await realpath(path.resolve(process.argv[1])).catch(() => '') : '';
if (invoked === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(JSON.stringify({ error: error.code || 'COMMAND_FAILED', message: error.message })); process.exitCode = 1;
});
