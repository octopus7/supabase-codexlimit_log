# Codex Usage Tracker (Supabase + Static Web)

EN: This project is a static web app for recording Codex usage snapshots and viewing trends for:
- `5h` usage
- `7d` usage

KR: 이 프로젝트는 Codex 사용량 스냅샷을 기록하고 아래 추이를 보는 정적 웹앱입니다:
- `5h` 사용량
- `7d` 사용량

EN: It uses Supabase for:
- ID(email)/password authentication
- PostgreSQL storage
- Row Level Security (RLS)

KR: Supabase 사용 범위:
- ID(이메일)/비밀번호 인증
- PostgreSQL 저장소
- RLS(Row Level Security)

## 1) Supabase Setup / Supabase 설정

1. EN: Create a Supabase project.  
   KR: Supabase 프로젝트를 생성합니다.
2. EN: In `Authentication > Providers`, enable `Email`.  
   KR: `Authentication > Providers`에서 `Email`을 활성화합니다.
3. EN: In `Authentication > Users`, create one user account (email/password) for this app.  
   KR: `Authentication > Users`에서 이 앱에 사용할 계정 1개(email/password)를 만듭니다.
4. EN: In `SQL Editor`, run `supabase/schema.sql`.  
   KR: `SQL Editor`에서 `supabase/schema.sql`을 실행합니다.
5. EN: In `Project Settings > API`, copy:  
   KR: `Project Settings > API`에서 아래 값을 확인합니다:
- `Project URL`
- `anon public key`
6. EN: Create local config file from template:  
   KR: 템플릿으로 로컬 설정 파일을 생성합니다:

```powershell
Copy-Item config.example.js config.js
```

7. EN: Open `config.js` and set:  
   KR: `config.js`에 아래 값을 설정합니다:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## 2) Run Locally / 로컬 실행

EN: Because this is a static page, use any static server.  
KR: 정적 페이지이므로 아무 정적 서버나 사용할 수 있습니다.

Option A (Python):

```bash
python -m http.server 8080
```

EN: Then open `http://localhost:8080`  
KR: 이후 `http://localhost:8080`으로 접속

Option B (VS Code Live Server):
- EN: Open the folder and run Live Server on `index.html`.
- KR: 폴더를 열고 `index.html`에서 Live Server를 실행합니다.

## 3) Usage / 사용 방법

1. EN: Open `index.html` and sign in to view:
- Percentage chart
- Recent snapshot table

   KR: `index.html`에서 로그인 후 아래 내용을 조회합니다:
- 퍼센트 그래프
- 최근 스냅샷 테이블

2. EN: Open `snapshot.html` separately to add snapshots:
- Snapshot time
- 5h used / 5h limit
- 7d used / 7d limit

   KR: `snapshot.html`에서 스냅샷을 수동 입력합니다:
- 스냅샷 시간
- 5h used / 5h limit
- 7d used / 7d limit

## 4) Security Notes / 보안 참고

- EN: The app uses Supabase `anon` key on the client by design.  
  KR: 이 앱은 구조상 클라이언트에서 Supabase `anon` 키를 사용합니다.
- EN: Data access is protected by RLS policies in `supabase/schema.sql`.  
  KR: 데이터 접근은 `supabase/schema.sql`의 RLS 정책으로 보호됩니다.
- EN: Each user can only access their own rows.  
  KR: 각 사용자는 자신의 row만 접근할 수 있습니다.
- EN: `config.js` is git-ignored for local-only values. Commit `config.example.js` only.  
  KR: `config.js`는 로컬 전용이며 git ignore 처리됩니다. `config.example.js`만 커밋하세요.
- EN: Running `supabase/schema.sql` recreates `usage_logs` and clears existing rows.  
  KR: `supabase/schema.sql` 실행 시 `usage_logs` 테이블이 재생성되어 기존 데이터가 삭제됩니다.
