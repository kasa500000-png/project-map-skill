# Project Map

**코드 대신 기능을 선택하고, 변경의 영향을 확인하며 Codex와 개발하세요.**

[English / detailed legacy UI](README.en.md) · [개선 기록](docs/four-phase-upgrade.md) · [설정](skills/project-map/references/config.md)

화면·기능 지도 → 자연어 요청 → Codex의 변경 계획 → 사용자 검토 → 코드 작업 → 실제 변경과 검증 확인.

## 설치

Git, Node.js 20 이상, 로컬 앱 프로젝트를 열 수 있는 Codex가 필요합니다.

```bash
git clone https://github.com/kasa500000-png/project-map-skill.git
cd project-map-skill
node scripts/install.mjs
```

앱 프로젝트를 Codex에서 열고 요청하세요.

```text
$project-map 현재 프로젝트의 작업 지도를 열어줘.
내가 선택한 기능의 변경 계획을 먼저 보여주고, 확인 후 작업해줘.
```

기본 설치는 `~/.agents/skills/project-map`에 링크를 만듭니다. 기존의 다른
스킬을 덮어쓰지 않습니다. 특정 앱에만 설치하려면 `--project "/path/to/app"`,
링크가 불가능하면 `--copy`를 사용합니다. 복사 설치는 업데이트 후 다시 설치합니다.
다른 사람도 각자의 프로젝트에 동일하게 설치할 수 있습니다.

## 기능 단위로 이해하기

기본 작업실은 화면 하나와 관련 구현을 묶고, 여러 기능이 공유하는 코드를 별도로
표시합니다. 기능 하나에 여러 파일이 연결될 수 있으며 파일 하나도 여러 기능에서
사용될 수 있습니다. 기능 선택은 진입 파일을 지정하는 것이지 모든 연결 파일의
수정을 허용하는 것이 아닙니다.

지도에서 이름을 바꾸면 `project-map.config.json`에 저장됩니다. Codex에 요청해
`features` 설정으로 여러 파일을 업무 기능 하나로 묶을 수도 있습니다. 자세한
예제는 [개선 기록](docs/four-phase-upgrade.md)을 확인하세요.

화면 이동과 공통 구현 사용은 구분합니다. 연결선이 없다는 것은 영향이 없다는
보장이 아닙니다. 원본 파일 중심의 상세 화면과 영어 UI는 `/legacy`에 남겨 뒀습니다.

## 요청과 실제 실행은 다릅니다

기능을 누르고 변경 내용을 입력해 요청을 저장한 뒤, 제공된 요청문을 Codex에
전달합니다. Codex가 소스를 확인해 현재/예상 지도를 게시하면 사용자가 승인하거나
수정 의견을 남깁니다. 코드가 바뀌거나 계획이 수정되면 이전 승인을 재사용하지 않습니다.

일반 브라우저의 저장·승인 버튼만으로 종료된 Codex 세션이 시작되지는 않습니다.
활성 세션이 기다리지 않는다면 복사한 요청문을 Codex 대화에 전달하세요.
수정 완료와 검증 통과를 구분하고, 확인하지 않은 결과는 미확인으로 표시합니다.

## 예제와 명령

```bash
npm run demo
node skills/project-map/scripts/project-map.mjs --help
npm run check
npm test
```

예제는 소스 분석용 가상 앱입니다. 실행 가능한 완성 Next.js 앱이 아닙니다.
지도 실행에는 npm 패키지, 별도 서버 계정, 데이터베이스나 API 키가 필요 없습니다.

## 업데이트 / 제거

```bash
git pull --ff-only
# 복사 설치에서만 재실행:
node scripts/install.mjs --copy
# 제거:
node scripts/install.mjs --uninstall
```

프로젝트 설치를 선택했다면 동일한 `--project` 경로를 사용하세요. 설치기의 제거는
사용자가 수정한 복사본을 삭제하지 않습니다. 원본 앱과 작업 기록도 지우지 않습니다.

## 범위와 개인정보

JS/TS와 React·Next.js·Expo 관례 중심의 정적 분석입니다. 동적 이동, 외부 서비스,
데이터베이스 규칙 등은 추가 확인이 필요합니다. 지도는 최신 코드 탐색을 돕는
인덱스이지 전체 동작의 증명이 아닙니다.

앱 저장소에서는 `.project-map/`를 `.gitignore`에 추가하세요. 생성된 지도·요청은
로컬 정보이며 공개 저장소에 올리지 마세요. 서버는 루프백에서만 동작하고 원본
앱 코드를 자동 업로드하거나 분석 텔레메트리를 수집하지 않습니다. Codex에 보낸
코드·요청에는 사용하는 Codex 환경의 정책이 적용됩니다.

[MIT 라이선스](LICENSE) · [기여 안내](CONTRIBUTING.md) · [검증 기록](docs/validation.md)
