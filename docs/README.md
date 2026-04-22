# Static Export Preview

이 폴더는 로컬 Flask 앱이 렌더한 현재 화면을 정적으로 export한 결과입니다.

## 중요한 점

- GitHub Pages는 `app.py`를 실행하지 않습니다.
- 따라서 이 폴더는 현재 화면의 HTML 스냅샷과 `static/` 자산만 담습니다.
- 버튼, 폼 제출, 로그인, DB 저장, API 호출은 Pages에서 실제 동작하지 않을 수 있습니다.

## 갱신 방법

```bash
python scripts/export_static_preview.py
```

## 내보낸 페이지

- `index.html` ← `/`
- `login.html` ← `/login`
- `dashboard.html` ← `/dashboard`
- `crm.html` ← `/crm`
- `crm-report.html` ← `/crm/report`
- `reports.html` ← `/reports`
- `film-report.html` ← `/reports/film`
- `database-map.html` ← `/database-map`
- `outreach-resources.html` ← `/outreach/resources`
- `task-flow.html` ← `/task-flow`
- `task-projects.html` ← `/task-projects`
- `website-crawler.html` ← `/website-crawler`
- `image-to-sheet.html` ← `/image-to-sheet`
- `sdlff-films.html` ← `/sdlff/films`
- `dgc-films.html` ← `/dgc/films`
- `inventory.html` ← `/inventory`
- `users.html` ← `/users`
- `outreach.html` ← `/outreach`
- `outreach-dgc.html` ← `/outreach?category=dgc`
- `outreach-sdlff.html` ← `/outreach?category=sdlff`
- `outreach-custom.html` ← `/outreach?category=custom`
- `outreach-manage.html` ← `/outreach/manage`
- `outreach-sdlff-2027.html` ← `/outreach?category=sdlff&year=2027`
- `outreach-workspace.html` ← `/outreach/project/6`
- `outreach-manage-detail.html` ← `/outreach/manage/6`
- `dgc-film-detail.html` ← `/dgc/films/31`
- `sdlff-film-detail.html` ← `/sdlff/films/150`
- `crm-person-detail.html` ← `/crm/people/PER001`
- `crm-org-detail.html` ← `/crm/orgs/ORG001`
