# HR Man-Month Dashboard (Firebase + GitHub Pages)

간단한 바닐라 웹 기반 인력 투입 현황/Man-Month/인력 관리 대시보드입니다.
서버 없이 **Firebase Authentication + Firestore** 만 사용하며 GitHub Pages로 배포됩니다.

## 구조
- `public/index.html` : SPA 엔트리
- `public/js/*` : 모듈 스크립트(ESM)
- `public/css/styles.css` : 달력 레이아웃 보조

## Firestore 컬렉션
- `employees` : 인력
- `assignments` : 배치(역할/업무/기간)
- `presets/default` : 역할/업무 프리셋
- `holidays` : 휴일(YYYY-MM-DD)

## 보안
1. Firebase Auth: Google 로그인만 허용
2. Firestore Rules: 허용 도메인(ahnlab.com) 사용자만 read/write 가능
3. GitHub Pages Authorized Domains에 `*.github.io` 추가

## 배포
- GitHub Pages -> main 브랜치에서 루트 혹은 `/public` 폴더 서빙
- Firebase Console -> Auth/Firestore 설정 + Rules 적용

## CSV 포맷
- employees: `id,name,team,rank,eval,joined,left`
- assignments: `id,employeeId,role,task,startDate,endDate`
- holidays: `id,date,name`

> id는 비워도 됩니다(자동 생성). 기존 컬렉션은 업로드 시 **교체**됩니다.