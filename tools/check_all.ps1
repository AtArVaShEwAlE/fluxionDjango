python manage.py makemigrations --check --dry-run 2>&1 | Select-Object -Last 1
python tools\test_routes.py 2>$null | Select-String 'FAIL|checks,'
python tools\test_query.py 2>$null | Select-String 'FAIL|checks,'
python tools\test_options.py 2>$null | Select-String 'FAIL|checks,'
python tools\test_mobile.py 2>$null | Select-String 'FAIL|checks,'
Select-String -Path templates\*.html,templates\*\*.html -Pattern 'width="28"height|<pathd|<circlecx|<rectx|<polygonp|%\}/\*\*'
git status --short
