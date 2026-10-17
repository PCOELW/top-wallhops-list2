# Top Wallhops — Dark Table Edition

사이트를 **사용자가 보낸 검은색 랭킹 표 디자인**에 맞춰 다시 제작한 실제 웹사이트 코드입니다. 이미지 목업이 아닙니다.

## 들어 있는 기능

- 어두운 네이비 배경, 간결한 상단 메뉴, 한 화면에 많은 항목을 볼 수 있는 순위 테이블
- 왼쪽 테이블을 선택하면 오른쪽 상세 패널의 순위/제목/난이도/티어/베파러/제작자/스타일/링크가 변경
- **선택 강조 = 더 진한 자주색 계열. 파란색 선택 효과 없음.**
- Headbump / Mixed / Precision / Camera Control / Unique 등의 스타일별 단색 배지
- Quality S/A/B/C/D가 **스프레드시트에 있을 때** 해당 등급별 단색 배지
- PC / Mobile 독립된 목록과 검색, 난이도/스타일 필터, 정렬
- 반응형 화면. 좁은 화면에서는 순위표를 가로로 스크롤, 상세 패널은 아래로 이동
- 원본 파일을 수정할 필요 없이 GitHub Actions가 5분마다 원본 Google Sheets 내용을 불러오도록 구성 (실제 실행 시각은 지연될 수 있음)

## 설치 / 기존 GitHub 저장소 업데이트

1. 압축을 풀고 **폴더 안의 파일 및 폴더 전체**(`index.html`, `app.js`, `styles.css`, `config.js`, `data/`, `scripts/`)를 저장소 최상위에 업로드하세요. 기존 동일 이름 파일을 교체합니다.
2. `.github/workflows/update-and-deploy.yml`은 숨김 폴더 업로드가 되지 않는다면 GitHub의 **Add file → Create new file**에서 위 경로 그대로 생성하고, ZIP 안의 워크플로 파일 내용을 복사해 저장하세요. 이미 존재하면 그대로 유지해도 됩니다. 업데이트 주기는 5분입니다.
3. GitHub **Settings → Pages → Build and deployment → Source: GitHub Actions**로 설정하세요.
4. GitHub 저장소 상단 **Actions → Update wallhops and deploy site → Run workflow**를 클릭합니다.
5. 작업이 완료되면 Pages 사이트를 새로고침하세요. 주소는 보통 `https://아이디.github.io/저장소명/`입니다.

**이 사이트는 Google Apps Script 없이 작동합니다.** 반드시 원본 시트가 **로그인하지 않은 GitHub Actions 실행기에도 공개적으로 열람/다운로드 가능**해야 합니다. 보기 전용 권한이 있어도 계정 로그인이 필요한 비공개 스프레드시트는 이 방식으로 읽을 수 없습니다. 읽을 수 없다면 GitHub Actions의 `Fetch public Google Sheet` 단계가 실패합니다.

## 데이터 필드

| 원본 열 | 사이트 표시 |
| --- | --- |
| A | 순위 |
| B | 이름 |
| C | 난이도 점수 |
| D | 티어 |
| E | 베파러 |
| F | 제작자 |
| G | 게임 링크 |
| H | 영상 링크 |
| I | Gameplay Style & Length |
| J (선택) | Attribute — 없으면 I열 문구에서 자동 분류 |
| K (선택) | Quality — 없으면 `—` 표시 |

**중요:** 제공된 원본 이미지에서 확인되는 열은 A~I입니다. Quality 등급은 이 데이터에 없습니다. 따라서 실제 동기화 시 등급을 임의로 만들어 표시하지 않고 `—`로 표시합니다. 처음 연동 전에 표시되는 PC 상위 10개 미리보기만 참고 이미지에 맞춘 **예시 색상/등급**을 표시합니다. 이 미리보기 등급은 원본의 공식 데이터가 아닙니다.

자동 분류한 Attribute는 공식 시트의 등급이 아니라 **스타일 설명을 기준으로 한 사이트용 분류**입니다. J열이 존재하면 그 값을 우선 사용합니다. 만약 원본 시트에서 J/K열을 이미 다른 용도로 쓴다면 `scripts/sync_sheets.py`의 `COLS` 설정을 변경하세요.

## 색 변경

모든 색은 `styles.css` 첫 줄의 CSS 변수와 아래 배지 클래스에서 수정할 수 있습니다. 선택된 행은 `--selected: #251b2b`, 선택 테두리는 `--selected-line: #845571`, 메뉴 선택 색은 `#844a6a`입니다. 색은 모두 단색이며 애니메이션/그라데이션을 사용하지 않습니다.

## 참고

- 오른쪽 Roblox/Video 버튼은 원본에서 실제 URL을 읽었을 때만 활성화됩니다.
- 원본의 `[GAME]`와 `[Link]` 형태의 숨겨진 하이퍼링크는 **공개 XLSX 다운로드 성공 시에만** 복구할 수 있습니다. CSV 대체 연결에서는 숨겨진 링크가 누락될 수 있습니다.
- Github Actions의 최소 주기 5분은 보장된 실행 주기가 아니며 혼잡 시 지연될 수 있습니다.
- 원본 스프레드시트의 수정 권한이나 소유권은 필요 없습니다. 원본이 공개 열람 가능한 경우에만 자동 연동됩니다.

로컬 확인: 프로젝트 폴더에서 `python -m http.server 8000`을 실행하고 `http://localhost:8000`을 열어보세요.
