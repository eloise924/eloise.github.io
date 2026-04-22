# GitHub Pages Preview

이 폴더는 Flask 운영 앱과 분리된 GitHub Pages용 정적 미리보기입니다.

## 포함 파일

- `index.html`: 정적 미리보기 메인 페이지
- `assets/preview.css`: 미리보기 전용 스타일
- `assets/preview.js`: 탭 전환 스크립트
- `images/`: 로고 이미지
- `.nojekyll`: GitHub Pages 처리 안정화용 파일

## 중요한 점

- `docs/`는 정적 사이트만 포함합니다.
- `app.py`는 GitHub Pages 미리보기에 필요하지 않습니다.
- 실제 로그인, DB, Gmail, 업로드 기능은 미리보기에서 동작하지 않습니다.

## 배포 방식

이 저장소는 GitHub Actions로 `docs/`만 Pages에 배포하는 구조를 권장합니다.

- 워크플로 파일: [`.github/workflows/pages.yml`](/Users/ichaehyeon/Desktop/macsd_tool/.github/workflows/pages.yml)
- 전체 배포 메모: [`PREVIEW_DEPLOY.md`](/Users/ichaehyeon/Desktop/macsd_tool/PREVIEW_DEPLOY.md)

GitHub 저장소 설정에서는 `Pages > Source`를 `GitHub Actions`로 선택하면 됩니다.

이 폴더는 상대 경로만 사용하므로 `https://<user>.github.io/<repo>/` 형태에서도 동작합니다.
