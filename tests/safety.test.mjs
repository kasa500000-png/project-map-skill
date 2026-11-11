import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import * as w from '../skills/project-map/scripts/lib/core.mjs';
import {restorePreview,restoreApply} from '../skills/project-map/scripts/lib/safety.mjs';
async function fixture(t,{newFile=false,remove=false}={}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pm-safety-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'app'),{recursive:true});await fs.writeFile(path.join(root,'app/page.tsx'),'// pre-existing uncommitted content\nexport default function Home(){return null;}');
 await fs.writeFile(path.join(root,'unrelated.txt'),'keep me');
 const map=await w.scanProject(root),task=await w.createTask(root,{nodeIds:['app/page.tsx'],request:'change',snapshotId:map.snapshotId});
 const files=['app/page.tsx',...(newFile?['app/new/page.tsx']:[])];
 const plan=await w.proposeTask(root,task.id,{summary:'change',writeFiles:files,effects:files.map(nodeId=>({nodeId,change:'change',expected:'result',verify:'check'})),...(newFile?{newNodes:[{id:'app/new/page.tsx',label:'new',kind:'screen'}]}:{}),...(remove?{removeNodeIds:['app/page.tsx']}: {})});
 await w.reviewTask(root,task.id,{decision:'approve',revision:plan.plan.revision,snapshotId:plan.plan.snapshotId});
 await w.updateTask(root,task.id,{status:'running'});return {root,id:task.id};
}
async function done(root,id){return w.completeTask(root,id,{summary:'done',checks:[]});}
test('checkpoint restores pre-existing dirty content and preserves unrelated edits',async t=>{
 const {root,id}=await fixture(t),before=await fs.readFile(path.join(root,'app/page.tsx'),'utf8');
 await fs.writeFile(path.join(root,'app/page.tsx'),'// task changed');await fs.writeFile(path.join(root,'unrelated.txt'),'another task');
 const task=await done(root,id),preview=await restorePreview(root,task);assert.equal(preview.files.length,1);
 const result=await restoreApply(root,task,preview.token);assert.equal(result.externalStateRestored,false);
 assert.equal(await fs.readFile(path.join(root,'app/page.tsx'),'utf8'),before);assert.equal(await fs.readFile(path.join(root,'unrelated.txt'),'utf8'),'another task');
 assert.ok((await w.getTask(root,id)).experience.safety.checkpoint.restoredAt);await assert.rejects(()=>restoreApply(root,task,preview.token));
});
test('restoring additions and deletions affects only explicitly planned files',async t=>{
 const {root,id}=await fixture(t,{newFile:true,remove:true});await fs.unlink(path.join(root,'app/page.tsx'));await fs.mkdir(path.join(root,'app/new'));await fs.writeFile(path.join(root,'app/new/page.tsx'),'export default function New(){return null;}');
 const task=await done(root,id),preview=await restorePreview(root,task);assert.ok(preview.files.some(f=>f.action==='remove'));assert.ok(preview.files.some(f=>f.action==='recreate'));
 await restoreApply(root,task,preview.token);assert.match(await fs.readFile(path.join(root,'app/page.tsx'),'utf8'),/pre-existing/);await assert.rejects(fs.stat(path.join(root,'app/new/page.tsx')),{code:'ENOENT'});
});
test('concurrent edits after completion are refused before any restoration',async t=>{
 const {root,id}=await fixture(t);await fs.appendFile(path.join(root,'app/page.tsx'),'\n// first');const task=await done(root,id);
 await fs.appendFile(path.join(root,'app/page.tsx'),'\n// second');await assert.rejects(()=>restorePreview(root,task),e=>e.code==='RESTORE_CONFLICT');assert.match(await fs.readFile(path.join(root,'app/page.tsx'),'utf8'),/second/);
});
test('preview token and exact current content are required',async t=>{
 const {root,id}=await fixture(t);await fs.appendFile(path.join(root,'app/page.tsx'),'\n// first');const task=await done(root,id),preview=await restorePreview(root,task);
 await assert.rejects(()=>restoreApply(root,task,'wrong'),e=>e.code==='STALE_RESTORE');await fs.appendFile(path.join(root,'app/page.tsx'),'\n// next');await assert.rejects(()=>restoreApply(root,task,preview.token),e=>e.code==='RESTORE_CONFLICT');
});
test('modified checkpoint blobs fail validation without touching source',async t=>{
 const {root,id}=await fixture(t);await fs.writeFile(path.join(root,'app/page.tsx'),'// changed');const task=await done(root,id),preview=await restorePreview(root,task);
 const cp=JSON.parse(await fs.readFile(path.join(root,'.project-map/checkpoints',id+'.json')));await fs.writeFile(path.join(root,'.project-map/checkpoint-blobs',cp.files[0].beforeHash),'tampered');
 await assert.rejects(()=>restoreApply(root,task,preview.token),/손상/);assert.equal(await fs.readFile(path.join(root,'app/page.tsx'),'utf8'),'// changed');
});
test('pause records state only after explicit external-stop acknowledgment and resume requires review',async t=>{
 const {root,id}=await fixture(t);await fs.appendFile(path.join(root,'app/page.tsx'),'\n// partial');
 await assert.rejects(()=>w.workspaceRoute(root,`/api/tasks/${id}/pause`,{}));
 const paused=(await w.workspaceRoute(root,`/api/tasks/${id}/pause`,{executionStopped:true})).value;assert.equal(paused.status,'blocked');
 const resumed=(await w.workspaceRoute(root,`/api/tasks/${id}/resume-plan`,{})).value;assert.equal(resumed.status,'awaiting_review');assert.equal(resumed.approval,null);
 await assert.rejects(()=>w.updateTask(root,id,{status:'running'}),e=>e.code==='REVIEW_REQUIRED');
 await w.reviewTask(root,id,{decision:'approve',revision:resumed.plan.revision,snapshotId:resumed.plan.snapshotId});await w.updateTask(root,id,{status:'running'});
 await fs.appendFile(path.join(root,'app/page.tsx'),'\n// finish');const task=await done(root,id),preview=await restorePreview(root,task);await restoreApply(root,task,preview.token);
 assert.doesNotMatch(await fs.readFile(path.join(root,'app/page.tsx'),'utf8'),/partial/);
});
test('recompleting a finished task does not rebaseline later changes',async t=>{
 const {root,id}=await fixture(t);await fs.appendFile(path.join(root,'app/page.tsx'),'\n// first');const first=await done(root,id);await fs.writeFile(path.join(root,'other.yml'),'second: true');const second=await done(root,id);
 assert.deepEqual(second.experience.assurance.audit,first.experience.assurance.audit);
});
test('symlink replacement of a planned source is refused', {skip:process.platform==='win32'},async t=>{
 const {root,id}=await fixture(t);const task=await done(root,id);await fs.unlink(path.join(root,'app/page.tsx'));await fs.symlink(path.join(root,'unrelated.txt'),path.join(root,'app/page.tsx'));
 await assert.rejects(()=>restorePreview(root,task),e=>e.code==='UNSAFE_PATH');assert.equal(await fs.readFile(path.join(root,'unrelated.txt'),'utf8'),'keep me');
});
