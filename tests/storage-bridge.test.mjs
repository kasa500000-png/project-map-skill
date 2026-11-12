import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import * as w from '../skills/project-map/scripts/lib/core.mjs';
import { migrateState, getStateDir, requireProtectedState } from '../skills/project-map/scripts/lib/storage.mjs';
import { checkProtocolSchemas } from '../skills/project-map/scripts/lib/bridge-preflight.mjs';
import { CodexBridge } from '../skills/project-map/scripts/lib/codex-bridge.mjs';
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pm-storage-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,'app/page.tsx'),'export default function Home(){return null;}');return root;}
async function legacy(root){const options={stateDir:'.project-map'},map=await w.scanProject(root,options);return w.createTask(root,{nodeIds:['app/page.tsx'],request:'legacy',snapshotId:map.snapshotId},options);}
test('default controller state is under .agents, with direct unprotected state refused',async t=>{
 const root=await fixture(t);await w.scanProject(root);assert.equal(getStateDir(root),path.join(root,'.agents/project-map-state'));
 assert.equal(await requireProtectedState(root),getStateDir(root));await assert.rejects(()=>requireProtectedState(root,{stateDir:'.project-map'}),e=>e.code==='UNPROTECTED_STATE');
});
test('legacy state migration is explicit, lossless and does not execute queued work',async t=>{
 const root=await fixture(t),task=await legacy(root);
 await assert.rejects(()=>w.scanProject(root),e=>e.code==='STATE_MIGRATION_REQUIRED');
 const result=await migrateState(root);assert.equal(result.sourceRetained,true);assert.equal((await w.getTask(root,task.id)).status,'queued');
 assert.ok(await fs.stat(path.join(root,'.project-map/tasks',task.id+'.json')));await assert.rejects(()=>migrateState(root),/이미/);
});
test('migration removes prior approval and requires user review again',async t=>{
 const root=await fixture(t),task=await legacy(root),opts={stateDir:'.project-map'};
 const planned=await w.proposeTask(root,task.id,{summary:'title',writeFiles:['app/page.tsx'],effects:[{nodeId:'app/page.tsx',change:'title',expected:'title',verify:'preview'}]},opts);
 await w.reviewTask(root,task.id,{decision:'approve',revision:planned.plan.revision,snapshotId:planned.plan.snapshotId},opts);await migrateState(root);
 const migrated=await w.getTask(root,task.id);assert.equal(migrated.status,'awaiting_review');assert.equal(migrated.approval,null);
});
test('migration refuses an active task and leaves the old state intact',async t=>{
 const root=await fixture(t),task=await legacy(root),opts={stateDir:'.project-map'};
 const planned=await w.proposeTask(root,task.id,{summary:'title',writeFiles:['app/page.tsx'],effects:[{nodeId:'app/page.tsx',change:'title',expected:'title',verify:'preview'}]},opts);
 await w.reviewTask(root,task.id,{decision:'approve',revision:planned.plan.revision,snapshotId:planned.plan.snapshotId},opts);await w.updateTask(root,task.id,{status:'running'},opts);
 await assert.rejects(()=>migrateState(root),e=>e.code==='ACTIVE_MIGRATION');assert.equal((await w.getTask(root,task.id,opts)).status,'running');
});
test('migration never follows a legacy symlink', {skip:process.platform==='win32'},async t=>{
 const root=await fixture(t);await legacy(root);await fs.symlink(path.join(root,'app/page.tsx'),path.join(root,'.project-map/linked'));
 await assert.rejects(()=>migrateState(root),e=>e.code==='UNSAFE_STATE_PATH');await assert.rejects(fs.stat(getStateDir(root)),{code:'ENOENT'});
});
function schemas(){const any={};return {turn:{properties:{threadId:any,input:any,sandboxPolicy:any,outputSchema:any,approvalPolicy:{enum:['never']}},definitions:{policies:{oneOf:[{properties:{type:{enum:['readOnly']},access:any}},{properties:{type:{enum:['workspaceWrite']},readOnlyAccess:any,writableRoots:any,networkAccess:any,excludeSlashTmp:any,excludeTmpdirEnvVar:any}}]}}},start:{properties:{sandbox:any}},resume:{properties:{threadId:any}}};}
test('installed protocol must support output schema, resume, restricted reads and writable exclusions',()=>{
 assert.equal(checkProtocolSchemas(schemas()),true);
 const missing=schemas();delete missing.turn.properties.outputSchema;assert.throws(()=>checkProtocolSchemas(missing),e=>e.code==='CODEX_INCOMPATIBLE');
 const unsafe=schemas();delete unsafe.turn.definitions.policies.oneOf[1].properties.excludeSlashTmp;assert.throws(()=>checkProtocolSchemas(unsafe),e=>e.code==='CODEX_INCOMPATIBLE');
});
test('failed compatibility checks do not launch Codex or edit task state',async()=>{
 let spawned=false,blocked=false;const bridge=new CodexBridge({root:'/tmp',spawnProcess:()=>{spawned=true;},preflight:async()=>{throw Object.assign(new Error('unsupported'),{code:'CODEX_INCOMPATIBLE'});},handlers:{get:async()=>({id:'x',status:'approved'}),block:async()=>{blocked=true;}}});
 await assert.rejects(()=>bridge.run('x','execute'));assert.equal(spawned,false);assert.equal(blocked,false);assert.equal(bridge.diagnostics.errorCode,'CODEX_INCOMPATIBLE');
});
const mock=`import readline from 'node:readline';import fs from 'node:fs';
readline.createInterface({input:process.stdin}).on('line',s=>{const m=JSON.parse(s);fs.appendFileSync(process.env.WIRE,s+'\\n');const reply=result=>process.stdout.write(JSON.stringify({id:m.id,result})+'\\n');
if(m.method==='initialize')reply({});else if(m.method==='account/read')reply({requiresOpenaiAuth:true,account:process.env.NEED_AUTH?'':{type:'chatgpt'}});
else if(m.method==='thread/resume'||m.method==='thread/start')reply({thread:{id:m.params.threadId||'saved-thread'}});
else if(m.method==='turn/start')reply({turn:{id:'current-turn'}});else if(m.method==='turn/interrupt')reply({});});`;
async function connectionFixture(t,{auth=false}={}){
 const root=await fixture(t),file=path.join(root,'mock.mjs'),wire=path.join(root,'wire');await fs.writeFile(file,mock);
 const bridge=new CodexBridge({root,preflight:async()=>({version:'synthetic',compatible:true}),spawnProcess:()=>spawn(process.execPath,[file],{stdio:['pipe','pipe','pipe'],env:{...process.env,WIRE:wire,...(auth?{NEED_AUTH:'1'}:{})}}),handlers:{get:async()=>({id:'x',status:'queued',request:'plan'}),fingerprint:async()=>'same',loadThread:async()=>'saved-thread',saveThread:async()=>{}}});
 t.after(()=>bridge.close());return {bridge,wire};
}
test('login-required diagnostic reveals no account data and does not start a thread',async t=>{
 const {bridge,wire}=await connectionFixture(t,{auth:true});await assert.rejects(()=>bridge.run('x','plan'),e=>e.code==='CODEX_AUTH_REQUIRED');
 assert.equal(bridge.diagnostics.auth,'required');assert.doesNotMatch(await fs.readFile(wire,'utf8'),/thread\/start|turn\/start/);
});
test('saved conversations use thread/resume with explicit sandbox settings on reconnect',async t=>{
 const {bridge,wire}=await connectionFixture(t);await bridge.run('x','plan');
 const messages=(await fs.readFile(wire,'utf8')).trim().split('\n').map(JSON.parse),resume=messages.find(m=>m.method==='thread/resume');
 assert.equal(resume.params.threadId,'saved-thread');assert.equal(resume.params.sandbox,'readOnly');assert.equal(resume.params.approvalPolicy,'never');
 const turn=messages.find(m=>m.method==='turn/start');assert.equal(turn.params.sandboxPolicy.type,'readOnly');assert.equal(turn.params.approvalPolicy,'never');assert.ok(!messages.some(m=>m.method==='thread/start'));
});

