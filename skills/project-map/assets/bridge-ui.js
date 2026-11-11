'use strict';
(()=>{
 let context;
 async function connection(){
  const response=await fetch('/api/connection',{cache:'no-store'});if(!response.ok)return;const state=await response.json();
  document.querySelector('#connection').textContent=!state.enabled?'수동 전달':state.active?'Codex · '+state.active.status:state.connected?'Codex 연결됨':'Codex · 연결 대기';
  if(!context||!context.host.isConnected)return;
  const {task,host,node,button,api,notice,reload}=context;host.replaceChildren(node('h3','Codex 연결과 작업 상태'));
  if(!state.enabled){host.append(node('p','기본은 요청문 복사 방식입니다. 직접 전송을 사용하려면 로컬 서버를 --codex 옵션으로 시작하세요.','footnote'));return;}
  const controls=node('div',undefined,'actions');
  if(!state.active&&['queued','blocked','awaiting_review','approved'].includes(task.status)){
   const phase=task.status==='approved'?'execute':'plan';controls.append(button(phase==='plan'?'Codex에 계획 작성 요청':'승인한 계획 실행',async()=>{
    if(!confirm('로컬 Codex 계정의 사용량이 발생할 수 있습니다. 선택한 요청을 전송하시겠습니까? 실행 단계에서는 앱 파일이 수정됩니다.'))return;
    await api('/api/codex/run',{id:task.id,phase});notice('선택한 요청을 Codex에 전달했습니다. 실행 상태와 승인 요청을 확인하세요.');await connection();
   },'primary'));
  }
  if(state.active)controls.append(button('현재 Codex 실행 중단',async()=>{await api('/api/codex/interrupt',{});notice('중단을 요청했습니다. interrupted/중단 상태를 확인한 뒤 재개하세요.');await connection();}));
  host.append(controls);
  for(const approval of state.approvals||[]){
   const card=node('section',undefined,'effect');card.append(node('strong','추가 권한 요청 · 이번 실행에만 적용'),node('pre',JSON.stringify(approval.detail,null,2),'prompt'));
   for(const decision of ['accept','decline'])card.append(button(decision==='accept'?'내용 확인 후 이번만 승인':'거절',async()=>{
    if(decision==='accept'&&!confirm('위 명령/파일/네트워크 접근 내용을 확인하고 이번 요청만 승인하시겠습니까?'))return;
    await api('/api/codex/decision',{id:approval.id,decision});await connection();
   }));host.append(card);
  }
  if(state.last?.message)host.append(node('p',state.last.message,'info caution'));
  const detail=node('details');detail.append(node('summary','연결 진행 기록'),node('pre',(state.events||[]).map(e=>`${e.type}: ${e.message}`).join('\n'),'prompt'));host.append(detail);
 }
 window.addEventListener('project-map:task',event=>{
  const {task,body,node}=event.detail,section=node('section',undefined,'effect');
  section.append(node('h3','다른 작업과 함께 진행할 수 있나요?'));
  const names={conflict:'충돌 · 순서 조정 필요',coordinate:'공유 규칙 합의 필요',unknown:'계획 갱신·추가 확인',conditional:'조건부 병렬 후보'};
  for(const peer of task.experience?.parallel||[]){const card=node('article',undefined,'effect');card.append(node('strong',names[peer.status]),node('p',peer.request),node('p',peer.reasons.join(' / ')));section.append(card);}
  if(!task.experience?.parallel?.length)section.append(node('p','비교할 다른 미완료 작업이 없습니다.','muted'));
  body.append(section);const host=node('section',undefined,'effect');body.append(host);context={...event.detail,host};connection().catch(()=>{});
 });
 connection().catch(()=>{});setInterval(()=>{if(document.visibilityState==='visible')connection().catch(()=>{});},2000);
})();
