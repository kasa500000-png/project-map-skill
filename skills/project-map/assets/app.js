'use strict';

(function () {
  const $ = function (selector) { return document.querySelector(selector); };
  const words = {
    ko: {
      skip:'작업 지도로 이동',local:'로컬 작업 공간',refresh:'지도 새로고침',projectEyebrow:'코드와 연결된 작업 지도',loading:'프로젝트를 불러오는 중입니다.',structure:'프로젝트 구조',changes:'변경 내역',tasks:'작업 요청',mapTitle:'어디를 바꿀까요?',mapHint:'기능을 선택하면 연결된 코드를 함께 볼 수 있습니다.',features:'기능 중심',allFiles:'전체 파일',search:'기능·파일 검색',multiSelect:'여러 항목 선택',clearSelection:'선택 해제',write:'수정 후보',read:'참고',verify:'함께 검증',selectedTarget:'선택한 작업 대상',selectFirst:'기능을 선택하세요',intentLabel:'변경 종류',displayIntent:'화면 표시·문구 변경',behaviorIntent:'기능의 동작 변경',contractIntent:'공용 규칙·데이터 형식 변경',requestLabel:'원하는 변경을 알려주세요',requestPlaceholder:'예: 핵심 요약을 먼저 보여주고, 상세 내용은 접어서 볼 수 있게 해줘.',requestNote:'요청문과 선택한 기능이 함께 저장됩니다.',analyze:'영향 범위 확인',analyzing:'범위 확인 중…',impactTitle:'이번 작업의 예상 범위',impactWarnings:'함께 알아둘 점',parallelTitle:'병렬 작업 후보',saveTask:'이 범위로 작업 요청 저장',saving:'요청 저장 중…',saveNote:'요청 저장 후 Codex에서 실행합니다.',savedTitle:'작업 요청 저장됨',savedNote:'대기 중인 요청입니다. 아직 코드 수정은 시작되지 않았습니다.',annotate:'Codex에 선택 항목 첨부',copyPrompt:'Codex 요청문 복사',viewPrompt:'전달할 요청문 보기',idleGuidance:'화면·기능을 고르고 변경할 내용을 적어주세요. 수정 후보와 함께 확인할 부분을 나눠 보여드립니다.',changesTitle:'계획과 실제 변경을 비교합니다',changesHint:'요청을 저장한 시점의 파일 상태와 완료 시점의 상태를 비교한 결과입니다.',chooseTask:'작업 선택',noChangesTitle:'아직 완료된 변경 기록이 없습니다',noChanges:'Codex가 저장한 작업을 실행하고 완료 기록을 남기면 여기에서 확인할 수 있습니다.',checksTitle:'확인 결과',tasksTitle:'요청과 진행 상태',tasksHint:'브라우저는 요청을 저장하고, Codex가 실제 작업을 수행합니다.',reloadTasks:'상태 새로고침',noTasksTitle:'첫 작업을 지도에서 선택해 보세요',noTasks:'기능을 선택하고 요청을 저장하면 이곳에 작업이 쌓입니다.',footer:'자동 분석은 확인 가능한 코드 관계를 바탕으로 합니다. 실제 수정 전 최신 코드를 확인하세요.',screens:'화면·기능',code:'구성 요소·동작',system:'데이터·공통 설정',screen:'화면',component:'구성 요소',service:'서비스',data:'데이터',config:'설정',module:'모듈',confirmed:'확인됨',inferred:'추정',selected:'선택됨',allCount:'분석한 파일',screenCount:'화면 후보',requestCount:'저장한 요청',branch:'브랜치',scanned:'분석',noGit:'Git 정보 없음',dirty:'미커밋 변경 있음',coverage:'분석 범위 안내',nothingFound:'검색에 맞는 항목이 없습니다.',nothingIndexed:'분석 가능한 코드 파일이 없습니다. 프로젝트 위치와 지원 파일 형식을 확인하세요.',noFile:'해당 없음',noParallel:'현재 범위에서 독립적인 작업 후보를 확인하지 못했습니다.',parallelCaution:'공통 파일·데이터 약속을 함께 바꾸는지 Codex가 다시 확인해야 합니다.',limited:'표시가 많아 일부 항목만 보여줍니다. 검색으로 범위를 좁혀주세요.',mapCaption:'선은 코드에서 확인하거나 추정한 참조 관계입니다. 선택한 항목 주변의 관계를 표시합니다.',unknown:'확인 필요',queued:'실행 대기',running:'작업 중',blocked:'확인 필요',completed:'작업 완료',failed:'실패',cancelled:'취소됨',passed:'통과',not_run:'미실행',notRun:'검증 결과가 기록되지 않았습니다.',reported:'결과 확인 필요',skipped:'생략',added:'추가',modified:'수정',deleted:'삭제',outOfScope:'예상 범위 밖',actualChanges:'실제 변경 파일',noChangedFiles:'파일 변경이 확인되지 않았습니다.',savedNotice:'작업 요청을 저장했습니다. 요청문을 Codex에 전달해 작업을 이어가세요.',copied:'Codex 요청문을 복사했습니다.',copyFailed:'자동 복사가 지원되지 않습니다. 아래 요청문을 직접 선택해 복사하세요.',annotationAccepted:'선택 항목의 의견 입력을 요청했습니다. 열린 창에서 내용을 확인하고 직접 전송하세요.',annotationDeclined:'의견 입력 요청을 열지 못했습니다. 요청문 복사로 이어갈 수 있습니다.',annotationUnavailable:'현재 브라우저는 선택 항목 첨부를 지원하지 않습니다. 요청문을 복사해 Codex에 전달하세요.',refreshDone:'최신 코드로 지도를 갱신했습니다. 저장된 작업의 기준 시점은 유지됩니다.',stale:'코드 또는 지도가 변경되었습니다. 지도를 새로고침하고 영향 범위를 다시 확인하세요.',selectAndRequest:'작업할 기능과 요청 내용을 모두 입력하세요.',selectTask:'작업을 선택하면 요청과 범위를 확인할 수 있습니다.',created:'요청 저장',updated:'최근 갱신',viewChanges:'변경 내역 보기',taskScope:'계획한 수정 범위',refreshing:'갱신 중…',taskPrompt:'저장한 작업 요청',checksStatus:'검증 상태',noSelection:'선택 없음',nativeUnavailable:'현재 환경에서는 복사한 요청문으로 Codex에 연결합니다.',localOnly:'요청 저장과 코드 실행은 별도 단계입니다.'
    },
    en: {
      skip:'Skip to project map',local:'Local workspace',refresh:'Refresh map',projectEyebrow:'A workspace connected to your code',loading:'Loading your project.',structure:'Project structure',changes:'Changes',tasks:'Requests',mapTitle:'What would you like to change?',mapHint:'Select a feature to see the code connected to it.',features:'Features',allFiles:'All files',search:'Find a feature or file',multiSelect:'Select multiple',clearSelection:'Clear selection',write:'Edit candidates',read:'Reference',verify:'Verify together',selectedTarget:'Selected work area',selectFirst:'Select a feature',intentLabel:'Change type',displayIntent:'Display or wording',behaviorIntent:'Feature behavior',contractIntent:'Shared contracts or data shape',requestLabel:'Describe the change',requestPlaceholder:'For example: show the key summary first and make the details collapsible.',requestNote:'Your request is saved with the selected features.',analyze:'Preview impact',analyzing:'Checking scope…',impactTitle:'Expected scope for this request',impactWarnings:'What to check',parallelTitle:'Parallel work candidates',saveTask:'Save this scoped request',saving:'Saving request…',saveNote:'Continue the saved request in Codex.',savedTitle:'Request saved',savedNote:'This request is queued. No code change has started.',annotate:'Attach selection to Codex',copyPrompt:'Copy Codex prompt',viewPrompt:'View the prompt',idleGuidance:'Choose a feature and describe the change. The map separates edit candidates, references, and areas to verify.',changesTitle:'Compare the plan with actual changes',changesHint:'Files are compared between the saved request baseline and its completion snapshot.',chooseTask:'Choose a task',noChangesTitle:'No completed change records yet',noChanges:'When Codex completes a saved request and records the result, it will appear here.',checksTitle:'Verification results',tasksTitle:'Requests and progress',tasksHint:'The browser saves requests. Codex performs the code changes.',reloadTasks:'Refresh status',noTasksTitle:'Choose your first task on the map',noTasks:'Select a feature and save a request to build your work history.',footer:'Automatic analysis uses observable code relationships. Verify current source before editing.',screens:'Screens & features',code:'Components & behavior',system:'Data & shared configuration',screen:'Screen',component:'Component',service:'Service',data:'Data',config:'Configuration',module:'Module',confirmed:'Confirmed',inferred:'Inferred',selected:'Selected',allCount:'Indexed files',screenCount:'Screen candidates',requestCount:'Saved requests',branch:'Branch',scanned:'Scanned',noGit:'No Git metadata',dirty:'Uncommitted changes',coverage:'Analysis coverage',nothingFound:'No matching features or files.',nothingIndexed:'No supported code files found. Check the project path and supported file types.',noFile:'None',noParallel:'No independent work candidate was identified for this scope.',parallelCaution:'Codex must verify shared-file and data-contract conflicts before splitting work.',limited:'Only part of the map is shown. Narrow the view with search.',mapCaption:'Lines represent observed or inferred code references near the selected features.',unknown:'Needs verification',queued:'Queued',running:'In progress',blocked:'Needs attention',completed:'Work completed',failed:'Failed',cancelled:'Cancelled',passed:'Passed',not_run:'Not run',notRun:'No verification results were recorded.',reported:'Needs verification',skipped:'Skipped',added:'Added',modified:'Modified',deleted:'Deleted',outOfScope:'Outside planned scope',actualChanges:'Actual file changes',noChangedFiles:'No file changes were detected.',savedNotice:'Request saved. Send the copied prompt to Codex to continue.',copied:'Codex prompt copied.',copyFailed:'Automatic copying is unavailable. Select and copy the prompt below.',annotationAccepted:'The annotation editor was requested. Review the content and send it yourself.',annotationDeclined:'The annotation request could not be opened. Use the copied prompt instead.',annotationUnavailable:'This browser does not support selection annotations. Copy the prompt to Codex.',refreshDone:'The map now reflects current code. Saved task baselines are unchanged.',stale:'Code or map state has changed. Refresh the map and preview impact again.',selectAndRequest:'Choose a feature and enter your request.',selectTask:'Select a request to inspect its details and scope.',created:'Saved',updated:'Updated',viewChanges:'View changes',taskScope:'Planned edit scope',refreshing:'Refreshing…',taskPrompt:'Saved task request',checksStatus:'Verification status',noSelection:'No selection',nativeUnavailable:'Use the copied prompt to continue in Codex in this browser.',localOnly:'Saving a request and executing changes are separate steps.'
    }
  };
  Object.assign(words.ko,{currentStatus:'현재 상태:',comparisonTitle:'변경 비교 범위',comparisonWarnings:'비교 결과를 읽는 기준',sourceComparison:'분석한 소스 파일만 비교했습니다.',completeComparison:'분석 대상 안에서 누락 없이 비교됨',partialComparison:'분석에서 빠진 파일이 있어 추가 확인 필요',unknownComparison:'비교 범위 정보가 없어 추가 확인 필요',before:'요청 저장 시',after:'완료 시',scannedFiles:'분석 파일',skippedFiles:'건너뛴 파일'});
  Object.assign(words.en,{currentStatus:'Current status:',comparisonTitle:'Comparison coverage',comparisonWarnings:'How to interpret these changes',sourceComparison:'Only indexed source files were compared.',completeComparison:'Complete within the indexed sources',partialComparison:'Some files were skipped; review the comparison',unknownComparison:'Coverage metadata is unavailable; verify the comparison',before:'At request creation',after:'At completion',scannedFiles:'indexed',skippedFiles:'skipped'});
  Object.assign(words.ko,{
    review:'계획 검토',screenFlow:'화면 이동',implementation:'구현 연결',navigates:'화면 이동',codeRelation:'코드 참조',imports:'코드 참조',uses:'사용',reads:'데이터 읽기',writes:'데이터 쓰기',incoming:'들어오는 연결',outgoing:'나가는 연결',evidence:'분석 근거',noRelations:'확인된 연결이 없습니다.',noFlow:'화면 이동 경로가 확인되지 않았습니다. 구현 연결에서 코드 관계를 볼 수 있습니다.',flowCaption:'화살표는 코드에 표시된 이동 방향입니다. 추정 경로는 실제 앱에서 확인하세요.',implementationCaption:'화살표는 코드를 참조하는 쪽에서 사용되는 쪽으로 향합니다. 화면 이동과는 별개입니다.',visibleNodes:'표시 항목',visibleEdges:'표시 연결',graphTruncated:'일부 항목·연결만 표시합니다. 파일 범위와 기능별 설명도 확인하세요.',
    reviewEyebrow:'작업 전에 함께 확인',reviewTitle:'어떻게 바뀌는지 보고 결정하세요',reviewHint:'Codex가 제안한 계획입니다. 승인한 뒤 코드 작업을 시작합니다.',noReviewTitle:'지도에서 작업 요청을 먼저 저장하세요',noReview:'Codex가 계획을 작성하면 변경 전과 예상 모습을 여기서 비교할 수 있습니다.',openReview:'계획 검토로 이동',beforeGraph:'변경 전',expectedGraph:'이렇게 바꿀 예정',baselineGraph:'계획 기준 지도',expectedLabel:'Codex 제안',expectedOnly:'예상 변경 · 아직 실제 결과가 아닙니다',plannedAdd:'추가 예정',plannedRemove:'제거 예정',plannedChange:'변경 예정',reviewNote:'계획에 대한 의견 (수정 요청 시 필수)',reviewPlaceholder:'예: 목록 화면은 그대로 두고, 상세 화면의 요약만 바꿔줘.',approvePlan:'이 계획으로 작업 진행',revisePlan:'계획 수정 요청',approveNote:'현재 표시된 계획 버전을 승인합니다. Codex의 활성 작업이 이어서 진행하거나, 아래 요청문으로 계속할 수 있습니다.',awaiting_review:'계획 검토 대기',approved:'계획 승인됨',queued:'계획 작성 대기',not_run:'미확인',notRun:'검증 결과가 없어 동작은 미확인입니다.',changeLabel:'바꿀 내용',expectedEffect:'기대하는 동작',verifyEffect:'확인할 내용',planRevision:'계획 버전',planSnapshot:'기준 지도',planScope:'수정할 파일',planWaiting:'Codex의 계획을 기다리고 있습니다',planWaitingNote:'요청문을 복사해 Codex에 전달하세요. Codex가 최신 코드와 요청을 확인하고 제안한 계획이 여기에 나타납니다.',approvedWaiting:'계획이 승인되었습니다',approvedWaitingNote:'작업 중인 Codex 세션이 이어서 진행할 수 있습니다. 세션이 끝났다면 아래 요청문을 전달해 계속하세요.',runningNote:'Codex가 승인된 계획에 따라 작업 중입니다. 완료 결과가 기록되면 변경 내역에서 볼 수 있습니다.',blockedNote:'Codex가 작업을 멈추고 확인을 요청했습니다. 작업 세션에서 내용을 확인하세요.',completedNote:'작업 결과가 기록되었습니다. 실제 변경과 기능별 확인 결과를 살펴보세요.',reviewHandoff:'이 페이지는 요청과 승인을 저장합니다. 실행 중인 Codex가 없다면 복사한 요청문을 전달해 주세요.',approveSaved:'표시된 계획을 승인했습니다. Codex에서 승인된 작업을 이어갈 수 있습니다.',revisionSaved:'수정 의견을 저장했습니다. Codex가 계획을 다시 제안하도록 요청문을 전달하세요.',revisionRequired:'계획을 어떻게 수정할지 의견을 적어주세요.',reviewFailed:'계획이나 코드가 바뀌었습니다. 새로 표시된 계획을 확인한 뒤 다시 결정하세요.',stepRequest:'요청',stepPlan:'계획 검토',stepWork:'작업',stepResult:'결과',saveNote:'요청을 저장하고 Codex에 계획 작성을 요청합니다.',savedNote:'계획 작성 대기 중입니다. 요청문을 Codex에 전달하면 검토할 계획을 작성합니다.',savedNotice:'요청을 저장했습니다. Codex에 계획 작성을 요청하고 검토 화면으로 돌아오세요.',
    actualBeforeGraph:'작업 전',actualAfterGraph:'작업 후',observedGraph:'분석한 코드 구조',actualNotBehavior:'코드 변경 · 동작 확인은 아래 결과 참고',outcomesTitle:'기능별 기대와 확인 결과',outcomesHint:'파일이 바뀌어도 기능 검증이 기록되지 않았다면 미확인으로 남습니다.',actualVerification:'실제 확인',noOutcomes:'이전 작업 기록에는 기능별 확인 결과가 없습니다.',changedFilesDetail:'실제 변경 파일 상세',continueTitle:'이 결과에서 다음 작업을 이어가세요',continueHint:'현재 지도에 남아 있는 관련 기능을 다시 선택하고 이전 작업과 연결합니다.',continueTask:'관련 기능으로 다음 요청',followupFrom:'이전 작업에서 이어지는 요청',clearFollowup:'독립된 새 요청으로 변경',followupReady:'현재 지도에서 관련 기능을 선택했습니다. 이어서 바꿀 내용을 적어주세요.',followupEmpty:'이전 작업의 기능이 현재 지도에 없습니다. 다음 작업 대상을 새로 선택하세요.',detailsForNode:'기능과 파일 정보',requestSnapshot:'요청 기준 지도',stale:'코드 또는 지도가 변경되었습니다. 새로고침하고 범위를 다시 확인하세요.',graphUnavailable:'이 기록에는 연결 지도가 없습니다. 기능 설명과 파일 내역을 확인하세요.'
  });
  Object.assign(words.en,{
    review:'Review plan',screenFlow:'Screen flow',implementation:'Implementation',navigates:'Screen transition',codeRelation:'Code reference',imports:'Code reference',uses:'Uses',reads:'Reads data',writes:'Writes data',incoming:'Incoming',outgoing:'Outgoing',evidence:'Evidence',noRelations:'No relationships were identified.',noFlow:'No screen transitions were identified. Switch to Implementation to see code references.',flowCaption:'Arrows follow navigation found in source. Verify inferred routes in the running app.',implementationCaption:'Arrows point from the referring code to the code it uses. These are separate from screen transitions.',visibleNodes:'nodes shown',visibleEdges:'connections shown',graphTruncated:'Only part of the graph is shown. Also inspect file scope and feature details.',
    reviewEyebrow:'Review before work begins',reviewTitle:'See the proposed change, then decide',reviewHint:'This plan is proposed by Codex. Code work starts after approval.',noReviewTitle:'Save a request from the map first',noReview:'After Codex proposes a plan, compare the current and expected structure here.',openReview:'Open plan review',beforeGraph:'Before',expectedGraph:'Expected after change',baselineGraph:'Plan baseline',expectedLabel:'Proposed by Codex',expectedOnly:'Expected change · not an actual result',plannedAdd:'Planned addition',plannedRemove:'Planned removal',plannedChange:'Planned change',reviewNote:'Feedback on the plan (required for revisions)',reviewPlaceholder:'For example: keep the list as it is and only change the detail summary.',approvePlan:'Approve this plan and continue',revisePlan:'Request a revised plan',approveNote:'Approve the exact plan version shown here. An active Codex task can continue, or use the prompt below.',awaiting_review:'Awaiting review',approved:'Plan approved',queued:'Awaiting plan',not_run:'Unverified',notRun:'No verification results were recorded; behavior is unverified.',changeLabel:'Proposed change',expectedEffect:'Expected behavior',verifyEffect:'What to verify',planRevision:'Plan revision',planSnapshot:'Baseline map',planScope:'Files to edit',planWaiting:'Waiting for a plan from Codex',planWaitingNote:'Copy the prompt into Codex. Its proposal will appear here after it checks your request and current source.',approvedWaiting:'This plan is approved',approvedWaitingNote:'An active Codex session can continue. If that session has ended, send the prompt below to resume.',runningNote:'Codex is working on the approved plan. Recorded results will appear in Changes.',blockedNote:'Codex has paused for clarification. Check the active work session.',completedNote:'The result is recorded. Review actual changes and feature verification.',reviewHandoff:'This page saves requests and approvals. If Codex is not active, send the copied prompt to continue.',approveSaved:'The displayed plan is approved. Continue the approved task in Codex.',revisionSaved:'Feedback saved. Send the updated prompt to Codex to request a revised plan.',revisionRequired:'Describe how the plan should be revised.',reviewFailed:'The plan or source has changed. Review the updated plan before deciding again.',stepRequest:'Request',stepPlan:'Review plan',stepWork:'Work',stepResult:'Result',saveNote:'Save the request, then ask Codex to propose a plan.',savedNote:'Waiting for a plan. Send the prompt to Codex to prepare a proposal for review.',savedNotice:'Request saved. Ask Codex to prepare a plan, then return here to review it.',
    actualBeforeGraph:'Before work',actualAfterGraph:'After work',observedGraph:'Observed code structure',actualNotBehavior:'Code changes · see behavior checks below',outcomesTitle:'Expected behavior and actual verification',outcomesHint:'Changed files do not establish working behavior. Features stay unverified until a check is recorded.',actualVerification:'Actual verification',noOutcomes:'This older task has no feature-level verification records.',changedFilesDetail:'Actual changed files',continueTitle:'Continue from this result',continueHint:'Reselect related features that still exist and link the next request to this task.',continueTask:'Start a related request',followupFrom:'Following up on task',clearFollowup:'Make this an independent request',followupReady:'Related features are selected in the current map. Describe the next change.',followupEmpty:'These features no longer exist in the current map. Choose a new target for the follow-up.',detailsForNode:'Feature and file details',requestSnapshot:'Request baseline map',stale:'Code or map state changed. Refresh and preview the scope again.',graphUnavailable:'This record has no relationship graph. Review the feature descriptions and file details.'
  });
  Object.assign(words.ko,{emptyGraph:'이 범위에는 표시할 기능이 없습니다.'});
  Object.assign(words.en,{emptyGraph:'No features remain in this graph scope.'});
  const translations={
    'Relationships are a bounded static scan, not a complete runtime or semantic dependency analysis.':'정해진 범위의 코드 참조를 분석한 결과입니다. 실행 중 연결이나 기능의 의미까지 모두 파악한 것은 아닙니다.',
    'Changes are differences since task creation, not proof that this task caused every change. Concurrent edits require review.':'요청 저장 이후 달라진 파일을 비교합니다. 같은 기간에 다른 작업이 수정한 내용도 포함될 수 있습니다.',
    'This comparison covers scanned source files only. Ignored files, unsupported formats, dependencies, and secrets are outside the comparison.':'분석한 소스 파일만 비교합니다. 제외 파일, 지원하지 않는 형식, 설치된 의존성, 비밀정보 파일은 비교 범위에 포함되지 않습니다.',
    'Coverage is incomplete; a missing file may have been skipped rather than deleted. Review additions, deletions, and out-of-scope findings against Git before relying on them.':'분석 범위가 완전하지 않습니다. 삭제로 표시된 파일이 실제로는 분석에서 빠졌을 수 있으므로 Git 변경사항과 함께 확인하세요.'
  };
  let language = 'ko';
  try { language = localStorage.getItem('project-map-language') === 'en' ? 'en' : 'ko'; } catch (_) {}
  const state = { token:null,map:null,tasks:[],selection:new Set(),scope:'features',connections:'flow',search:'',impact:null,impactKey:null,savedTask:null,currentTask:null,changeTask:null,reviewTask:null,parentTaskId:null,view:'structure',busy:false,analyzing:false,saving:false,reviewing:false,nodeElements:new Map(),drawFrame:null,mainGraph:null };
  const t = function (key) { return words[language][key] || key; };
  const arr = function (value) { return Array.isArray(value) ? value : []; };
  const element = function (tag, className, text) { const node=document.createElement(tag); if(className)node.className=className; if(text!==undefined)node.textContent=String(text); return node; };
  const time = function (value) { if(!value)return '—'; const date=new Date(value); return Number.isNaN(date.valueOf())?'—':new Intl.DateTimeFormat(language==='ko'?'ko-KR':'en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date); };
  const labelFor = function (id) { const node=state.map&&arr(state.map.nodes).find(function(n){return n.id===id;}); return node?node.label:id; };
  const metadataText = function (value) { if(typeof value==='string')return language==='ko'&&translations[value]?translations[value]:value; if(value&&typeof value==='object')return metadataText(value.message||value.reason||value.description||JSON.stringify(value)); return String(value); };
  function showNotice(message) { $('#notice').textContent=message; $('#notice').hidden=!message; }
  function showError(error) { const message=error&&error.code==='STALE_SNAPSHOT'?t('stale'):(error&&error.message)||String(error); $('#error').textContent=message; $('#error').hidden=false; }
  function clearError() { $('#error').hidden=true; }
  async function api(path, method, body) {
    const options={method:method||'GET',headers:{Accept:'application/json'},cache:'no-store'};
    if(options.method!=='GET'){options.headers['Content-Type']='application/json';options.headers['X-Project-Map-Token']=state.token||'';options.body=JSON.stringify(body||{});}
    const response=await fetch(path,options);
    let data; try{data=await response.json();}catch(_){throw new Error('Project Map returned an invalid response ('+response.status+').');}
    if(!response.ok){const error=new Error(data.message||data.error||('HTTP '+response.status));error.code=response.status===409?'STALE_SNAPSHOT':data.error;throw error;}
    return data;
  }
  function draftKey() {return JSON.stringify({nodeIds:Array.from(state.selection).sort(),intent:$('#intent').value,request:$('#request').value.trim()});}
  function invalidateDraft() {state.impact=null;state.impactKey=null;state.savedTask=null;$('#impact-panel').hidden=true;$('#saved-panel').hidden=true;$('#idle-guidance').hidden=false;updateButtons();renderMap();}
  function updateButtons() {$('#analyze').disabled=state.analyzing||state.busy||!state.selection.size||!$('#request').value.trim();$('#analyze').textContent=t(state.analyzing?'analyzing':'analyze');$('#save-task').disabled=state.saving||!state.impact||state.impactKey!==draftKey();$('#save-task').textContent=t(state.saving?'saving':'saveTask');$('#refresh').disabled=state.busy;$('#refresh').textContent=t(state.busy?'refreshing':'refresh');$('#request-length').textContent=$('#request').value.length+' / 6000';}
  function applyLanguage() {
    document.documentElement.lang=language;
    document.querySelectorAll('[data-i18n]').forEach(function(node){node.textContent=t(node.dataset.i18n);});
    $('#language').textContent=language==='ko'?'EN':'한국어';$('#language').setAttribute('aria-label',language==='ko'?'Switch language to English':'한국어로 변경');
    $('#search').placeholder=t('search');$('#request').placeholder=t('requestPlaceholder');$('#review-note').placeholder=t('reviewPlaceholder');
    renderProject();renderSelection();renderMap();renderImpact();renderSaved();renderTasks();renderChangePicker();renderReviewPicker();if(state.reviewTask)renderReview(state.reviewTask);if(state.currentTask)renderTaskDetail(state.currentTask);if(state.changeTask)renderChanges(state.changeTask);updateButtons();
  }
  function renderProject() {
    if(!state.map)return;
    const project=state.map.project||{};$('#project-name').textContent=project.name||'Project';document.title=(project.name||'Project')+' · Project Map';
    const git=project.git||{};const parts=[git.branch?t('branch')+' '+git.branch:t('noGit'),t('scanned')+' '+time(state.map.generatedAt)];if(git.dirty)parts.push(t('dirty'));$('#project-meta').textContent=parts.join(' · ');
    const counts=[[arr(state.map.files).length||arr(state.map.nodes).length,'allCount'],[arr(state.map.nodes).filter(function(n){return n.kind==='screen';}).length,'screenCount'],[state.tasks.length,'requestCount']];
    $('#project-stats').replaceChildren();counts.forEach(function(pair){const stat=element('div','project-stat');stat.append(element('strong','',pair[0]),element('span','',t(pair[1])));$('#project-stats').append(stat);});
    const warnings=arr(state.map.warnings);$('#coverage').hidden=!warnings.length;$('#coverage-label').textContent=t('coverage')+' · '+warnings.length;$('#coverage-list').replaceChildren();warnings.forEach(function(w){$('#coverage-list').append(element('li','',metadataText(w)));});
  }
  function renderSelection() {
    const ids=Array.from(state.selection);$('#request-title').textContent=ids.length===1?labelFor(ids[0]):ids.length?(language==='ko'?ids.length+'개 항목 선택':ids.length+' selected areas'):t('selectFirst');
    $('#selection-summary').replaceChildren();ids.forEach(function(id){const chip=element('span','selected-chip',labelFor(id));chip.title=id;$('#selection-summary').append(chip);});
    renderRelations();$('#followup-context').hidden=!state.parentTaskId;$('#followup-label').textContent=state.parentTaskId?t('followupFrom')+' '+state.parentTaskId:'';updateButtons();
  }
  function isRelated(id) {return arr(state.map.edges).some(function(e){return(state.selection.has(e.source)&&e.target===id)||(state.selection.has(e.target)&&e.source===id);});}
  function getVisibleNodes() {
    if (!state.map) return [];
    const search = state.search.toLocaleLowerCase();
    const impacted = new Set(state.impact ? arr(state.impact.writeNodes).concat(arr(state.impact.readNodes), arr(state.impact.verifyNodes)) : []);
    const screenIds = new Set(arr(state.map.nodes).filter(function (node) { return node.kind === 'screen'; }).map(function (node) { return node.id; }));
    const featureRelated = new Set();
    arr(state.map.edges).forEach(function (edge) { if (edge.kind !== 'navigates' && (screenIds.has(edge.source) || screenIds.has(edge.target))) { featureRelated.add(edge.source); featureRelated.add(edge.target); } });
    let visible = arr(state.map.nodes).filter(function (node) {
      if (search) return (String(node.label) + ' ' + String(node.id) + ' ' + arr(node.files).join(' ')).toLocaleLowerCase().includes(search) || state.selection.has(node.id);
      if (state.scope === 'all') return true;
      if (state.connections === 'flow') return node.kind === 'screen' || state.selection.has(node.id);
      return node.kind === 'screen' || featureRelated.has(node.id) || state.selection.has(node.id) || isRelated(node.id) || impacted.has(node.id);
    });
    if (!visible.length && !search && !arr(state.map.nodes).some(function (node) { return node.kind === 'screen'; })) visible = arr(state.map.nodes).slice(0, 24);
    const total = visible.length;
    visible.sort(function (a, b) { return Number(state.selection.has(b.id) || impacted.has(b.id)) - Number(state.selection.has(a.id) || impacted.has(a.id)) || String(a.label).localeCompare(String(b.label)); });
    visible = visible.slice(0, 48);
    $('#visible-count').textContent = visible.length + ' / ' + total + ' ' + t('visibleNodes');
    $('#map-caption').textContent = t(state.connections === 'flow' ? 'flowCaption' : 'implementationCaption') + (total > visible.length ? ' ' + t('graphTruncated') : '');
    return visible;
  }
  function impactState(id) { if (!state.impact) return ''; if (arr(state.impact.writeNodes).includes(id)) return 'write'; if (arr(state.impact.readNodes).includes(id)) return 'read'; if (arr(state.impact.verifyNodes).includes(id)) return 'verify'; return ''; }
  function chooseNode(id, multiple) {
    if (multiple) { if (state.selection.has(id)) state.selection.delete(id); else state.selection.add(id); }
    else state.selection = new Set([id]);
    invalidateDraft();
    renderSelection();
  }
  function edgeLabel(edge) { return t(edge.kind === 'navigates' ? 'navigates' : edge.kind || 'codeRelation'); }
  function graphLayout(nodes, edges, compact) {
    const nodeWidth = compact ? 210 : 216, nodeHeight = compact ? 152 : 116;
    const gapX = compact ? 58 : 66, gapY = compact ? 44 : 50, inset = 30;
    const maxColumns = compact ? 2 : 3;
    const ids = new Set(nodes.map(function (node) { return node.id; }));
    const outgoing = new Map(), incoming = new Map();
    nodes.forEach(function (node) { outgoing.set(node.id, []); incoming.set(node.id, 0); });
    edges.forEach(function (edge) { if (ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target) { outgoing.get(edge.source).push(edge.target); incoming.set(edge.target, incoming.get(edge.target) + 1); } });
    const rank = new Map();
    const ordered = nodes.slice().sort(function (a, b) { return Number(b.route === '/') - Number(a.route === '/') || incoming.get(a.id) - incoming.get(b.id) || String(a.label).localeCompare(String(b.label)); });
    const roots = ordered.filter(function (node) { return incoming.get(node.id) === 0; }).concat(ordered);
    roots.forEach(function (root) {
      if (rank.has(root.id)) return;
      rank.set(root.id, 0);
      const queue = [root.id];
      for (let i = 0; i < queue.length; i++) outgoing.get(queue[i]).forEach(function (target) { if (!rank.has(target)) { rank.set(target, Math.min(maxColumns - 1, rank.get(queue[i]) + 1)); queue.push(target); } });
    });
    // Disconnected files remain visibly separate; no edge is invented for layout.
    const columns = Math.max(1, ...Array.from(rank.values()).map(function (value) { return value + 1; }));
    const rows = Array(columns).fill(0), positions = new Map();
    ordered.sort(function (a, b) { return rank.get(a.id) - rank.get(b.id) || String(a.label).localeCompare(String(b.label)); }).forEach(function (node) {
      const column = rank.get(node.id), row = rows[column]++;
      positions.set(node.id, { x: inset + column * (nodeWidth + gapX), y: inset + row * (nodeHeight + gapY), width: nodeWidth, height: nodeHeight });
    });
    return { positions: positions, width: inset * 2 + columns * nodeWidth + Math.max(0, columns - 1) * gapX, height: Math.max(280, inset * 2 + Math.max(0, ...rows) * (nodeHeight + gapY) - gapY) };
  }
  function svgElement(tag, attributes) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes || {}).forEach(function (entry) { node.setAttribute(entry[0], entry[1]); });
    return node;
  }
  function paintEdges(svg, edges, layout, prefix) {
    svg.replaceChildren();
    svg.setAttribute('viewBox', '0 0 ' + layout.width + ' ' + layout.height);
    svg.style.width = layout.width + 'px'; svg.style.height = layout.height + 'px';
    const defs = svgElement('defs');
    const colors = { flow:'var(--accent)', code:'var(--read-line)', add:'var(--write-line)', remove:'var(--danger)' };
    Object.entries(colors).forEach(function (entry) {
      const marker = svgElement('marker', { id:prefix + '-' + entry[0], viewBox:'0 0 10 10', refX:'9', refY:'5', markerWidth:'7', markerHeight:'7', orient:'auto-start-reverse' });
      marker.append(svgElement('path', { d:'M 0 0 L 10 5 L 0 10 z', fill:entry[1] })); defs.append(marker);
    });
    svg.append(defs);
    edges.forEach(function (edge, index) {
      const a = layout.positions.get(edge.source), b = layout.positions.get(edge.target);
      if (!a || !b) return;
      let curve;
      if (a.x === b.x) {
        const x = a.x + a.width, y1 = a.y + a.height / 2, y2 = b.y + b.height / 2;
        const bend = x + 22 + (index % 3) * 7;
        if (edge.source === edge.target) curve = 'M ' + x + ' ' + (y1 - 20) + ' C ' + (bend + 12) + ' ' + (y1 - 55) + ', ' + (bend + 12) + ' ' + (y1 + 55) + ', ' + x + ' ' + (y1 + 20);
        else curve = 'M ' + x + ' ' + y1 + ' C ' + bend + ' ' + y1 + ', ' + bend + ' ' + y2 + ', ' + x + ' ' + y2;
      } else {
        const forward = a.x < b.x, x1 = forward ? a.x + a.width : a.x, x2 = forward ? b.x : b.x + b.width;
        const y1 = a.y + a.height / 2, y2 = b.y + b.height / 2, bend = (x1 + x2) / 2;
        curve = 'M ' + x1 + ' ' + y1 + ' C ' + bend + ' ' + y1 + ', ' + bend + ' ' + y2 + ', ' + x2 + ' ' + y2;
      }
      const action = edge.action || edge.plannedAction || edge.changeStatus;
      const style = action === 'remove' || action === 'deleted' ? 'remove' : action === 'add' || action === 'added' ? 'add' : edge.kind === 'navigates' ? 'flow' : 'code';
      const path = svgElement('path', { d:curve, fill:'none', stroke:colors[style], 'stroke-width':edge.kind === 'navigates' ? '2' : '1.6', 'marker-end':'url(#' + prefix + '-' + style + ')', 'data-edge-kind':edge.kind || 'reference', 'data-edge-action':action || '', class:'graph-edge' });
      if (style === 'remove') path.setAttribute('stroke-dasharray', '3 5');
      else if (edge.kind !== 'navigates') path.setAttribute('stroke-dasharray', '7 4');
      const title = svgElement('title');
      title.textContent = labelFor(edge.source) + ' → ' + labelFor(edge.target) + ' · ' + edgeLabel(edge) + (edge.evidence ? ' · ' + metadataText(edge.evidence) : '');
      path.append(title); svg.append(path);
    });
  }
  function fillGraph(target, svg, graph, options) {
    target.replaceChildren();
    const effects = new Map(arr(options.effects).map(function (effect) { return [effect.nodeId, effect]; }));
    const sourceNodes = arr(graph && graph.nodes), limit = options.main ? 48 : 28;
    const nodes = sourceNodes.slice().sort(function (a, b) { return Number(effects.has(b.id)) - Number(effects.has(a.id)); }).slice(0, limit);
    const ids = new Set(nodes.map(function (node) { return node.id; }));
    const availableEdges = arr(graph && graph.edges).filter(function (edge) { return ids.has(edge.source) && ids.has(edge.target); });
    const edges = availableEdges.slice(0, 160);
    const layout = graphLayout(nodes, edges, !options.main);
    target.style.width = layout.width + 'px'; target.style.height = layout.height + 'px';
    paintEdges(svg, edges, layout, options.prefix);
    nodes.forEach(function (node) {
      const position = layout.positions.get(node.id), effect = effects.get(node.id);
      const card = element(options.main ? 'button' : 'article', options.main ? 'map-node graph-node' : 'graph-node comparison-node');
      card.dataset.nodeId = node.id;
      card.style.left = position.x + 'px'; card.style.top = position.y + 'px'; card.style.width = position.width + 'px'; card.style.height = position.height + 'px';
      if (options.main) {
        card.type = 'button'; card.dataset.state = impactState(node.id); card.setAttribute('aria-pressed', String(state.selection.has(node.id)));
        card.setAttribute('oai-annotatable', String(node.label || node.id));
        card.setAttribute('oai-annotation-metadata', JSON.stringify({ projectMapNode:String(node.id).slice(0,256), snapshotId:String(state.map.snapshotId || '').slice(0,256) }));
        card.addEventListener('click', function (event) { chooseNode(node.id, $('#multi-select').checked || event.shiftKey); });
        state.nodeElements.set(node.id, card);
      }
      const plannedRemoval = node.action === 'remove' && options.phase === 'before';
      const changed = plannedRemoval ? 'deleted' : node.changeStatus || (node.planned && options.phase === 'expected' ? 'planned' : '');
      card.dataset.change = changed;
      if (effect && options.phase === 'expected') card.dataset.change = options.newIds && options.newIds.has(node.id) ? 'added' : 'planned';
      const top = element('span', 'node-top'); top.append(element('i', 'node-kind'), element('span', 'node-name', node.label || node.id));
      card.append(top);
      const path = element('span', 'node-path', node.route || arr(node.files)[0] || node.id); path.title = arr(node.files).join('\n') || node.id; card.append(path);
      if (!options.main) {
        const detail = effect && options.phase === 'expected' ? effect.expected : effect && options.phase === 'actual' ? effect.change : node.description;
        if (detail) { const note = element('p', 'node-effect', detail); note.title = detail; card.append(note); }
      }
      const bottom = element('span', 'node-bottom');
      let label = options.main && state.selection.has(node.id) ? t('selected') : options.main && card.dataset.state ? t(card.dataset.state) : changed === 'planned' ? t('plannedChange') : changed ? t(changed) : t(node.kind || 'module');
      if (options.phase === 'expected' && options.newIds && options.newIds.has(node.id)) label = t('plannedAdd');
      if (plannedRemoval) label = t('plannedRemove');
      bottom.append(element('span', 'node-relation', label));
      if (options.phase === 'actual' && effect) bottom.append(statusBadge(['passed','failed'].includes(effect.status) ? effect.status : 'not_run'));
      else bottom.append(element('span', '', node.confidence === 'confirmed' ? t('confirmed') : t('inferred')));
      card.append(bottom); target.append(card);
    });
    return { nodes:nodes.length, totalNodes:sourceNodes.length, edges:edges.length, totalEdges:arr(graph && graph.edges).length, limited:sourceNodes.length > nodes.length || arr(graph && graph.edges).length > edges.length || !!(graph && graph.truncated) };
  }
  function renderDiagram(target, graph, options) {
    target.replaceChildren();
    if (!graph || !arr(graph.nodes).length) { target.append(element('p', 'graph-empty muted small', t(graph ? 'emptyGraph' : 'graphUnavailable'))); return; }
    const canvas = element('div', 'diagram-canvas'), svg = svgElement('svg', { class:'connections', 'aria-hidden':'true' }), nodes = element('div', 'diagram-nodes');
    canvas.append(svg, nodes); target.append(canvas);
    const count = fillGraph(nodes, svg, graph, options);
    const caption = element('p', 'graph-count small muted', count.nodes + ' / ' + count.totalNodes + ' ' + t('visibleNodes') + ' · ' + count.edges + ' / ' + count.totalEdges + ' ' + t('visibleEdges'));
    if (count.limited) caption.append(document.createTextNode(' · ' + t('graphTruncated')));
    target.append(caption);
  }
  function renderMap() {
    if (!state.map) return;
    state.nodeElements = new Map();
    const visible = getVisibleNodes(), ids = new Set(visible.map(function (node) { return node.id; }));
    const edges = arr(state.map.edges).filter(function (edge) { return ids.has(edge.source) && ids.has(edge.target) && (state.connections === 'flow' ? edge.kind === 'navigates' : edge.kind !== 'navigates'); });
    state.mainGraph = { nodes:visible, edges:edges };
    $('#map-empty').hidden = !!visible.length; $('#map-empty').textContent = t(arr(state.map.nodes).length ? 'nothingFound' : 'nothingIndexed');
    const count = fillGraph($('#map-columns'), $('#connections'), state.mainGraph, { main:true, prefix:'main' });
    $('#connection-count').textContent = count.edges + ' / ' + count.totalEdges + ' ' + t('visibleEdges');
    if (!edges.length && state.connections === 'flow') $('#map-caption').textContent = t('noFlow');
    if (count.limited) $('#map-caption').textContent += ' ' + t('graphTruncated');
  }
  function scheduleDraw() { if (state.drawFrame) cancelAnimationFrame(state.drawFrame); state.drawFrame = requestAnimationFrame(function () { state.drawFrame = null; if (state.view === 'structure') renderMap(); }); }
  function renderRelations() {
    const target = $('#relations-list'); target.replaceChildren();
    $('#relations').hidden = !state.selection.size;
    const edges = arr(state.map && state.map.edges).filter(function (edge) { return state.selection.has(edge.source) || state.selection.has(edge.target); });
    $('#relations-title').textContent = t('detailsForNode') + ' · ' + edges.length;
    Array.from(state.selection).forEach(function (id) { const node = arr(state.map && state.map.nodes).find(function (candidate) { return candidate.id === id; }); if (!node) return; const info = element('div', 'relation-feature'); info.append(element('strong', '', node.label || id), element('p', 'mono', arr(node.files).join(', ') || id)); if (node.description) info.append(element('p', '', node.description)); target.append(info); });
    if (!edges.length) target.append(element('p', 'small muted', t('noRelations')));
    edges.slice(0, 40).forEach(function (edge) {
      const relation = element('details', 'relation-item'), heading = element('summary');
      const outgoing = state.selection.has(edge.source), other = outgoing ? edge.target : edge.source;
      heading.append(element('span', 'relation-direction', t(outgoing ? 'outgoing' : 'incoming') + ' · ' + edgeLabel(edge)), element('span', '', labelFor(edge.source) + ' → ' + labelFor(edge.target)));
      relation.append(heading, element('p', 'relation-evidence', t('evidence') + ': ' + metadataText(edge.evidence || edge.reason || t('inferred'))));
      const select = element('button', 'text-button', labelFor(other) + ' →'); select.type = 'button'; select.addEventListener('click', function () { chooseNode(other, false); }); relation.append(select); target.append(relation);
    });
    if (edges.length > 40) target.append(element('p', 'small muted', t('graphTruncated')));
  }
  function renderImpact() {
    const impact=state.impact;$('#impact-panel').hidden=!impact;$('#idle-guidance').hidden=!!impact||!!state.savedTask;if(!impact)return;
    $('#impact-scopes').replaceChildren();[['write','writeFiles'],['read','readFiles'],['verify','verifyFiles']].forEach(function(pair){const files=arr(impact[pair[1]]);const details=element('details','scope-block');const heading=element('summary','scope-heading');const mark=element('i','scope-mark');mark.style.background='var(--'+(pair[0]==='verify'?'verify':pair[0])+'-line)';heading.append(mark,element('strong','',t(pair[0])),element('span','scope-count',files.length));details.append(heading);const list=element('ul','scope-files');if(!files.length)list.append(element('li','',t('noFile')));files.forEach(function(path){list.append(element('li','',path));});details.append(list);$('#impact-scopes').append(details);});
    $('#impact-reasons').replaceChildren();arr(impact.reasons).slice(0,5).forEach(function(reason){$('#impact-reasons').append(element('p','',metadataText(reason)));});
    const warnings=arr(impact.warnings);$('#impact-warnings').hidden=!warnings.length;$('#impact-warnings ul').replaceChildren();warnings.forEach(function(w){$('#impact-warnings ul').append(element('li','',metadataText(w)));});
    $('#parallel-candidates').replaceChildren();const candidates=arr(impact.parallelCandidates);if(!candidates.length)$('#parallel-candidates').append(element('p','',t('noParallel')));else candidates.slice(0,3).forEach(function(candidate){const item=element('p','parallel-candidate');item.append(element('strong','',candidate.label||labelFor(candidate.nodeId)),document.createTextNode(' · '+(candidate.reason||t('parallelCaution'))));$('#parallel-candidates').append(item);});if(candidates.length)$('#parallel-candidates').append(element('p','',t('parallelCaution')));updateButtons();
  }
  function taskPrompt(task) {
    const projectRoot = task.projectRoot || (state.map && state.map.project && state.map.project.root) || '';
    const approved = task.status === 'approved' || task.status === 'running';
    let instruction;
    if (language === 'ko') {
      instruction = task.status === 'completed' ? '저장한 작업 ' + task.id + '의 실제 변경과 기능별 검증 결과를 확인해줘.'
        : approved ? '저장한 작업 ' + task.id + '의 승인된 계획을 확인하고 작업을 이어가줘. 계획 버전 ' + (task.plan && task.plan.revision || '') + '의 승인과 최신 코드를 재확인한 뒤 해당 범위에서 진행해줘.'
        : task.status === 'awaiting_review' ? '저장한 작업 ' + task.id + '의 제안된 계획을 지도로 보여줘. 사용자의 계획 승인 전에는 코드 수정을 시작하지 말아줘.'
        : '저장한 작업 ' + task.id + '를 읽고 먼저 변경 계획을 작성해줘. 최신 코드와 영향 범위를 확인해 기능별 변경 내용·기대 동작·검증 기준을 담은 계획을 저장한 뒤 Project Map의 계획 검토 화면으로 돌아와줘. 사용자가 계획을 승인할 때까지 코드 수정은 시작하지 말아줘.';
      return '$project-map\n\n' + instruction + '\n프로젝트: ' + projectRoot + '\n\n요청: ' + task.request + (task.lastReview && task.lastReview.decision === 'revise' ? '\n계획 수정 의견: ' + task.lastReview.note : '') + '\n\n기존 변경사항을 보존하고 저장된 작업 상태를 확인해줘. 작업 완료 시 실제 변경과 기능별 검증 결과를 기록하고, 검사하지 않은 동작은 미확인으로 남겨줘.';
    }
    instruction = task.status === 'completed' ? 'Review actual changes and feature verification for saved task ' + task.id + '.'
      : approved ? 'Read the approved plan for saved task ' + task.id + ' and continue. Recheck approval of revision ' + (task.plan && task.plan.revision || '') + ' and current source before working within its scope.'
      : task.status === 'awaiting_review' ? 'Show the proposed plan for saved task ' + task.id + ' in Project Map. Wait for the user to approve the plan before changing code.'
      : 'Read saved task ' + task.id + ' and first prepare a change plan. Check current source and scope, then save feature-level changes, expected behavior, and verification criteria. Return to Project Map for plan review. Wait for user approval before editing code.';
    return '$project-map\n\n' + instruction + '\nProject: ' + projectRoot + '\n\nRequest: ' + task.request + (task.lastReview && task.lastReview.decision === 'revise' ? '\nPlan revision feedback: ' + task.lastReview.note : '') + '\n\nPreserve existing changes and inspect saved task state. At completion, record actual changes and feature-level checks; leave untested behavior unverified.';
  }
  function renderSaved() {$('#saved-panel').hidden=!state.savedTask;if(!state.savedTask)return;$('#saved-id').textContent=state.savedTask.id;$('#saved-status').textContent=state.savedTask.status==='queued'?t('savedNote'):t('currentStatus')+' '+t(state.savedTask.status||'unknown');$('#saved-prompt').textContent=taskPrompt(state.savedTask);$('#annotate').hidden=typeof document.oai?.annotation?.request!=='function';$('#saved-panel').setAttribute('oai-annotatable',t('taskPrompt')+' '+state.savedTask.id);}
  async function copyPrompt(text, fallback) {try{if(!navigator.clipboard||!navigator.clipboard.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText(text);showNotice(t('copied'));}catch(_){if(fallback){const details=fallback.closest('details');if(details)details.open=true;const selection=window.getSelection();const range=document.createRange();range.selectNodeContents(fallback);selection.removeAllRanges();selection.addRange(range);}showNotice(t('copyFailed'));}}
  async function previewImpact(event) {event.preventDefault();if(!state.selection.size||!$('#request').value.trim()){showError(new Error(t('selectAndRequest')));return;}clearError();state.analyzing=true;updateButtons();const key=draftKey();try{const impact=await api('/api/impact','POST',JSON.parse(key));if(key!==draftKey())return;state.impact=impact;state.impactKey=key;state.savedTask=null;renderImpact();renderSaved();renderMap();}catch(error){showError(error);}finally{state.analyzing=false;updateButtons();}}
  async function saveTask() {
    if (!state.impact || state.impactKey !== draftKey()) return;
    clearError(); state.saving = true; updateButtons(); const key = draftKey();
    try {
      const task = await api('/api/tasks', 'POST', Object.assign(JSON.parse(key), { snapshotId:state.impact.snapshotId || state.map.snapshotId }, state.parentTaskId ? { parentTaskId:state.parentTaskId } : {}));
      if (key === draftKey()) { state.savedTask = task; renderSaved(); }
      state.reviewTask = task;
      await reloadTasks(false); setView('review'); renderReview(task); showNotice(t('savedNotice'));
    } catch (error) { showError(error); } finally { state.saving = false; updateButtons(); }
  }
  function statusBadge(status) {const badge=element('span','status',t(status||'unknown'));badge.dataset.status=status||'unknown';return badge;}
  function renderTasks() {
    $('#task-count').textContent=state.tasks.length;$('#tasks-empty').hidden=!!state.tasks.length;$('#task-list').replaceChildren();renderProject();
    state.tasks.forEach(function(task){const card=element('button','task-card');card.type='button';card.setAttribute('aria-pressed',String(state.currentTask&&state.currentTask.id===task.id));const top=element('span','task-card-top');top.append(element('span','mono',task.id),statusBadge(task.status));card.append(top,element('p','',String(task.request||'').slice(0,190)),element('p','task-card-meta',time(task.createdAt)+' · '+arr(task.nodeIds).map(labelFor).slice(0,3).join(' / ')));card.addEventListener('click',function(){loadTaskDetail(task.id);});$('#task-list').append(card);});
  }
  function renderTaskDetail(task) {
    const target=$('#task-detail');target.hidden=!task;if(!task)return;target.replaceChildren();target.append(statusBadge(task.status),element('h3','',t('taskPrompt')),element('p','mono muted small',task.id),element('p','task-request',task.request||''));
    target.append(element('p','task-metadata',t('created')+' '+time(task.createdAt)+' · '+t('updated')+' '+time(task.updatedAt)));
    const scope=arr(task.impact&&task.impact.writeFiles);target.append(element('p','task-metadata',t('taskScope')+' · '+scope.length));const list=element('ul','scope-files');scope.forEach(function(path){list.append(element('li','',path));});target.append(list);
    const prompt=element('pre','prompt',taskPrompt(task));const copy=element('button','button',t('copyPrompt'));copy.type='button';copy.addEventListener('click',function(){copyPrompt(taskPrompt(task),prompt);});target.append(copy);
    if(task.result){const changes=element('button','button',t('viewChanges'));changes.type='button';changes.addEventListener('click',function(){state.changeTask=task;setView('changes');renderChangePicker();$('#change-task').value=task.id;renderChanges(task);});target.append(changes);if(task.result.summary)target.append(element('p','task-metadata',task.result.summary));}
    const review=element('button','button',t('openReview'));review.type='button';review.addEventListener('click',function(){state.reviewTask=task;setView('review');renderReviewPicker();$('#review-task').value=task.id;renderReview(task);});target.append(review,prompt);
  }
  async function loadTaskDetail(id) {clearError();try{state.currentTask=await api('/api/tasks/'+encodeURIComponent(id));renderTasks();renderTaskDetail(state.currentTask);}catch(error){showError(error);}}
  async function reloadTasks(showMessage) {
    const response = await api('/api/tasks');
    state.tasks = arr(response.tasks || response).sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    renderTasks(); renderChangePicker(); renderReviewPicker();
    if (state.currentTask) { const known = state.tasks.find(function (task) { return task.id === state.currentTask.id; }); if (known && known.updatedAt !== state.currentTask.updatedAt) { state.currentTask = await api('/api/tasks/' + encodeURIComponent(known.id)); renderTaskDetail(state.currentTask); } }
    if (state.savedTask) { const saved = state.tasks.find(function (task) { return task.id === state.savedTask.id; }); if (saved && saved.updatedAt !== state.savedTask.updatedAt) { state.savedTask = saved; renderSaved(); } }
    if (state.reviewTask) { const known = state.tasks.find(function (task) { return task.id === state.reviewTask.id; }); if (known && known.updatedAt !== state.reviewTask.updatedAt) await loadReview(known.id); }
    else if (state.view === 'review' && $('#review-task').value) await loadReview($('#review-task').value);
    if (state.view === 'changes' && $('#change-task').value) { const changed = state.tasks.find(function (task) { return task.id === $('#change-task').value; }); if (!state.changeTask || changed && changed.updatedAt !== state.changeTask.updatedAt) await loadChanges($('#change-task').value); }
    if (showMessage) showNotice(language === 'ko' ? '작업 상태를 확인했습니다.' : 'Task status refreshed.');
  }
  function renderReviewPicker() {
    const picker = $('#review-task'), previous = state.reviewTask && state.reviewTask.id || picker.value;
    picker.replaceChildren(); picker.disabled = !state.tasks.length;
    $('#review-count').textContent = state.tasks.filter(function (task) { return task.status === 'awaiting_review'; }).length;
    if (!state.tasks.length) { const option = element('option', '', t('noReviewTitle')); option.value = ''; picker.append(option); $('#review-empty').hidden = false; $('#review-content').hidden = true; return; }
    state.tasks.forEach(function (task) { const option = element('option', '', t(task.status) + ' · ' + String(task.request || task.id).slice(0, 65)); option.value = task.id; picker.append(option); });
    picker.value = state.tasks.some(function (task) { return task.id === previous; }) ? previous : state.tasks[0].id;
  }
  function taskNodeLabel(task, id) {
    const nodes = arr(task.plan && task.plan.afterGraph && task.plan.afterGraph.nodes).concat(arr(task.result && task.result.afterGraph && task.result.afterGraph.nodes), arr(task.result && task.result.beforeGraph && task.result.beforeGraph.nodes));
    const node = nodes.find(function (candidate) { return candidate.id === id; }); return node ? node.label || id : labelFor(id);
  }
  function renderEffects(target, effects, task, actual) {
    target.replaceChildren();
    if (!effects.length) { target.append(element('p', 'small muted', t('noOutcomes'))); return; }
    effects.forEach(function (effect) {
      const card = element('article', 'effect-card'); card.dataset.nodeId = effect.nodeId;
      const heading = element('div', 'effect-heading'); heading.append(element('h4', '', taskNodeLabel(task, effect.nodeId)));
      if (actual) heading.append(statusBadge(['passed','failed'].includes(effect.status) ? effect.status : 'not_run'));
      else heading.append(element('span', 'expectation-tag', t('expectedLabel')));
      card.append(heading, element('p', 'effect-path mono', effect.nodeId));
      const list = element('dl', 'effect-fields');
      [['changeLabel','change'],['expectedEffect','expected'],['verifyEffect','verify']].forEach(function (pair) { const row = element('div'); row.append(element('dt', '', t(pair[0])), element('dd', '', effect[pair[1]] || t('unknown'))); list.append(row); });
      card.append(list);
      if (actual) {
        const checks = element('div', 'effect-checks'); checks.append(element('strong', '', t('actualVerification')));
        if (!arr(effect.checks).length) checks.append(element('p', '', t('notRun')));
        arr(effect.checks).forEach(function (check) { const row = element('p'); row.append(element('span', '', check.name || check.command || t('unknown')), statusBadge(check.status || 'not_run')); if (check.detail || check.details) row.append(element('span', 'check-detail', metadataText(check.detail || check.details))); checks.append(row); });
        card.append(checks);
      }
      target.append(card);
    });
  }
  function renderReview(task) {
    $('#review-empty').hidden = !!task; $('#review-content').hidden = !task;
    if (!task) return;
    const overview = $('#review-overview'); overview.replaceChildren();
    const title = element('div'); title.append(element('h3', '', task.request || task.id), element('p', 'mono muted small', task.id)); overview.append(title, statusBadge(task.status));
    const step = task.status === 'completed' ? 3 : ['approved','running','blocked'].includes(task.status) ? 2 : task.status === 'awaiting_review' ? 1 : 0;
    $('#review-workflow').replaceChildren();
    ['stepRequest','stepPlan','stepWork','stepResult'].forEach(function (key, index) { const item = element('li', '', t(key)); item.dataset.step = index < step ? 'past' : index === step ? 'current' : 'future'; if (index === step) item.setAttribute('aria-current', 'step'); $('#review-workflow').append(item); });
    const plan = task.plan, showPlan = plan && task.status !== 'queued';
    $('#plan-content').hidden = !showPlan; $('#review-waiting').hidden = task.status === 'awaiting_review';
    const waitingTitle = task.status === 'approved' ? 'approvedWaiting' : task.status === 'queued' ? 'planWaiting' : task.status;
    const waitingNote = task.status === 'approved' ? 'approvedWaitingNote' : task.status === 'running' ? 'runningNote' : task.status === 'blocked' ? 'blockedNote' : task.status === 'completed' ? 'completedNote' : 'planWaitingNote';
    $('#review-waiting-title').textContent = t(waitingTitle); $('#review-waiting-note').textContent = t(waitingNote);
    if (task.lastReview && task.lastReview.decision === 'revise' && task.status === 'queued') $('#review-waiting-note').append(element('p', 'revision-feedback', task.lastReview.note));
    if (showPlan) {
      $('#plan-summary').textContent = plan.summary; $('#plan-version').textContent = t('planRevision') + ' ' + plan.revision + ' · ' + t('planSnapshot') + ' ' + String(plan.snapshotId || '').slice(0, 12);
      const newIds = new Set(arr(plan.newNodes).map(function (node) { return node.id; }));
      renderDiagram($('#plan-before-graph'), plan.beforeGraph, { prefix:'plan-before', phase:'before', effects:arr(plan.effects), newIds:newIds });
      renderDiagram($('#plan-after-graph'), plan.afterGraph, { prefix:'plan-after', phase:'expected', effects:arr(plan.effects), newIds:newIds });
      renderEffects($('#plan-effects'), arr(plan.effects), task, false);
      $('#plan-files-summary').textContent = t('planScope') + ' · ' + arr(plan.writeFiles).length;
      $('#plan-files').replaceChildren(); arr(plan.writeFiles).forEach(function (file) { $('#plan-files').append(element('li', '', file)); });
    }
    $('#review-actions').hidden = task.status !== 'awaiting_review' || !plan;
    $('#approve-plan').disabled = state.reviewing; $('#revise-plan').disabled = state.reviewing;
    $('#review-handoff').textContent = t('reviewHandoff'); $('#review-prompt').textContent = taskPrompt(task);
    $('#review-result').hidden = !task.result;
  }
  async function loadReview(id) {
    if (!id) return;
    const selected = $('#review-task').value;
    try {
      const task = await api('/api/tasks/' + encodeURIComponent(id));
      if ($('#review-task').value !== selected && $('#review-task').value !== id) return;
      if (!state.reviewTask || state.reviewTask.id !== task.id) $('#review-note').value = '';
      state.reviewTask = task; $('#review-task').value = task.id; renderReview(task);
    } catch (error) { showError(error); }
  }
  async function decidePlan(decision) {
    const task = state.reviewTask, plan = task && task.plan;
    if (!plan || task.status !== 'awaiting_review' || state.reviewing) return;
    const note = $('#review-note').value.trim();
    if (decision === 'revise' && !note) { showError(new Error(t('revisionRequired'))); $('#review-note').focus(); return; }
    clearError(); state.reviewing = true; renderReview(task);
    try {
      const updated = await api('/api/tasks/' + encodeURIComponent(task.id) + '/review', 'POST', { decision:decision, revision:plan.revision, snapshotId:plan.snapshotId, note:note });
      if (state.reviewTask && state.reviewTask.id === updated.id) { state.reviewTask = updated; $('#review-note').value = ''; renderReview(updated); }
      await reloadTasks(false); showNotice(t(decision === 'approve' ? 'approveSaved' : 'revisionSaved'));
    } catch (error) {
      if (error.code === 'STALE_SNAPSHOT') { await loadReview(task.id); showError(new Error(t('reviewFailed'))); } else showError(error);
    } finally { state.reviewing = false; if (state.reviewTask) renderReview(state.reviewTask); }
  }
  function resultTasks(){return state.tasks.filter(function(task){return task.status==='completed'||task.result;});}
  function renderChangePicker() {
    const tasks=resultTasks();const picker=$('#change-task');const previous=state.changeTask&&state.changeTask.id||picker.value;picker.replaceChildren();picker.disabled=!tasks.length;if(!tasks.length){const option=element('option','',t('noChangesTitle'));option.value='';picker.append(option);$('#change-empty').hidden=false;$('#change-content').hidden=true;return;}
    tasks.forEach(function(task){const option=element('option','',String(task.request||task.id).slice(0,65)+' · '+time(task.createdAt));option.value=task.id;picker.append(option);});if(tasks.some(function(task){return task.id===previous;}))picker.value=previous;else picker.value=tasks[0].id;
  }
  function normalizeChanges(result) {
    const raw=result&&result.changes;let values=[];if(Array.isArray(raw))values=raw;else if(raw&&typeof raw==='object'){['added','modified','deleted'].forEach(function(status){arr(raw[status]).forEach(function(value){values.push(typeof value==='string'?{path:value,status:status}:Object.assign({},value,{status:status}));});});}
    return values.map(function(change){if(typeof change==='string')return {path:change,status:'modified'};const type=String(change.status||change.type||change.change||change.kind||'modified').toLowerCase();return Object.assign({},change,{path:change.path||change.file||change.filePath||'unknown',status:type==='a'||type==='added'?'added':type==='d'||type==='removed'||type==='deleted'?'deleted':'modified'});});
  }
  function renderChanges(task) {
    const result=task&&task.result;$('#change-empty').hidden=!!result;$('#change-content').hidden=!result;if(!result)return;const changes=normalizeChanges(result);const outside=arr(result.outOfScopeFiles);const counts={added:0,modified:0,deleted:0};changes.forEach(function(c){counts[c.status]++;});
    const summary=$('#change-summary');summary.replaceChildren();const heading=element('div');heading.append(element('h3','',String(task.request||task.id)),element('p','',result.summary||t('actualChanges')));summary.append(heading);const stats=element('div','change-counts');['added','modified','deleted'].forEach(function(type){const stat=element('div');stat.append(element('strong','',counts[type]),element('span','',t(type)));stats.append(stat);});summary.append(stats);
    const beforeGraph=result.beforeGraph,afterGraph=result.afterGraph;
    $('#actual-graphs').hidden=!(beforeGraph||afterGraph);
    if(beforeGraph||afterGraph){renderDiagram($('#result-before-graph'),beforeGraph,{prefix:'result-before',phase:'before',effects:arr(result.outcomes)});renderDiagram($('#result-after-graph'),afterGraph,{prefix:'result-after',phase:'actual',effects:arr(result.outcomes)});}
    $('#outcomes-panel').hidden=false;renderEffects($('#outcomes'),arr(result.outcomes),task,true);
    const coverage=result.comparisonCoverage;$('#change-coverage').hidden=false;$('#comparison-status').textContent=t('sourceComparison')+' '+t(!coverage?'unknownComparison':coverage.completeWithinScannedSources?'completeComparison':'partialComparison');$('#change-coverage').dataset.incomplete=String(!coverage||!coverage.completeWithinScannedSources);$('#comparison-counts').textContent=coverage?[['before',coverage.before],['after',coverage.after]].map(function(pair){const value=pair[1]||{};return t(pair[0])+' '+(value.scannedFiles??'—')+' '+t('scannedFiles')+' · '+(value.skippedFiles??'—')+' '+t('skippedFiles');}).join(' / '):'';const comparisonWarnings=arr(result.warnings);$('#change-warnings').hidden=!comparisonWarnings.length;$('#change-warnings ul').replaceChildren();comparisonWarnings.forEach(function(warning){$('#change-warnings ul').append(element('li','',metadataText(warning)));});
    $('#change-alert').hidden=!outside.length;$('#change-alert').textContent=language==='ko'?'계획한 수정 후보 밖에서 '+outside.length+'개 파일이 변경되었습니다. 변경 이유를 확인하세요.':outside.length+' file(s) changed outside the planned edit scope. Review the reason for the expansion.';
    const nodes=arr(result.afterNodes).concat(arr(result.beforeNodes));$('#change-board').replaceChildren();['added','modified','deleted'].forEach(function(type){const column=element('section','change-column');column.append(element('h3','',t(type)+' · '+counts[type]));const items=changes.filter(function(change){return change.status===type;});if(!items.length)column.append(element('p','muted small empty-change',t('noFile')));items.forEach(function(change){const record=nodes.find(function(node){return node.id===change.path||arr(node.files).includes(change.path);});const card=element('article','change-card');card.dataset.change=type;card.append(element('strong','',record&&record.label||change.path.split('/').pop()),element('p','mono',change.path));if(outside.includes(change.path))card.append(element('span','out-of-scope',t('outOfScope')));column.append(card);});$('#change-board').append(column);});
    const checks=$('#checks');checks.replaceChildren();const verification=result.verificationStatus||'not_run';const statusLine=element('div','check-row');statusLine.append(element('strong','',t('checksStatus')),statusBadge(verification));checks.append(statusLine);let checkValues=arr(result.checks);if(!Array.isArray(result.checks)&&result.checks&&typeof result.checks==='object'){checkValues=Object.entries(result.checks).map(function(pair){return typeof pair[1]==='object'?Object.assign({name:pair[0]},pair[1]):{name:pair[0],status:String(pair[1])};});}
    if(!checkValues.length)checks.append(element('p','muted small',t('notRun')));checkValues.forEach(function(check){const value=typeof check==='string'?{name:check,status:'reported'}:check;const row=element('div','check-row');row.append(element('span','',value.name||value.command||value.description||t('unknown')),statusBadge(value.status||'reported'));if(value.detail||value.details||value.result||value.message)row.append(element('span','',metadataText(value.detail||value.details||value.result||value.message)));checks.append(row);});
  }
  async function loadChanges(id) {if(!id)return;clearError();try{const task=await api('/api/tasks/'+encodeURIComponent(id));state.changeTask=task;renderChanges(task);}catch(error){showError(error);}}
  function setView(view) {
    state.view = view;
    ['structure','review','changes','tasks'].forEach(function (name) { $('#view-' + name).hidden = name !== view; const tab = $('#tab-' + name); tab.classList.toggle('is-active', name === view); if (name === view) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current'); });
    if (view === 'structure') scheduleDraw();
    if (view === 'review') { renderReviewPicker(); if (state.reviewTask) renderReview(state.reviewTask); if ($('#review-task').value) loadReview($('#review-task').value); }
    if (view === 'changes') { renderChangePicker(); if ($('#change-task').value) loadChanges($('#change-task').value); }
    if (view === 'tasks' && state.tasks.length && !state.currentTask) loadTaskDetail(state.tasks[0].id);
  }
  async function continueTask() {
    const task = state.changeTask;
    if (!task || state.busy) return;
    clearError(); state.busy = true; $('#continue-task').disabled = true;
    try {
      state.map = await api('/api/refresh', 'POST');
      const existing = new Set(arr(state.map.nodes).map(function (node) { return node.id; }));
      const relevant = arr(task.result && task.result.outcomes).map(function (outcome) { return outcome.nodeId; }).concat(arr(task.nodeIds));
      state.selection = new Set(relevant.filter(function (id) { return existing.has(id); }));
      state.parentTaskId = task.id; state.search = ''; $('#search').value = ''; $('#request').value = ''; $('#intent').value = task.intent || 'behavior';
      invalidateDraft(); renderProject(); renderSelection(); setView('structure'); $('#request').focus();
      showNotice(t(state.selection.size ? 'followupReady' : 'followupEmpty'));
    } catch (error) { showError(error); } finally { state.busy = false; $('#continue-task').disabled = false; updateButtons(); }
  }
  async function refreshMap() {if(state.busy)return;state.busy=true;clearError();updateButtons();try{state.map=await api('/api/refresh','POST');const ids=new Set(arr(state.map.nodes).map(function(n){return n.id;}));state.selection=new Set(Array.from(state.selection).filter(function(id){return ids.has(id);}));invalidateDraft();renderProject();renderSelection();showNotice(t('refreshDone'));}catch(error){showError(error);}finally{state.busy=false;updateButtons();}}
  $('#language').addEventListener('click',function(){language=language==='ko'?'en':'ko';try{localStorage.setItem('project-map-language',language);}catch(_){}applyLanguage();});
  $('#refresh').addEventListener('click',refreshMap);
  document.querySelectorAll('[data-view]').forEach(function(button){button.addEventListener('click',function(){setView(button.dataset.view);});});
  document.querySelectorAll('[data-scope]').forEach(function(button){button.addEventListener('click',function(){state.scope=button.dataset.scope;document.querySelectorAll('[data-scope]').forEach(function(other){other.setAttribute('aria-pressed',String(other===button));});renderMap();});});
  $('#search').addEventListener('input',function(){state.search=$('#search').value.trim();renderMap();});
  $('#clear-selection').addEventListener('click',function(){state.selection.clear();invalidateDraft();renderSelection();});
  $('#request').addEventListener('input',function(){invalidateDraft();});$('#intent').addEventListener('change',invalidateDraft);$('#request-form').addEventListener('submit',previewImpact);$('#save-task').addEventListener('click',saveTask);
  $('#copy-prompt').addEventListener('click',function(){if(state.savedTask)copyPrompt(taskPrompt(state.savedTask),$('#saved-prompt'));});
  $('#annotate').addEventListener('click',function(){if(!state.savedTask)return;const annotation=document.oai&&document.oai.annotation;if(!annotation||typeof annotation.request!=='function'){showNotice(t('annotationUnavailable'));return;}try{const result=annotation.request($('#saved-panel'),{initialComment:('$project-map '+(language==='ko'?(state.savedTask.status==='approved'?'승인된 계획으로 작업을 이어가줘: ':'저장한 요청의 계획을 작성하고 검토 화면으로 돌아와줘. 승인 전에는 수정하지 말아줘: '):(state.savedTask.status==='approved'?'Continue the approved plan: ':'Prepare a plan, return for review, and wait for approval before edits: '))+state.savedTask.id).slice(0,230),metadata:{projectMapTask:String(state.savedTask.id).slice(0,256),snapshotId:String(state.savedTask.snapshotId||state.map.snapshotId||'').slice(0,256),projectRoot:String(state.map.project.root||'').slice(0,256)}});showNotice(t(result&&result.accepted?'annotationAccepted':'annotationDeclined'));}catch(error){showNotice(t('annotationDeclined'));}});
  document.querySelectorAll('[data-connections]').forEach(function (button) { button.addEventListener('click', function () { state.connections = button.dataset.connections; document.querySelectorAll('[data-connections]').forEach(function (other) { other.setAttribute('aria-pressed', String(other === button)); }); renderMap(); }); });
  $('#clear-followup').addEventListener('click', function () { state.parentTaskId = null; invalidateDraft(); renderSelection(); });
  $('#open-review').addEventListener('click', function () { if (state.savedTask) { state.reviewTask = state.savedTask; setView('review'); } });
  $('#review-task').addEventListener('change', function () { loadReview($('#review-task').value); });
  $('#review-copy').addEventListener('click', function () { if (state.reviewTask) copyPrompt(taskPrompt(state.reviewTask), $('#review-prompt')); });
  $('#review-refresh').addEventListener('click', function () { clearError(); reloadTasks(true).catch(showError); });
  $('#approve-plan').addEventListener('click', function () { return decidePlan('approve'); });
  $('#revise-plan').addEventListener('click', function () { return decidePlan('revise'); });
  $('#review-result').addEventListener('click', function () { if (state.reviewTask && state.reviewTask.result) { state.changeTask = state.reviewTask; setView('changes'); renderChangePicker(); $('#change-task').value = state.reviewTask.id; renderChanges(state.reviewTask); } });
  $('#continue-task').addEventListener('click', continueTask);
  $('#reload-tasks').addEventListener('click',function(){clearError();reloadTasks(true).catch(showError);});$('#change-task').addEventListener('change',function(){loadChanges($('#change-task').value);});
  if(typeof ResizeObserver==='function')new ResizeObserver(scheduleDraw).observe($('#map-stage'));else window.addEventListener('resize',scheduleDraw);
  window.addEventListener('error',function(event){if(event.error)showError(event.error);});
  async function start() {applyLanguage();try{const session=await api('/api/session');state.token=session.token;const results=await Promise.all([api('/api/map'),api('/api/tasks')]);state.map=results[0];state.tasks=arr(results[1].tasks||results[1]).sort(function(a,b){return String(b.createdAt).localeCompare(String(a.createdAt));});const first=arr(state.map.nodes).find(function(node){return node.kind==='screen';})||arr(state.map.nodes)[0];if(first)state.selection.add(first.id);applyLanguage();}catch(error){showError(error);$('#project-meta').textContent=language==='ko'?'로컬 서버의 실행 상태와 프로젝트 위치를 확인하세요.':'Check the local server and project path.';}}
  start();
  setInterval(function(){if(document.visibilityState==='visible'&&state.map)reloadTasks(false).catch(function(){});},10000);
})();