test('uncertain process termination holds the execution lease until explicit stop acknowledgment',async t=>{
 const { markExecutionUncertain,executionStatus }=await import('../skills/project-map/scripts/lib/task-lock.mjs');
 const root=await fixture(t),map=await w.scanProject(root),task=await w.createTask(root,{nodeIds:['app/page.tsx'],request:'change',snapshotId:map.snapshotId});
 const planned=await w.proposeTask(root,task.id,{summary:'change',writeFiles:['app/page.tsx'],effects:[{nodeId:'app/page.tsx',change:'change',expected:'visible',verify:'check'}]});
 await w.reviewTask(root,task.id,{decision:'approve',revision:planned.plan.revision,snapshotId:planned.plan.snapshotId});await w.updateTask(root,task.id,{status:'running'});
 await markExecutionUncertain(root,task.id);
 await assert.rejects(()=>w.proposeTask(root,task.id,{summary:'new',writeFiles:[],effects:[]}),e=>e.code==='EXECUTION_CONFIRM_REQUIRED');
 await assert.rejects(()=>w.completeTask(root,task.id,{}),e=>e.code==='EXECUTION_CONFIRM_REQUIRED');
 assert.equal((await executionStatus(root)).uncertain,true);
 await w.workspaceRoute(root,`/api/tasks/${task.id}/pause`,{executionStopped:true});assert.equal(await executionStatus(root),null);
});
