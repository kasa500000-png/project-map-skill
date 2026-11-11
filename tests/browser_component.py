"""Optional offline browser component test. HTTP APIs have separate Node tests.
Install Playwright and a Chromium browser; CHROMIUM_PATH may select the binary.
This does not contact Codex, render a user's app, or bypass localhost restrictions.
"""
import json, os, pathlib, re, shutil, subprocess, tempfile
from playwright.sync_api import sync_playwright, expect
root = pathlib.Path(__file__).resolve().parents[1]
fixture = pathlib.Path(tempfile.mkdtemp(prefix='pm-ui-offline-'))
shutil.copytree(root/'examples/sample-app', fixture, dirs_exist_ok=True, ignore=shutil.ignore_patterns('.project-map'))
js = """import * as w from './skills/project-map/scripts/lib/workspace.mjs';
import fs from 'node:fs/promises';import path from 'node:path';
const root=process.argv[1],map=await w.scanProject(root),input={featureIds:['feature:src/app/reports/page.tsx'],intent:'behavior',request:'리포트 요약을 쉽게 읽도록 정리해줘.'};
const impact=w.analyzeImpact(map,input),queued=await w.createTask(root,{...input,snapshotId:map.snapshotId});
const planned=await w.proposeTask(root,queued.id,{summary:'리포트의 표시를 정리하고 홈의 공통 기능을 함께 확인합니다.',writeFiles:['src/app/reports/page.tsx'],effects:[{nodeId:'src/app/reports/page.tsx',change:'요약 표시 정리',expected:'핵심 정보부터 읽기',verify:'실제 앱 화면 확인'}]});
await w.reviewTask(root,queued.id,{decision:'approve',revision:planned.plan.revision,snapshotId:planned.plan.snapshotId});const running=await w.updateTask(root,queued.id,{status:'running'});
await fs.appendFile(path.join(root,'src/app/reports/page.tsx'),'\\n// synthetic test change');
await w.recordEvidence(root,running,{kind:'check',name:'테스트용 Node 실행 확인',argv:[process.execPath,'-e','console.log("synthetic command receipt")']});
const done=await w.completeTask(root,queued.id,{summary:'가상 테스트 파일 변경',checks:[{name:'실제 앱 화면',nodeId:'src/app/reports/page.tsx',status:'not_run',detail:'이 테스트는 실제 앱을 실행하지 않습니다.'}]});
console.log(JSON.stringify({map,impact,queued,planned,done}));"""
data = json.loads(subprocess.check_output(['node','--input-type=module','-e',js,str(fixture)], cwd=root, text=True))
try:
    with sync_playwright() as p:
        executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
        browser = p.chromium.launch(headless=True, **({'executable_path':executable} if executable else {}))
        page = browser.new_page(viewport={'width':1440,'height':1000})
        errors=[]; page.on('pageerror',lambda error:errors.append(str(error)))
        html=(root/'skills/project-map/assets/workbench.html').read_text()
        html=re.sub(r'<script[^>]*>.*?</script>','',html)
        html=html.replace('<link rel="stylesheet" href="/workbench.css">','')
        page.set_content(html)
        page.add_style_tag(content=(root/'skills/project-map/assets/workbench.css').read_text())
        page.evaluate('''data=>{window.__saved=false;window.__phase='queued';window.fetch=async(url,options={})=>{
          let value;const task=window.__phase==='approved'?{...data.planned,status:'approved'}:data[window.__phase];
          if(url==='/api/session')value={token:'offline-test'};
          else if(url==='/api/connection')value={enabled:false,connected:false,active:null,approvals:[]};
          else if(url==='/api/map'||url==='/api/refresh')value=data.map;
          else if(url==='/api/impact')value=data.impact;
          else if(url==='/api/tasks'&&options.method==='POST'){window.__saved=true;value=task;}
          else if(url==='/api/tasks')value={tasks:window.__saved?[task]:[]};
          else if(url.endsWith('/review')){window.__phase='approved';value={...data.planned,status:'approved'};}
          else if(url.startsWith('/api/tasks/'))value=task;
          else throw new Error('Unexpected offline URL '+url);
          return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
        };}''',data)
        for name in ['assurance-ui.js','safety-ui.js','bridge-ui.js','workbench.js']:
            page.add_script_tag(content=(root/'skills/project-map/assets'/name).read_text())
        page.locator('.node').first.wait_for()
        page.locator('#features button').filter(has_text='리포트').click()
        page.locator('#request').fill('리포트 요약을 쉽게 읽도록 정리해줘.')
        page.locator('#preview').click();page.locator('#save').click()
        page.locator('#task-section').wait_for(state='visible')
        assert page.locator('#task-status').inner_text()=='Codex에 계획 요청 필요'
        page.evaluate("window.__phase='planned'")
        page.locator('#tasks button').first.click()
        page.get_by_role('button',name='이 계획으로 진행',exact=True).click()
        expect(page.locator('#task-status')).to_contain_text('승인됨')
        page.evaluate("window.__phase='done'");page.locator('#tasks button').first.click()
        page.get_by_text('테스트용 Node 실행 확인',exact=False).first.wait_for()
        assert page.get_by_text('되돌릴 파일 미리보기',exact=True).is_visible()
        assert page.get_by_text('다른 작업과 함께 진행할 수 있나요?',exact=True).is_visible()
        output = pathlib.Path(os.environ.get('PM_SCREENSHOT_DIR', str(fixture)))
        output.mkdir(parents=True,exist_ok=True)
        for width,height,name in [(1440,1000,'desktop'),(390,844,'mobile')]:
            page.set_viewport_size({'width':width,'height':height})
            dims=page.evaluate('({w:innerWidth,scroll:document.documentElement.scrollWidth})')
            assert dims['scroll']<=dims['w'],dims
            page.screenshot(path=str(output/f'project-map-v06-{name}.png'),full_page=True)
        assert not errors,errors
        browser.close()
    print('PASS: offline Chromium component selection, planning, review, result/evidence/safety UI at 1440 and 390px. No live Codex or target app was used.')
finally:
    shutil.rmtree(fixture,ignore_errors=True)
