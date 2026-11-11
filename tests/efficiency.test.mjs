import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {refreshMap,compareScopes} from '../skills/project-map/scripts/lib/efficiency.mjs';
import {startServer} from '../skills/project-map/scripts/lib/server.mjs';
async function fixture(t){const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'pm-cache-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));await fs.mkdir(path.join(root,'app'));await fs.writeFile(path.join(root,'app/page.tsx'),'export default function Home(){return null;}');return root;}
test('unchanged content reuses validated map, changed content rebuilds relationships',async t=>{
 const root=await fixture(t),first=await refreshMap(root),cached=await refreshMap(root);assert.equal(first.refresh.mode,'rebuilt');assert.equal(cached.refresh.mode,'reused');assert.equal(first.snapshotId,cached.snapshotId);
 await fs.writeFile(path.join(root,'app/page.tsx'),'export default function Edit(){return null;}');const changed=await refreshMap(root);assert.equal(changed.refresh.mode,'rebuilt');assert.ok(changed.refresh.changedFiles.includes('app/page.tsx'));assert.notEqual(changed.snapshotId,first.snapshotId);
});
test('file additions, deletions, config and Git head changes invalidate map reuse',async t=>{
 const root=await fixture(t);execFileSync('git',['-C',root,'init','-q']);await fs.writeFile(path.join(root,'.gitignore'),'.project-map/\n');await refreshMap(root);
 await fs.writeFile(path.join(root,'app/second.tsx'),'export const x=1;');assert.equal((await refreshMap(root)).refresh.mode,'rebuilt');await fs.unlink(path.join(root,'app/second.tsx'));assert.equal((await refreshMap(root)).refresh.mode,'rebuilt');
 execFileSync('git',['-C',root,'add','.']);execFileSync('git',['-C',root,'-c','user.name=Test','-c','user.email=test@example.invalid','commit','-qm','initial']);assert.equal((await refreshMap(root)).refresh.mode,'rebuilt');
 await fs.writeFile(path.join(root,'project-map.config.json'),'{"name":"Renamed"}');assert.equal((await refreshMap(root)).project.name,'Renamed');
});
test('incomplete inventories never claim reusable complete analysis',async t=>{
 const root=await fixture(t);await fs.writeFile(path.join(root,'big.bin'),Buffer.alloc(20*1024*1024+1));await refreshMap(root);assert.equal((await refreshMap(root)).refresh.mode,'rebuilt');
});
const map={snapshotId:'current',coverage:{},files:[]};
const task=(write,read=[],extra={})=>({plan:{writeFiles:write,snapshotId:'current'},impact:{readFiles:read},...extra});
test('planned writes detect write/write and write/read conflicts but read/read stays conditional',()=>{
 assert.equal(compareScopes(task(['a']),task(['a']),map).status,'conflict');assert.equal(compareScopes(task(['a']),task(['b'],['a']),map).status,'conflict');
 const result=compareScopes(task(['a'],['shared']),task(['b'],['shared']),map);assert.equal(result.status,'conditional');assert.deepEqual(result.sharedReads,['shared']);
});
test('missing or stale plans and common configuration are not labelled independent',()=>{
 assert.equal(compareScopes({},task(['a']),map).status,'unknown');assert.equal(compareScopes(task(['a'],[],{plan:{writeFiles:['a'],snapshotId:'old'}}),task(['b']),map).status,'unknown');
 assert.equal(compareScopes(task(['config.ts']),task(['b']),map).status,'coordinate');
});
test('shared data resources request coordination across different files',()=>{
 const data={...map,files:[{path:'a',resources:[{type:'table',key:'orders'}]},{path:'b',resources:[{type:'table',key:'orders'}]}]};assert.equal(compareScopes(task(['a']),task(['b']),data).status,'coordinate');
});
test('Codex HTTP bridge is off by default and no arbitrary command endpoint exists',async t=>{
 const root=await fixture(t),server=await startServer({projectRoot:root});t.after(()=>server.close());const session=await (await fetch(server.url+'/api/session')).json();const status=await(await fetch(server.url+'/api/connection')).json();assert.equal(status.enabled,false);
 const response=await fetch(server.url+'/api/codex/run',{method:'POST',headers:{'Content-Type':'application/json','X-Project-Map-Token':session.token},body:JSON.stringify({id:'anything',phase:'execute'})});assert.equal(response.status,403);
});
