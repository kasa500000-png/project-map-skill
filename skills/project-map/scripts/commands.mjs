#!/usr/bin/env node
import path from 'node:path';
import { access, realpath, stat, lstat, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanProject, analyzeImpact, listTasks, getTask, proposeTask, reviewTask, updateTask, completeTask, getStateDir } from './lib/core.mjs';
import { startServer, summarizeTask } from './lib/server.mjs';

const HELP = `Project Map 0.2.0 — map, request, review a visual plan, implement, compare.

Usage: node project-map.mjs <command> --project /absolute/project/path [options]

  doctor                Check local runtime and project directory
  scan [--summary]      Build or refresh the source relationship map
  serve [--open]        Start a loopback-only map UI (keeps running)
  impact --node PATH    Preview change scope; repeat --node or separate with commas
  tasks                 List saved requests without large source baselines
  task --id ID          Read a saved request and its scoped context
  plan --id ID --file PATH  Publish Codex's proposed changes for visual review
  review --id ID       Record the user's approval or requested revision
  start --id ID         Check the reviewed plan and freshness before editing
  complete --id ID      Compare with the request baseline and record a result
  wait [--timeout 50]   Wait up to 50 seconds for queued or approved work

Options:
  --state-dir PATH      Custom local state directory (default PROJECT/.project-map)
  --intent VALUE        display | behavior | contract (default behavior)
  --request TEXT        Natural-language change request for impact preview
  --port NUMBER         Loopback HTTP port (default 0: choose a free port)
  --status VALUES       Filter tasks/wait by comma-separated statuses
  --file PATH           Plan JSON file (plan command)
  --decision VALUE      approve | revise (review command)
  --revision NUMBER     Exact plan revision the user reviewed
  --snapshot ID         Exact plan snapshot the user reviewed
  --note TEXT           User's review feedback
  --summary TEXT        Completion summary (scan: boolean summary output)
  --checks JSON         Array of {name,status:passed|failed|not_run,detail?,nodeId?}
  --checks-file PATH    Read verification results from a JSON file
  --help                Show help

The server does not execute code edits or start Codex. An active Codex skill
reads a saved request and performs the requested work using its normal tools.
Review records only a specific user's decision; the agent must not approve its
own plan. A completed edit does not prove the expected behavior was verified.
`;

function parse(argv) {
  const result = { command: 'help', node: [] };
  let i = 0;
  if (argv[0] && !argv[0].startsWith('--')) result.command = argv[i++];
  const boolean = new Set(['help', 'open']);
  const values = new Set(['project', 'state-dir', 'intent', 'request', 'port', 'status', 'id', 'timeout', 'checks', 'checks-file', 'file', 'decision', 'revision', 'snapshot', 'note']);
  for (; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--')) throw new Error(`Unexpected argument: ${argv[i]}`);
    if (boolean.has(key)) { result[key] = true; continue; }
    if (key === 'summary' && result.command === 'scan') { result.summary = true; continue; }
    if (!values.has(key) && !['node', 'summary'].includes(key)) throw new Error(`Unknown option: --${key}`);
    const value = argv[++i];
    if (value == null || value.startsWith('--')) throw new Error(`--${key} requires a value.`);
    if (key === 'node') result.node.push(...value.split(',').filter(Boolean));
    else result[key] = value;
  }
  return result;
}

const print = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

