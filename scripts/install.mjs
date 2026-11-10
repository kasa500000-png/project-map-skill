#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MARKER = '.project-map-install.json';
const DEFAULT_SOURCE = path.join(REPO, 'skills', 'project-map');

async function statOrNull(file) {
  try { return await fs.lstat(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function manifestOf(root) {
  const result = {};
  async function visit(directory, prefix = '') {
    const entries = (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (relative === MARKER) continue;
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Refusing a symbolic link inside the copied skill: ${relative}`);
      if (entry.isDirectory()) await visit(full, relative);
      else if (entry.isFile()) result[relative] = crypto.createHash('sha256').update(await fs.readFile(full)).digest('hex');
      else throw new Error(`Unsupported entry in the skill: ${relative}`);
    }
  }
  await visit(root);
  return result;
}

function sameManifest(a, b) {
  const keys = Object.keys(a).sort();
  return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}

async function readManagedCopy(target) {
  try {
    const markerStat = await fs.lstat(path.join(target, MARKER));
    if (!markerStat.isFile() || markerStat.isSymbolicLink()) return null;
    const value = JSON.parse(await fs.readFile(path.join(target, MARKER), 'utf8'));
    if (value.format !== 1 || value.skill !== 'project-map' || !value.files || typeof value.files !== 'object' || Array.isArray(value.files)) return null;
    return value;
  } catch { return null; }
}

export async function installSkill({ source = DEFAULT_SOURCE, target, copy = false }) {
  source = await fs.realpath(source);
  target = path.resolve(target);
  const skill = await fs.readFile(path.join(source, 'SKILL.md'), 'utf8');
  if (!/^name:\s*["']?project-map["']?\s*$/m.test(skill)) throw new Error('The source is not the project-map skill.');
  if (target === source || target.startsWith(source + path.sep)) throw new Error('The installation destination must be outside the source skill.');
  const existing = await statOrNull(target);
  if (existing?.isSymbolicLink()) {
    let resolved;
    try { resolved = await fs.realpath(target); } catch { resolved = null; }
    if (resolved === source) return { status: 'already-installed', method: 'link', target, source };
    throw new Error(`Another link already exists at ${target}. Rename or remove it yourself before installing.`);
  }
  let managed = null;
  if (existing) {
    if (!existing.isDirectory()) throw new Error(`A file already exists at ${target}; nothing was changed.`);
    managed = await readManagedCopy(target);
    if (!managed) throw new Error(`An existing skill is present at ${target}. It was not created by this installer; nothing was changed.`);
    if (!sameManifest(await manifestOf(target), managed.files)) throw new Error(`The installed copy at ${target} has local changes. Back up or rename it before updating; nothing was changed.`);
    if (!copy) throw new Error('A managed copy is already installed. Use --copy to update it, or uninstall the unchanged copy before switching to a link.');
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (!copy) {
    try { await fs.symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw new Error('This system did not permit a symbolic link. Retry with --copy. Existing files were not changed.');
      throw error;
    }
    return { status: 'installed', method: 'link', target, source };
  }
  const sourceFiles = await manifestOf(source);
  if (managed && sameManifest(sourceFiles, managed.files)) return { status: 'already-installed', method: 'copy', target, source };
  const suffix = crypto.randomBytes(8).toString('hex');
  const staging = `${target}.install-${suffix}`;
  const backup = `${target}.previous-${suffix}`;
  let moved = false;
  try {
    await fs.cp(source, staging, { recursive: true, errorOnExist: true, force: false, dereference: false });
    await fs.writeFile(path.join(staging, MARKER), JSON.stringify({ format: 1, skill: 'project-map', source, files: sourceFiles }, null, 2) + '\n');
    if (existing) { await fs.rename(target, backup); moved = true; }
    await fs.rename(staging, target);
    if (moved) await fs.rm(backup, { recursive: true });
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    if (moved && !(await statOrNull(target))) await fs.rename(backup, target);
    throw error;
  }
  return { status: existing ? 'updated' : 'installed', method: 'copy', target, source };
}

export async function uninstallSkill({ source = DEFAULT_SOURCE, target }) {
  target = path.resolve(target);
  const existing = await statOrNull(target);
  if (!existing) return { status: 'not-installed', target };
  if (existing.isSymbolicLink()) {
    const absoluteLink = path.resolve(path.dirname(target), await fs.readlink(target));
    let expected = path.resolve(source), resolved = absoluteLink;
    try { expected = await fs.realpath(source); } catch { /* Permit removing this clone's broken link. */ }
    try { resolved = await fs.realpath(target); } catch { /* Match its literal destination if broken. */ }
    if (resolved !== expected && absoluteLink !== path.resolve(source)) throw new Error('This link belongs to another installation; nothing was removed.');
    await fs.unlink(target);
    return { status: 'uninstalled', method: 'link', target };
  }
  if (!existing.isDirectory()) throw new Error('The installation path is not a managed skill; nothing was removed.');
  const managed = await readManagedCopy(target);
  if (!managed) throw new Error('This skill was not created by this installer; nothing was removed.');
  if (!sameManifest(await manifestOf(target), managed.files)) throw new Error('The installed skill has local changes. Back it up or move it yourself; nothing was removed.');
  await fs.rm(target, { recursive: true });
  return { status: 'uninstalled', method: 'copy', target };
}

export async function installMain(argv = process.argv.slice(2)) {
  if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Project Map requires Node.js 20 or newer.');
  let project, copy = false, uninstall = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--project') {
      project = argv[++index];
      if (!project || project.startsWith('--')) throw new Error('--project requires an existing project directory.');
    } else if (arg === '--copy') copy = true;
    else if (arg === '--uninstall') uninstall = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/install.mjs [--project /path/to/app] [--copy] [--uninstall]\n\nDefault: install a link in ~/.agents/skills/project-map.\n--project: install in the project’s .agents/skills/project-map.\n--copy: copy files instead; repeat after git pull to update.\n--uninstall: remove only an unchanged installation owned by this installer.');
      return;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  let base = os.homedir();
  if (project) {
    base = await fs.realpath(path.resolve(project));
    if (!(await fs.stat(base)).isDirectory()) throw new Error('--project must be a directory.');
  }
  const target = path.join(base, '.agents', 'skills', 'project-map');
  const result = uninstall ? await uninstallSkill({ target }) : await installSkill({ target, copy });
  console.log(JSON.stringify(result, null, 2));
  if (!uninstall) console.log('\nOpen your app project in Codex, then use: $project-map\nIf the skill list is cached, reopen its selector or start a new conversation.');
}

const invokedFile = process.argv[1] ? await fs.realpath(path.resolve(process.argv[1])).catch(() => null) : null;
if (invokedFile && import.meta.url === pathToFileURL(invokedFile).href) {
  installMain().catch(error => { console.error(`Project Map: ${error.message}`); process.exitCode = 1; });
}
