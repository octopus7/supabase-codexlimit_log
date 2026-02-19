# 세션 인서트 가이드 (한국어)

## 목적
다른 대화에서도 동일하게, 로컬 Codex 세션 로그(`~/.codex/sessions`)를 읽어 `usage_logs` 테이블에 스냅샷을 삽입하기 위한 작업 기준 문서입니다.

## 전제 조건
- `config.js`에 아래 값이 설정되어 있어야 함
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- Supabase에 로그인 가능한 계정(email/password)이 있어야 함
- `usage_logs` 스키마(현재 프로젝트 기준)
  - `logged_at`
  - `used_5h`, `limit_5h`
  - `used_7d`, `limit_7d`

## 고정 규칙
- DB 작업 요청이 없는 경우 절대 insert 하지 않음
- 요청이 `조회만`이면 insert/update/delete 금지
- `% left`가 주어지면 아래 규칙으로 변환
  - `used = 100 - left`
  - `limit = 100`
- 시간은 저장 시 UTC 기준 `timestamptz`로 처리

## 작업 유형
1. 최신 1건 insert
- 로컬 세션에서 `limit_id=codex` 최신 이벤트 1개만 사용
- `5h left`, `7d left`를 `used/limit`으로 변환 후 1행 삽입

2. 최근 N일 변동분 insert
- 최근 N일 이벤트 중 퍼센트(`5h left`, `7d left`)가 바뀐 시점만 추출
- 이미 DB에 있는 `logged_at`(UTC 초 단위)은 제외 후 없는 것만 insert

3. 수동 스냅샷 insert
- 사용자가 준 timestamp/% 값을 그대로 변환해서 삽입

## 검증 기준
- 삽입 후 아래를 반드시 보고
  - `INSERTED_COUNT`
  - 마지막 삽입 row (`logged_at`, `used_5h/limit_5h`, `used_7d/limit_7d`)
- 브라우저 반영 필요 시 `Ctrl+F5` 안내

## 다른 대화에서 복붙할 요청문
아래 문장을 그대로 붙여넣으면 됩니다.

```text
로컬 Codex 세션(~/.codex/sessions) 기준으로 작업해줘.
1) limit_id=codex 최신 1건만 usage_logs에 insert
2) % left 값을 used/limit으로 변환 (used=100-left, limit=100)
3) 결과로 INSERTED_COUNT와 inserted row를 보여줘
4) 파일 수정은 하지 말고 DB 작업만 해줘
```

변동분만 넣고 싶을 때:

```text
최근 14일 Codex 세션(limit_id=codex)에서 5h/7d 퍼센트가 변동된 시점만 추출해서,
이미 DB에 있는 logged_at(UTC 초 단위)은 제외하고 없는 row만 insert 해줘.
결과로 후보 개수, 중복 제외 개수, INSERTED_COUNT를 보여줘.
파일 수정은 하지 말고 DB 작업만 해줘.
```
