import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as w from '../skills/project-map/scripts/lib/core.mjs';
import { restorePreview, restoreApply } from '../skills/project-map/scripts/lib/safety.mjs';
import { buildFeatureMap } from '../skills/project-map/scripts/lib/feature-map.mjs';
const HOME='app/page.tsx';
const effect=nodeId=>({nodeId,change:'내용 변경',expected:'새 내용 표시',verify:'화면과 저장 확인'});
async function fixture(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pm-artifacts-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,HOME),'export default function Home(){return null;}');
 await fs.writeFile(path.join(root,'content.json'),'{"title":"before"}');await fs.writeFile(path.join(root,'icon.png'),Buffer.from([137,80,78,71,13,10,26,10,1,2,3]));
 const map=await w.scanProject(root),task=await w.createTask(root,{nodeIds:[HOME],request:'콘텐츠와 아이콘 변경',snapshotId:map.snapshotId});return {root,task};
}
async function run(root,task,plan){const p=await w.proposeTask(root,task.id,plan);await w.reviewTask(root,task.id,{decision:'approve',revision:p.plan.revision,snapshotId:p.plan.snapshotId});return w.updateTask(root,task.id,{status:'running'});}
test('R5: existing content and image files enter a reviewed plan, audit and restoration',async t=>{
 const {root,task}=await fixture(t);const plan={summary:'홈 콘텐츠·이미지 변경',writeFiles:['content.json','icon.png'],effects:[effect('content.json'),effect('icon.png')],assetBindings:{'content.json':HOME,'icon.png':HOME}};
 const running=await run(root,task,plan);
 assert.ok(running.plan.beforeGraph.nodes.some(n=>n.id==='content.json'&&n.artifact));
 await fs.writeFile(path.join(root,'content.json'),'{"title":"after"}');await fs.writeFile(path.join(root,'icon.png'),'changed image bytes');
 const done=await w.completeTask(root,task.id);
 assert.ok(done.experience.assurance.audit.changes.every(c=>!c.outOfScope));
 assert.equal(done.experience.expectedGraph.nodes.find(n=>n.entryNodeIds.includes(HOME)).planned,true);
 assert.equal(done.experience.actualGraph.nodes.find(n=>n.entryNodeIds.includes(HOME)).changeStatus,'modified');
 assert.equal(done.experience.comparison.planned.length,2);
 const preview=await restorePreview(root,done);await restoreApply(root,done,preview.token);
 assert.equal(await fs.readFile(path.join(root,'content.json'),'utf8'),'{"title":"before"}');
});
test('artifact creation and removal remain explicit and are not source navigation claims',async t=>{
 const {root,task}=await fixture(t);
 const running=await run(root,task,{summary:'아이콘 제거 및 새 데이터 추가',writeFiles:['icon.png','new.yml'],effects:[effect('icon.png'),effect('new.yml')],removeNodeIds:['icon.png'],newNodes:[{id:'new.yml',label:'새 콘텐츠',kind:'data'}],assetBindings:{'icon.png':HOME,'new.yml':HOME}});
 await fs.unlink(path.join(root,'icon.png'));await fs.writeFile(path.join(root,'new.yml'),'title: new');
 const done=await w.completeTask(root,task.id);
 assert.ok(done.experience.comparison.planned.every(c=>c.matches));
 assert.ok(done.experience.actualGraph.nodes.some(n=>n.changeKinds?.includes('deleted')));
 assert.equal(running.plan.flowChanges.length,0);
 const preview=await restorePreview(root,done);await restoreApply(root,done,preview.token);await fs.stat(path.join(root,'icon.png'));await assert.rejects(fs.stat(path.join(root,'new.yml')),{code:'ENOENT'});
});
test('secrets, ignored/state paths and symlinks cannot become planned artifacts',async t=>{
 const {root,task}=await fixture(t);
 for(const file of ['.env','credentials.json','.project-map/private.json','../outside.json','.agents/config.json']){
  await assert.rejects(()=>w.proposeTask(root,task.id,{summary:'invalid',writeFiles:[file],effects:[effect(file)],newNodes:[{id:file,label:'x',kind:'data'}]}));
 }
 if(process.platform!=='win32'){await fs.symlink(path.join(root,'content.json'),path.join(root,'alias.json'));await assert.rejects(()=>w.proposeTask(root,task.id,{summary:'invalid',writeFiles:['alias.json'],effects:[effect('alias.json')],newNodes:[{id:'alias.json',label:'x',kind:'data'}]}));}
});
test('assetBindings only connect explicit planned artifacts to real implementation nodes',async t=>{
 const {root,task}=await fixture(t);
 await assert.rejects(()=>w.proposeTask(root,task.id,{summary:'invalid binding',writeFiles:['content.json'],effects:[effect('content.json')],assetBindings:{'content.json':'missing'}}));
});
test('R6: feature projection preserves planned, modified, deleted and unexpected flags',()=>{
 const source={nodes:[{id:HOME,label:'홈',kind:'screen',files:[HOME],planned:true},{id:'shared.ts',label:'공통',kind:'module',files:['shared.ts'],changeStatus:'modified',outOfScope:true,verificationStatus:'not_run'}],edges:[{id:'use',source:HOME,target:'shared.ts',kind:'imports'}]};
 const feature=buildFeatureMap(source).nodes[0];assert.equal(feature.planned,true);assert.equal(feature.changeStatus,'modified');assert.equal(feature.outOfScope,true);assert.equal(feature.verificationStatus,'not_run');
 source.nodes[0].changeStatus='deleted';assert.equal(buildFeatureMap(source).nodes[0].removed,true);
});
test('all three graph snapshots survive completion, including planned-but-unchanged files',async t=>{
 const {root,task}=await fixture(t);await run(root,task,{summary:'제목 수정',writeFiles:[HOME],effects:[effect(HOME)]});
 const done=await w.completeTask(root,task.id);
 assert.ok(done.experience.beforeGraph);assert.ok(done.experience.expectedGraph);assert.ok(done.experience.actualGraph);
 assert.equal(done.experience.comparison.planned[0].actual,'unchanged');assert.equal(done.experience.comparison.planned[0].matches,false);
 assert.equal(done.experience.expectedGraph.nodes[0].planned,true);assert.ok(!done.experience.actualGraph.nodes[0].changeStatus);
});
