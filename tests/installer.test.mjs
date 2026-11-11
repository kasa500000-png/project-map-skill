import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { installSkill, uninstallSkill } from '../scripts/install.mjs';

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'project-map-installer-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, 'SKILL.md'), '---\nname: project-map\ndescription: Example\n---\nFirst version.\n');
  return { root, source, target };
}

test('link installation is repeatable and follows source updates', async t => {
  const { source, target } = await fixture(t);
  const installed = await installSkill({ source, target });
  assert.equal(installed.method, 'link');
  assert.equal((await installSkill({ source, target })).status, 'already-installed');
  await fs.writeFile(path.join(source, 'extra.txt'), 'new version');
  assert.equal(await fs.readFile(path.join(target, 'extra.txt'), 'utf8'), 'new version');
  await uninstallSkill({ source, target });
  assert.equal(await fs.readFile(path.join(source, 'extra.txt'), 'utf8'), 'new version');
  await assert.rejects(fs.lstat(target), { code: 'ENOENT' });
});

test('installer preserves an unrelated existing skill and unrelated link', async t => {
  const { root, source, target } = await fixture(t);
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'SKILL.md'), 'My own skill');
  await assert.rejects(installSkill({ source, target }), /existing skill/);
  await assert.rejects(uninstallSkill({ source, target }), /not created/);
  assert.equal(await fs.readFile(path.join(target, 'SKILL.md'), 'utf8'), 'My own skill');
  const other = path.join(root, 'other');
  await fs.mkdir(other);
  const linked = path.join(root, 'linked');
  await fs.symlink(other, linked, 'dir');
  await assert.rejects(installSkill({ source, target: linked }), /Another link/);
  await assert.rejects(uninstallSkill({ source, target: linked }), /another installation/);
  assert.equal(await fs.realpath(linked), other);
});

test('managed copies update only when users have not changed their content', async t => {
  const { source, target } = await fixture(t);
  assert.equal((await installSkill({ source, target, copy: true })).status, 'installed');
  assert.equal((await installSkill({ source, target, copy: true })).status, 'already-installed');
  await fs.writeFile(path.join(source, 'feature.txt'), 'new feature');
  assert.equal((await installSkill({ source, target, copy: true })).status, 'updated');
  assert.equal(await fs.readFile(path.join(target, 'feature.txt'), 'utf8'), 'new feature');
  await fs.writeFile(path.join(target, 'feature.txt'), 'My local edits');
  await assert.rejects(installSkill({ source, target, copy: true }), /local changes/);
  await assert.rejects(uninstallSkill({ source, target }), /local changes/);
  assert.equal(await fs.readFile(path.join(target, 'feature.txt'), 'utf8'), 'My local edits');
});

test('new files inside an installed copy are protected from removal', async t => {
  const { source, target } = await fixture(t);
  await installSkill({ source, target, copy: true });
  await fs.writeFile(path.join(target, 'my-notes.md'), 'Keep these notes.');
  await assert.rejects(uninstallSkill({ source, target }), /local changes/);
  assert.equal(await fs.readFile(path.join(target, 'my-notes.md'), 'utf8'), 'Keep these notes.');
});

test('copy refuses links nested inside the source instead of following private files', async t => {
  const { root, source, target } = await fixture(t);
  const privateFile = path.join(root, 'private.txt');
  await fs.writeFile(privateFile, 'private');
  await fs.symlink(privateFile, path.join(source, 'linked.txt'));
  await assert.rejects(installSkill({ source, target, copy: true }), /symbolic link/);
  await assert.rejects(fs.lstat(target), { code: 'ENOENT' });
});
