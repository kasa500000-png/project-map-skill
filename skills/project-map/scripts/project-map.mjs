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
import { migrateState } from './lib/storage.mjs';
import { startServer } from './lib/server.mjs';

export async function main(argv = process.argv.slice(2)) {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20 or newer is required.');
  if (!argv.length || argv.includes('--help') || argv[0] === 'help') {
    console.log(`Project Map ${VERSION} — feature map → plan → review → implementation → evidence.
Usage: node project-map.mjs COMMAND --project /path/to/app [options]

  migrate-state                 Copy legacy .project-map state into protected storage
  evidence --id ID --file JSON   Record an explicit check command or PNG/JPEG
  doctor                         Check runtime and selected project
  scan [--summary]               Refresh the map
  serve [--open] [--codex]        Open workspace; optional explicit Codex bridge
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
  if (argv[0] === 'serve' && argv.includes('--codex')) {
    const args={};for(let i=1;i<argv.length;i++) {
      const key=argv[i];if(['--codex','--open'].includes(key)){args[key]=true;continue;}
      if(!['--project','--state-dir','--port'].includes(key)||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Invalid serve option.');args[key]=argv[++i];
    }
    const port=Number(args['--port']||0);if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid port.');
    const instance=await startServer({projectRoot:args['--project']||process.cwd(),stateDir:args['--state-dir'],port,open:!!args['--open'],codex:true});
    console.log(JSON.stringify({status:'listening',url:instance.url,codex:'opt-in: starts only after explicit send',projectRoot:instance.projectRoot}));
    let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await instance.close();process.exit(0);});return instance;
  }
  if(argv[0]==='migrate-state'){if(argv.length>3||(argv[1]&&argv[1]!=='--project')||(argv[1]&&!argv[2]))throw new Error('Use migrate-state --project PATH');console.log(JSON.stringify(await migrateState(path.resolve(argv[2]||process.cwd())),null,2));return;}
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
