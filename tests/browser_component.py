# Optional dev check: pip install playwright; use an installed Chromium.
# Offline UI component test. Real HTTP API is tested by the Node suite.
import subprocess,json,tempfile,shutil,pathlib
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]; fixture=pathlib.Path(tempfile.mkdtemp(prefix='pm-ui-offline-'))
shutil.copytree(root/'examples/sample-app',fixture,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.project-map'))
js="""import * as w from './skills/project-map/scripts/lib/workspace.mjs';
const root=process.argv[1], map=await w.scanProject(root), input={featureIds:['feature:src/app/reports/page.tsx'],intent:'behavior',request:'리포트'};
const impact=w.analyzeImpact(map,input);const task=await w.createTask(root,{...input,request:'리포트 요약을 누르면 작업 목록으로 이동하게 해줘.',snapshotId:map.snapshotId});
console.log(JSON.stringify({map,impact,task}));"""
data=json.loads(subprocess.check_output(['node','--input-type=module','-e',js,str(fixture)],cwd=root,text=True))
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  html=(root/'skills/project-map/assets/workbench.html').read_text().replace('<script defer src="/workbench.js"></script>','').replace('<link rel="stylesheet" href="/workbench.css">','')
  page.set_content(html)
  page.add_style_tag(content=(root/'skills/project-map/assets/workbench.css').read_text())
  page.evaluate('''data=>{window.__saved=false;window.fetch=async(url,options={})=>{let value;
    if(url==='/api/session')value={token:'offline-component-test'};
    else if(url==='/api/map'||url==='/api/refresh')value=data.map;
    else if(url==='/api/impact')value=data.impact;
    else if(url==='/api/tasks'&&options.method==='POST'){window.__saved=true;value=data.task;}
    else if(url==='/api/tasks')value={tasks:window.__saved?[data.task]:[]};
    else if(url.startsWith('/api/tasks/'))value=data.task;
    else throw new Error('Unexpected offline URL '+url);
    return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});};}''',data)
  page.add_script_tag(content=(root/'skills/project-map/assets/workbench.js').read_text())
  page.locator('.node').first.wait_for()
  page.locator('#features button').filter(has_text='리포트').click()
  page.locator('#request').fill('리포트 요약을 누르면 작업 목록으로 이동하게 해줘.')
  page.locator('#preview').click();page.locator('#save').click();page.locator('#task-section').wait_for(state='visible')
  assert page.locator('#task-status').inner_text()=='Codex에 계획 요청 필요'
  page.screenshot(path=str(fixture/'desktop.png'),full_page=True)
  page.set_viewport_size({'width':390,'height':844})
  dims=page.evaluate('({w:innerWidth,scroll:document.documentElement.scrollWidth})');print(dims)
  page.screenshot(path=str(fixture/'mobile.png'),full_page=True)
  assert dims['scroll']<=dims['w'], 'Mobile overflow'
  assert not errors, errors
  browser.close()
 print('PASS: offline Chromium component rendering + interactions, 1440px and 390px; real API tested separately in Node.')
finally:shutil.rmtree(fixture,ignore_errors=True)
