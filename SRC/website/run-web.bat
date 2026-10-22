@echo off
setlocal

cd /d "%~dp0"

where php >nul 2>&1
if errorlevel 1 (
    echo [ERROR] PHP was not found in PATH.
    echo Install PHP and add its folder to PATH, then try again.
    pause
    exit /b 1
)

set "WEB_URL=http://127.0.0.1:8000"

echo ========================================
echo Starting website only
echo Website: %WEB_URL%
echo Press Ctrl+C to stop the website.
echo ========================================

start "" "%WEB_URL%"
php -S 127.0.0.1:8000 -t "%~dp0"

if errorlevel 1 (
    echo.
    echo [ERROR] Could not start the PHP web server.
    echo Check that port 8000 is available and PHP has the PDO MySQL extension enabled.
    pause
    exit /b 1
)
