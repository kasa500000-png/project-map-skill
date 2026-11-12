'use strict';
window.addEventListener('project-map:task',event=>{
 const {task,body,node,button,api,notice,reload}=event.detail,data=task.experience?.safety;if(!data)return;
 const box=node('section',undefined,'effect');box.append(node('h3','안전하게 중단하고 이어가기'),node('p',data.nextAction),node('p',data.limits,'info caution'));
 const actions=node('div',undefined,'actions');
 if(task.status==='running'||data.uncertainExecution)actions.append(button('실행 중단 후 상태 기록',async()=>{
   if(!confirm('이 버튼은 외부 Codex 프로세스를 중단하지 않습니다. 먼저 Codex 실행을 중단했나요?'))return;
   await api(`/api/tasks/${task.id}/pause`,{executionStopped:true});await reload();notice('중단 상태를 기록했습니다. 재개 전 현재 계획을 다시 확인하세요.');
 }));
 if(task.status==='blocked'&&!data.uncertainExecution)actions.append(button('재개 계획 다시 검토',async()=>{await api(`/api/tasks/${task.id}/resume-plan`,{});await reload();notice('현재 코드 기준 재개 계획입니다. 변경 내용을 확인한 후 승인하세요.');}));
 if(data.checkpoint){
   box.append(node('p',`보존된 파일 ${data.checkpoint.files.length}개 · ${data.checkpoint.restoredAt?'이미 복원됨':'작업 전 내용 보관'}`));
   if(!data.uncertainExecution&&['completed','blocked'].includes(task.status)&&data.checkpoint.sealedAt&&!data.checkpoint.restoredAt)actions.append(button('되돌릴 파일 미리보기',async()=>{
     const preview=await api(`/api/tasks/${task.id}/restore-preview`,{}),pane=node('section',undefined,'effect');pane.append(node('p',preview.warning,'info caution'));
     const list=node('ul');preview.files.forEach(f=>list.append(node('li',`${f.path} · ${f.action}`)));pane.append(list);
     pane.append(button('위 파일만 작업 전으로 복원',async()=>{
       if(!confirm('다른 Codex 작업을 멈추고, 위 파일을 체크포인트 내용으로 복원하시겠습니까? 외부 데이터나 배포는 복원되지 않습니다.'))return;
       const result=await api(`/api/tasks/${task.id}/restore-apply`,{token:preview.token});notice(`${result.files.length}개 파일을 복원했습니다. 새로운 작업 요청으로 이어가세요.`);await reload();
     }));box.append(pane);
   }));
 }else box.append(node('p','작업 시작 전 체크포인트가 생성됩니다. 이전 버전 작업에는 없을 수 있습니다.','footnote'));
 box.append(actions);body.append(box);
});
