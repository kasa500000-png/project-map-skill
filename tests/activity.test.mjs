import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import * as w from '../skills/project-map/scripts/lib/core.mjs';import {activity,recentTasks,storageUsage} from '../skills/project-map/scripts/lib/activity.mjs';
import {startServer} from '../skills/project-map/scripts/lib/server.mjs';
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pm-history-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,'app/page.tsx'),'export default function Page(){return null;}');const map=await w.scanProject(root);return {root,map};}
async function request(root,map,n){return w.createTask(root,{nodeIds:['app/page.tsx'],request:'task '+n,snapshotId:map.snapshotId});}
test('history pagination uses small summaries and activity versions change only with state updates',async t=>{
 const {root,map}=await fixture(t);for(let i=0;i<4;i++)await request(root,map,i);
 const first=await recentTasks(root,{limit:2});assert.equal(first.tasks.length,2);assert.equal(first.nextOffset,2);assert.equal(first.tasks[0].baseline,undefined);assert.equal(first.tasks[0].plan,undefined);
 const second=await recentTasks(root,{offset:first.nextOffset,limit:2});assert.equal(second.nextOffset,null);assert.equal(new Set([...first.tasks,...second.tasks].map(t=>t.id)).size,4);
 const a=await activity(root);assert.equal((await activity(root)).version,a.version);await request(root,map,5);assert.notEqual((await activity(root)).version,a.version);
});
test('cancel and archive retain source and backup records; archived history is recoverable',async t=>{
 const {root,map}=await fixture(t),task=await request(root,map,1),before=await fs.readFile(path.join(root,'app/page.tsx'),'utf8');
 assert.equal((await w.workspaceRoute(root,`/api/tasks/${task.id}/manage`,{action:'cancel'})).value.status,'cancelled');
 await w.workspaceRoute(root,`/api/tasks/${task.id}/manage`,{action:'archive'});assert.equal((await recentTasks(root)).tasks.length,0);assert.equal((await recentTasks(root,{includeArchived:true})).tasks.length,1);
 await w.workspaceRoute(root,`/api/tasks/${task.id}/manage`,{action:'unarchive'});assert.equal((await recentTasks(root)).tasks.length,1);assert.equal(await fs.readFile(path.join(root,'app/page.tsx'),'utf8'),before);
 await assert.rejects(()=>w.updateTask(root,task.id,{status:'running'}));
});
test('storage metrics are read-only and include backup bytes without exposing contents',async t=>{
 const {root}=await fixture(t),state=w.getStateDir(root);await fs.mkdir(path.join(state,'checkpoint-blobs'),{recursive:true});await fs.writeFile(path.join(state,'checkpoint-blobs/example'),'private source');
 const metrics=await storageUsage(root);assert.equal(metrics.checkpointBytes,14);assert.equal(metrics.automaticDeletion,false);assert.ok(!JSON.stringify(metrics).includes('private source'));assert.ok(await fs.stat(path.join(state,'checkpoint-blobs/example')));
});
test('summary HTTP routes retain origin protection and expose explicit pagination',async t=>{
 const {root,map}=await fixture(t);await request(root,map,1);const server=await startServer({projectRoot:root});t.after(()=>server.close());
 const summaries=await(await fetch(server.url+'/api/tasks?brief=1&limit=1')).json();assert.equal(summaries.tasks.length,1);assert.equal(summaries.tasks[0].impact,undefined);
 assert.equal((await fetch(server.url+'/api/activity',{headers:{Origin:'https://evil.invalid'}})).status,403);
 assert.equal((await(await fetch(server.url+'/api/storage')).json()).automaticDeletion,false);
});

test('an oversized history record is skipped without returning a stuck pagination cursor',async t=>{
 const {root}=await fixture(t);await w.scanProject(root);
 const dir=path.join(root,'.agents/project-map-state/tasks');
 await fs.writeFile(path.join(dir,'task-00000000-0000-4000-8000-000000000001.json'),Buffer.alloc(33*1024*1024,32));
 const result=await recentTasks(root);assert.equal(result.nextOffset,null);assert.deepEqual(result.tasks,[]);
});
