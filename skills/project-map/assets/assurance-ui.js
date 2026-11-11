'use strict';
window.addEventListener('project-map:task', event => {
  const {task,body,node}=event.detail, data=task.experience?.assurance;if(!data)return;
  const section=node('section',undefined,'assurance');section.append(node('h3','영향의 근거와 실제 검증'));
  if(data.impact){
    section.append(node('p','실제로 수정할 파일을 기준으로 다시 계산한 영향입니다.','info'));
    for(const f of data.impact.features){const card=node('article',undefined,'effect');card.append(node('strong',f.label),node('p',f.reason),node('p',f.files.join(' · '),'mono'));section.append(card);}
    section.append(node('p',data.impact.unknown,'footnote'));
  }
  if(data.audit){
    section.append(node('h3','지도 밖 파일까지 변경 확인'));
    const table=node('table'), head=node('tr');['파일','변경','확인할 점'].forEach(t=>head.append(node('th',t)));table.append(head);
    for(const change of data.audit.changes){const row=node('tr');row.append(node('td',change.path),node('td',change.status),node('td',[change.sensitive?'민감 파일 · 내용 비공개':'',change.outsideMap?'지도 분석 밖':'',change.outOfScope?'수정 계획 밖':''].filter(Boolean).join(' / ')));table.append(row);}
    const wrap=node('div',undefined,'table-wrap');wrap.append(table);section.append(wrap);
    if(!data.audit.complete)section.append(node('p','비교 범위가 불완전합니다. 누락 파일을 Git에서 추가 확인하세요.','info caution'));
  }
  section.append(node('p',data.evidenceNote,'info caution'));
  const images=node('div',undefined,'evidence-grid');
  for(const item of data.evidence||[]){
    if(item.kind==='image'){
      const figure=node('figure'),image=node('img');image.src=item.url;image.alt=item.name;image.loading='lazy';figure.append(image,node('figcaption',`${item.stage==='before'?'변경 전':'변경 후'} · ${item.name} · ${item.current?'현재 기준':'이전 기준 / 재확인'}`));images.append(figure);
    }else{
      const card=node('article',undefined,'effect');card.append(node('strong',`${item.name} · 종료 코드 ${item.exitCode ?? '없음'}`),node('p',`${item.status==='passed'?'명령 통과':'명령 실패'} · ${item.current?'현재 코드 기준':'코드 변경 / 이전 계획 · 재실행 필요'}`));
      const detail=node('details');detail.append(node('summary','실행 명령과 기록'),node('pre',(item.argv||[]).join(' ')+'\n'+item.output,'prompt'));card.append(detail);section.append(card);
    }
  }
  if(images.children.length)section.append(images);
  if(!data.evidence?.length)section.append(node('p','실제 명령·화면 증거가 아직 없습니다. Codex에 필요한 검증과 증거 등록을 요청하세요.','footnote'));
  body.append(section);
});
