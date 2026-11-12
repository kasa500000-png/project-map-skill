import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as w from '../skills/project-map/scripts/lib/core.mjs';
import { inventory, compareInventory } from '../skills/project-map/scripts/lib/inventory.mjs';
import { writeImpact, evidenceResponse } from '../skills/project-map/scripts/lib/assurance.mjs';
import { statePath } from '../skills/project-map/scripts/lib/state-store.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nS8AAAAASUVORK5CYII=','base64');
async function fixture(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pm-assurance-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const [p,s] of Object.entries({'app/page.tsx':"import {Card} from '../components/Card'; export default function Home(){return <Card/>;}",'app/reports/page.tsx':"import {Card} from '../../components/Card'; export default function Reports(){return <Card/>;}",'components/Card.tsx':'export function Card(){return null;}','data/content.json':'{"text":"before"}','icon.png':png})) {await fs.mkdir(path.dirname(path.join(root,p)),{recursive:true});await fs.writeFile(path.join(root,p),s);}
 const map=await w.scanProject(root),task=await w.createTask(root,{nodeIds:['app/reports/page.tsx'],intent:'behavior',request:'공통 카드 개선',snapshotId:map.snapshotId});
 const planned=await w.proposeTask(root,task.id,{summary:'공통 카드 표시 변경',writeFiles:['components/Card.tsx'],effects:[{nodeId:'components/Card.tsx',change:'표시 정리',expected:'카드를 읽을 수 있음',verify:'두 화면을 직접 확인'}]});return {root,task:planned};
}
async function start(root,task){await w.reviewTask(root,task.id,{decision:'approve',revision:task.plan.revision,snapshotId:task.plan.snapshotId,source:'conversation'});return w.updateTask(root,task.id,{status:'running'});}
test('actual write impact includes all consumers of a shared implementation',async t=>{
 const {root,task}=await fixture(t);const impact=task.experience.assurance.impact;
 assert.deepEqual(impact.writeFiles,['components/Card.tsx']);assert.ok(impact.verifyFiles.includes('app/page.tsx'));assert.ok(impact.verifyFiles.includes('app/reports/page.tsx'));
 assert.equal(impact.features.length,2);assert.ok(impact.features.every(f=>f.reason.includes('공통')));
 const empty=writeImpact(await w.getMap(root),{writeFiles:[]});assert.deepEqual(empty.features,[]);
});
test('asset and content changes invalidate an approved source-only plan before execution',async t=>{
 const {root,task}=await fixture(t);await w.reviewTask(root,task.id,{decision:'approve',revision:task.plan.revision,snapshotId:task.plan.snapshotId});
 await fs.writeFile(path.join(root,'data/content.json'),'changed');await assert.rejects(()=>w.updateTask(root,task.id,{status:'running'}),e=>e.code==='STALE_SNAPSHOT');
});
test('whole-file audit finds map-excluded changes and does not attribute old dirty content',async t=>{
 const {root,task}=await fixture(t);await start(root,task);await fs.writeFile(path.join(root,'icon.png'),Buffer.concat([png,Buffer.from('changed')]));
 await fs.writeFile(path.join(root,'new.yml'),'new: true');await fs.writeFile(path.join(root,'.env'),'API_KEY=DO_NOT_PUBLISH');
 const done=await w.completeTask(root,task.id,{});const audit=done.experience.assurance.audit;
 assert.ok(audit.changes.some(c=>c.path==='icon.png'&&c.outsideMap&&c.outOfScope));assert.ok(audit.changes.some(c=>c.path==='new.yml'));assert.ok(audit.changes.some(c=>c.path==='.env'&&c.sensitive));
 assert.ok(!audit.changes.some(c=>c.path==='data/content.json'));assert.ok(!JSON.stringify(audit).includes('DO_NOT_PUBLISH'));
});
test('unknown and oversized files produce incomplete audit instead of claiming full coverage',async t=>{
 const {root}=await fixture(t);const before=await inventory(root);await fs.writeFile(path.join(root,'huge.bin'),Buffer.alloc(20*1024*1024+1));const after=await inventory(root);
 assert.equal(after.complete,false);assert.ok(after.skipped.includes('huge.bin'));assert.equal(compareInventory(before,after).complete,false);
});
test('real check receipts capture success and failure, and are invalidated by later edits',async t=>{
 const {root,task}=await fixture(t);const running=await start(root,task);
 const pass=await w.recordEvidence(root,running,{kind:'check',name:'실제 검사',nodeId:'components/Card.tsx',argv:[process.execPath,'-e','console.log("ok")']});assert.equal(pass.exitCode,0);assert.equal(pass.status,'passed');
 const fail=await w.recordEvidence(root,running,{kind:'check',name:'실패 검사',argv:[process.execPath,'-e','process.exit(2)']});assert.equal(fail.exitCode,2);assert.equal(fail.status,'failed');
 assert.ok((await w.getTask(root,task.id)).experience.assurance.evidence.every(e=>e.current));
 await fs.appendFile(path.join(root,'components/Card.tsx'),'// next edit');assert.ok((await w.getTask(root,task.id)).experience.assurance.evidence.every(e=>!e.current));
});
test('a command that changes source is not stable verification evidence',async t=>{
 const {root,task}=await fixture(t),running=await start(root,task);
 const receipt=await w.recordEvidence(root,running,{kind:'check',name:'writes file',argv:[process.execPath,'-e',"require('fs').writeFileSync('data/content.json','changed')"]});assert.equal(receipt.stable,false);
});
test('images are registered artifacts, not arbitrary project file reads or executable markup',async t=>{
 const {root,task}=await fixture(t);
 const image=await w.recordEvidence(root,task,{kind:'image',name:'변경 전',file:'icon.png',stage:'before'});assert.equal(image.status,'attached');
 const response=await evidenceResponse(root,image.url,{});assert.equal(response.type,'image/png');assert.ok(response.value.equals(png));
 await assert.rejects(()=>w.recordEvidence(root,task,{kind:'image',name:'x',stage:'before',file:'../outside.png'}));
 await fs.writeFile(path.join(root,'bad.svg'),'<script>alert(1)</script>');await assert.rejects(()=>w.recordEvidence(root,task,{kind:'image',name:'x',stage:'before',file:'bad.svg'}));
 assert.equal(await evidenceResponse(root,'/api/evidence/../../etc/passwd',{}),null);
});
test('state symlinks and image symlinks are rejected', {skip:process.platform==='win32'},async t=>{
 const {root,task}=await fixture(t);await fs.symlink(path.join(root,'icon.png'),path.join(root,'alias.png'));
 await assert.rejects(()=>w.recordEvidence(root,task,{kind:'image',name:'x',stage:'before',file:'alias.png'}));
 const external=await fs.mkdtemp(path.join(os.tmpdir(),'pm-outside-'));t.after(()=>fs.rm(external,{recursive:true,force:true}));
 await fs.symlink(external,path.join(root,'.agents/project-map-state','unsafe'));await assert.rejects(()=>statePath(root,'unsafe/out.json'));assert.deepEqual(await fs.readdir(external),[]);
});
test('secret-like output is redacted and generic checks are not screenshot evidence',async t=>{
 const {root,task}=await fixture(t),running=await start(root,task);const record=await w.recordEvidence(root,running,{kind:'check',name:'redaction',argv:[process.execPath,'-e','console.log("token=private_value")']});
 assert.ok(!record.output.includes('private_value'));assert.equal(record.kind,'check');
});
