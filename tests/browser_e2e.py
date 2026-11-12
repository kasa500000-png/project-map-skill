"""Live localhost browser test of the workbench + real Node API.
Synthetic source-only app; does not invoke Codex or run the target app itself.
Requires Python Playwright and Chromium. PM_SCREENSHOT_DIR keeps visual evidence.
"""
import json, os, pathlib, shutil, subprocess, tempfile
from playwright.sync_api import sync_playwright, expect
ROOT = pathlib.Path(__file__).resolve().parents[1]
CLI = ROOT / 'skills/project-map/scripts/project-map.mjs'
with tempfile.TemporaryDirectory(prefix='pm-live-browser-') as temporary:
    project = pathlib.Path(temporary) / 'fixture'
    shutil.copytree(ROOT / 'examples/sample-app', project,
                    ignore=shutil.ignore_patterns('.project-map', '.agents', '__pycache__'))
    def command(*args):
        return json.loads(subprocess.check_output(['node',str(CLI),*args,'--project',str(project)],text=True,cwd=ROOT))
    server = subprocess.Popen(['node',str(CLI),'serve','--project',str(project)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,cwd=ROOT)
    try:
        startup = ''
        for _ in range(30):
            line = server.stdout.readline()
            if not line:
                raise RuntimeError('Server exited before startup: ' + server.stderr.read())
            startup += line
            try:
                address = json.loads(startup)['url']
                break
            except json.JSONDecodeError:
                continue
        else:
            raise RuntimeError('Invalid server startup response')
        with sync_playwright() as p:
            executable=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
            browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
            page=browser.new_page(viewport={'width':1440,'height':1000})
            errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(address,wait_until='networkidle')
            page.locator('#features button').filter(has_text='리포트').click()
            page.locator('#request').fill('리포트 제목을 이번 주 리포트로 변경해줘.')
            page.locator('#preview').click(); page.locator('#save').click()
            expect(page.locator('#task-status')).to_contain_text('계획 요청 필요')
            task_id=page.request.get(address+'/api/tasks').json()['tasks'][0]['id']
            state=project/'.agents/project-map-state'; plan_file=state/'browser-plan.json'
            plan_file.write_text(json.dumps({'summary':'리포트 제목을 바꾸고 관련 기능을 확인합니다.','writeFiles':['src/app/reports/page.tsx'],'effects':[{'nodeId':'src/app/reports/page.tsx','change':'제목 문구 변경','expected':'이번 주 리포트 표시','verify':'실제 앱 화면 확인'}]},ensure_ascii=False))
            command('plan','--id',task_id,'--file',str(plan_file))
            page.locator('#tasks button').first.click()
            expect(page.get_by_role('button',name='이 계획으로 진행',exact=True)).to_be_visible()
            page.get_by_role('button',name='이 계획으로 진행',exact=True).click()
            expect(page.locator('#task-status')).to_contain_text('승인됨')
            command('start','--id',task_id)
            target=project/'src/app/reports/page.tsx'
            target.write_text(target.read_text().replace('주간 리포트','이번 주 리포트'))
            spec=state/'browser-evidence.json'
            spec.write_text(json.dumps({'kind':'check','name':'가상 예제 소스 변경 확인','argv':['node','-e',"if(!require('fs').readFileSync('src/app/reports/page.tsx','utf8').includes('이번 주 리포트'))process.exit(1)"]},ensure_ascii=False))
            command('evidence','--id',task_id,'--file',str(spec))
            command('complete','--id',task_id,'--summary','가상 예제 제목 변경','--checks',json.dumps([{'name':'실제 앱 화면 확인','status':'not_run','nodeId':'src/app/reports/page.tsx','detail':'이 테스트는 예제 앱 자체를 실행하지 않습니다.'}],ensure_ascii=False))
            page.locator('#tasks button').first.click()
            expect(page.locator('#task-status')).to_contain_text('수정 완료')
            expect(page.locator('.mini-map')).to_have_count(3)
            expect(page.get_by_role('heading',name='승인한 예상과 실제 결과',exact=True)).to_be_visible()
            assert page.get_by_role('button',name='되돌릴 파일 미리보기',exact=True).is_visible()
            assert page.get_by_text('가상 예제 소스 변경 확인',exact=False).count()>0
            assert page.locator('.change-flag').filter(has_text='수정됨').count()>0
            output=pathlib.Path(os.environ.get('PM_SCREENSHOT_DIR',temporary));output.mkdir(parents=True,exist_ok=True)
            for width,height,name in [(1440,1000,'desktop'),(390,844,'mobile')]:
                page.set_viewport_size({'width':width,'height':height})
                page.evaluate('document.activeElement?.blur()')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'document overflows'
                page.screenshot(path=str(output/f'project-map-v07-{name}.png'),full_page=True)
            # Real restore flow: preview token, confirmation and hash checks all cross HTTP.
            page.on('dialog',lambda dialog:dialog.accept())
            page.get_by_role('button',name='되돌릴 파일 미리보기',exact=True).click()
            page.get_by_role('button',name='위 파일만 작업 전으로 복원',exact=True).click()
            expect(page.locator('#notice')).to_contain_text('복원')
            assert '주간 리포트' in target.read_text()
            page.get_by_role('button',name='작업 기록 보관',exact=True).click()
            expect(page.locator('#tasks button')).to_have_count(0)
            page.locator('#show-archived').check()
            expect(page.locator('#tasks button')).to_have_count(1)
            page.locator('#storage-usage').click();expect(page.locator('#notice')).to_contain_text('MB')
            assert not errors,errors
            browser.close()
        print('PASS: real Chromium + live localhost API, selection → request → plan → approval → result → restore → archive, 1440px and 390px. Synthetic fixture; no live Codex or target app execution.')
    finally:
        server.terminate()
        try: server.wait(timeout=10)
        except subprocess.TimeoutExpired: server.kill();server.wait()
