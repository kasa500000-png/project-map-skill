import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';
import {CodexBridge} from '../skills/project-map/scripts/lib/codex-bridge.mjs';
const mock=`import readline from 'node:readline';import fs from 'node:fs';
const mode=process.env.PM_TEST_MODE;let turn,thread='test-thread',phase;
function send(x){process.stdout.write(JSON.stringify(x)+'\\n');}
function finish(status='completed'){
 const result=phase==='plan'?{summary:'Read-only plan',writeFiles:['app/page.tsx'],effects:[{nodeId:'app/page.tsx',change:'Title',expected:'Visible title',verify:'Inspect'}],newNodes:[],removeNodeIds:[],flowChanges:[]}:{summary:'Finished',checks:[{name:'App behavior',status:'not_run',detail:'Not checked',nodeId:''}]};
 send({method:'item/completed',params:{threadId:thread,turnId:turn,item:{type:'agentMessage',phase:'final_answer',text:JSON.stringify(result)}}});send({method:'turn/completed',params:{threadId:thread,turn:{id:turn,status}}});}
readline.createInterface({input:process.stdin}).on('line',line=>{const x=JSON.parse(line);fs.appendFileSync(process.env.PM_TEST_LOG,JSON.stringify(x)+'\\n');
 if(x.method==='initialize')send({id:x.id,result:{userAgent:'test'}});
 else if(x.method==='thread/start')send({id:x.id,result:{thread:{id:thread}}});
 else if(x.method==='turn/start'){turn='turn-'+x.id;phase=x.params.sandboxPolicy.type==='readOnly'?'plan':'execute';send({id:x.id,result:{turn:{id:turn}}});
 setTimeout(()=>{if(mode==='hang')return;if(mode==='disconnect')process.exit(0);
 if(mode==='approval'||mode==='readonly-approval'){send({id:900,method:'item/commandExecution/requestApproval',params:{threadId:thread,turnId:turn,command:'echo test',availableDecisions:['accept','decline']}});return;}
 if(mode==='permission'){send({id:901,method:'item/permissions/requestApproval',params:{threadId:thread,turnId:turn,permissions:{network:{enabled:true}}}});return;}
 if(mode==='unsupported'){send({id:902,method:'item/unknown/request',params:{threadId:thread,turnId:turn}});return;}finish();},10);}
 else if(x.method==='turn/interrupt'){send({id:x.id,result:{}});finish('interrupted');}
 else if(x.id===900){finish(x.result.decision==='accept'?'completed':'interrupted');}
 else if(x.id===901||x.id===902)finish('interrupted');
});`;
async function until(fn){for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw new Error('Bridge test timeout');}
async function fixture(t,mode='success',status='queued'){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pm-bridge-')));const file=path.join(root,'mock.mjs'),log=path.join(root,'wire.jsonl');await fs.writeFile(file,mock);
 const events=[],task={id:'task-00000000-0000-4000-8000-000000000001',status,request:'Change title',nodeIds:['app/page.tsx'],impact:{writeFiles:['app/page.tsx']},...(status==='approved'?{plan:{summary:'approved',writeFiles:['app/page.tsx'],effects:[]}}:{})};let fingerprint='same';
 const bridge=new CodexBridge({root,spawnProcess:()=>spawn(process.execPath,[file],{cwd:root,stdio:['pipe','pipe','pipe'],env:{...process.env,PM_TEST_MODE:mode,PM_TEST_LOG:log}}),handlers:{get:async()=>task,fingerprint:async()=>fingerprint,plan:async(id,p)=>{events.push(['plan',p]);task.status='awaiting_review';},start:async()=>{events.push(['start']);task.status='running';},complete:async(id,p)=>{events.push(['complete',p]);task.status='completed';},block:async()=>{events.push(['blocked']);task.status='blocked';}}});
 t.after(async()=>{await bridge.close();await fs.rm(root,{recursive:true,force:true});});return {bridge,events,task,log,setFingerprint:value=>{fingerprint=value;}};
}
test('stdio handshake publishes a structured plan under read-only policy without self approval',async t=>{
 const {bridge,events,task,log}=await fixture(t);await bridge.run(task.id,'plan');await until(()=>!bridge.active);assert.equal(task.status,'awaiting_review');assert.equal(events[0][0],'plan');assert.equal(events.some(e=>e[0]==='start'),false);
 const messages=(await fs.readFile(log,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(messages[0].method,'initialize');assert.equal(messages[1].method,'initialized');const turn=messages.find(m=>m.method==='turn/start');assert.equal(turn.params.sandboxPolicy.type,'readOnly');assert.ok(turn.params.outputSchema);assert.ok(turn.params.input.some(i=>i.type==='skill'));
});
test('execution without a reviewed approval never starts a process',async t=>{
 const {bridge,task}=await fixture(t);await assert.rejects(()=>bridge.run(task.id,'execute'),e=>e.code==='REVIEW_REQUIRED');assert.equal(bridge.child,null);
});
test('explicit approved execution preserves sandbox and returns unverified checks honestly',async t=>{
 const {bridge,task,events,log}=await fixture(t,'success','approved');await bridge.run(task.id,'execute');await until(()=>!bridge.active);assert.equal(task.status,'completed');assert.equal(events[0][0],'start');assert.equal(events[1][1].checks[0].status,'not_run');
 const turn=(await fs.readFile(log,'utf8')).trim().split('\n').map(JSON.parse).find(x=>x.method==='turn/start');assert.equal(turn.params.sandboxPolicy.type,'workspaceWrite');assert.equal(turn.params.sandboxPolicy.networkAccess,false);
});
test('permission prompts require explicit one-shot approval and unsupported policies are refused',async t=>{
 const {bridge,task,events,log}=await fixture(t,'approval','approved');await bridge.run(task.id,'execute');await until(()=>bridge.approvals.size);assert.equal(events.some(e=>e[0]==='complete'),false);
 await assert.rejects(()=>bridge.decide('900','acceptForSession'));await bridge.decide('900','accept');await until(()=>!bridge.active);assert.equal(task.status,'completed');
 assert.ok((await fs.readFile(log,'utf8')).includes('"decision":"accept"'));
});
test('planning cannot escalate and permission-expansion requests receive no grants',async t=>{
 const first=await fixture(t,'readonly-approval');await first.bridge.run(first.task.id,'plan');await until(()=>!first.bridge.active);assert.ok((await fs.readFile(first.log,'utf8')).includes('"decision":"decline"'));
 const second=await fixture(t,'permission','approved');await second.bridge.run(second.task.id,'execute');await until(()=>!second.bridge.active);assert.ok((await fs.readFile(second.log,'utf8')).includes('"permissions":{}'));assert.equal(second.task.status,'blocked');
});
test('unsupported server requests fail closed',async t=>{
 const {bridge,task,log}=await fixture(t,'unsupported','approved');await bridge.run(task.id,'execute');await until(()=>!bridge.active);assert.ok((await fs.readFile(log,'utf8')).includes('"code":-32601'));assert.equal(task.status,'blocked');
});
test('interrupt requests wait for interrupted result and preserve blocked work',async t=>{
 const {bridge,task}=await fixture(t,'hang','approved');await bridge.run(task.id,'execute');await assert.rejects(()=>bridge.run(task.id,'execute'),e=>e.code==='BRIDGE_BUSY');await bridge.interrupt();await until(()=>!bridge.active);assert.equal(task.status,'blocked');
});
test('a dropped connection does not claim completion',async t=>{
 const {bridge,task}=await fixture(t,'disconnect','approved');await bridge.run(task.id,'execute');await until(()=>!bridge.active);assert.equal(task.status,'blocked');assert.equal(bridge.connected,false);
});
test('changing source while planning rejects the stale model plan',async t=>{
 const {bridge,task,setFingerprint,events}=await fixture(t,'hang');await bridge.run(task.id,'plan');setFingerprint('changed');
 await bridge.message({method:'item/completed',params:{threadId:bridge.active.threadId,turnId:bridge.active.turnId,item:{type:'agentMessage',text:'{"summary":"stale"}'}}});
 await bridge.message({method:'turn/completed',params:{threadId:bridge.active.threadId,turn:{id:bridge.active.turnId,status:'completed'}}});
 assert.equal(events.some(e=>e[0]==='plan'),false);assert.equal(bridge.last.status,'failed');
});
test('file approval cannot expand a grant outside the project through traversal',async t=>{
 const {bridge,task}=await fixture(t,'hang','approved');await bridge.run(task.id,'execute');
 await bridge.message({id:77,method:'item/fileChange/requestApproval',params:{threadId:bridge.active.threadId,turnId:bridge.active.turnId,grantRoot:path.join(bridge.root,'..','outside')}});
 await assert.rejects(()=>bridge.decide('77','accept'),/프로젝트 밖/);await bridge.decide('77','decline');
});