async function inputJSON(filename, label) {
  if (!filename) throw new Error(`${label} requires a JSON file path.`);
  const file = path.resolve(filename), info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024) throw new Error(`${label} must be a regular JSON file of at most 128 KiB.`);
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch { throw new Error(`${label} is not valid JSON.`); }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parse(argv);
  if (args.help || args.command === 'help') { process.stdout.write(HELP); return; }
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Node.js 20 or newer is required.');
  const projectRoot = await realpath(path.resolve(args.project || process.cwd()));
  if (!(await stat(projectRoot)).isDirectory()) throw new Error('Project must be a directory.');
  const options = { stateDir: args['state-dir'] };
  if (args.command === 'doctor') {
    await access(projectRoot, constants.R_OK);
    const git = spawnSync('git', ['--version'], { encoding: 'utf8', shell: false });
    print({ ok: true, version: '0.2.0', node: process.version, git: git.status === 0 ? git.stdout.trim() : null, projectRoot, stateDir: getStateDir(projectRoot, options.stateDir), browserIntegration: 'Detected by the UI; normal browsers use saved request / copy handoff.', codeExecution: 'Performed by Codex after the user reviews the plan, never by the local HTTP server.' });
    return;
  }
  if (args.command === 'scan') {
    const map = await scanProject(projectRoot, options);
    print(args.summary ? { project: map.project, snapshotId: map.snapshotId, generatedAt: map.generatedAt, nodes: map.nodes.length, edges: map.edges.length, warnings: map.warnings } : map);
    return;
  }
  if (args.command === 'serve') {
    const port = Number(args.port || 0);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be between 0 and 65535.');
    const instance = await startServer({ projectRoot, ...options, port, open: Boolean(args.open) });
    print({ status: 'listening', url: instance.url, projectRoot, pid: process.pid, browserOpenRequested: Boolean(args.open) });
    let closing = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
      if (closing) return; closing = true;
      await instance.close(); process.exit(0);
    });
    return instance;
  }
  if (args.command === 'impact') {
    const map = await scanProject(projectRoot, options);
    print(analyzeImpact(map, { nodeIds: args.node, intent: args.intent || 'behavior', request: args.request || '' }));
    return;
  }
  if (args.command === 'tasks') {
    const tasks = await listTasks(projectRoot, options);
    const statuses = args.status?.split(',');
    print({ tasks: tasks.filter(task => !statuses || statuses.includes(task.status)).map(summarizeTask) });
    return;
  }
  if (args.command === 'wait') {
    const timeout = Number(args.timeout || 50);
    if (!Number.isFinite(timeout) || timeout < 0 || timeout > 50) throw new Error('Wait timeout must be 0–50 seconds.');
    const end = Date.now() + timeout * 1000;
    do {
      const statuses = (args.status || 'queued,approved').split(',');
      const tasks = (await listTasks(projectRoot, options)).filter(task => statuses.includes(task.status));
      if (tasks.length) { print({ status: 'ready', tasks: tasks.map(summarizeTask) }); return; }
      if (Date.now() >= end) break;
      await new Promise(resolve => setTimeout(resolve, Math.min(1000, end - Date.now())));
    } while (Date.now() <= end);
    print({ status: 'waiting', tasks: [] });
    return;
  }
  if (['task', 'plan', 'review', 'start', 'complete'].includes(args.command)) {
    if (!args.id) throw new Error('--id is required.');
    const task = await getTask(projectRoot, args.id, options);
    if (args.command === 'task') { print(summarizeTask(task)); return; }
    if (args.command === 'plan') {
      const proposal = await inputJSON(args.file, '--file');
      print(summarizeTask(await proposeTask(projectRoot, args.id, proposal, options)));
      return;
    }
    if (args.command === 'review') {
      const revision = Number(args.revision);
      if (!Number.isInteger(revision) || revision < 1 || !args.snapshot || !['approve', 'revise'].includes(args.decision)) throw new Error('Review requires --decision approve|revise, --revision NUMBER, and --snapshot ID for the plan the user reviewed.');
      print(summarizeTask(await reviewTask(projectRoot, args.id, { decision: args.decision, revision, snapshotId: args.snapshot, note: args.note || '', source: 'conversation' }, options)));
      return;
    }
    if (args.command === 'start') {
      print(summarizeTask(await updateTask(projectRoot, args.id, { status: 'running' }, options)));
      return;
    }
    let checks = [];
    if (args.checks && args['checks-file']) throw new Error('Choose --checks or --checks-file, not both.');
    if (args['checks-file']) checks = await inputJSON(args['checks-file'], '--checks-file');
    else try { checks = args.checks ? JSON.parse(args.checks) : []; } catch { throw new Error('--checks must be a JSON array.'); }
    if (!Array.isArray(checks) || checks.some(item => !item || typeof item.name !== 'string' || !['passed', 'failed', 'not_run'].includes(item.status))) throw new Error('Each check needs name and passed / failed / not_run status.');
    print(summarizeTask(await completeTask(projectRoot, args.id, { ...(args.summary !== undefined ? {summary:args.summary} : {}), ...(args.checks || args['checks-file'] ? {checks} : {}) }, options)));
    return;
  }
  throw new Error(`Unknown command: ${args.command}. Use --help.`);
}

const invokedPath = process.argv[1] ? await realpath(path.resolve(process.argv[1])).catch(() => '') : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    process.stderr.write(`${JSON.stringify({ error: err.code || 'COMMAND_FAILED', message: err.message })}\n`);
    process.exitCode = 1;
  });
}
