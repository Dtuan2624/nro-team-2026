@echo off
setlocal EnableDelayedExpansion

cd /d "%~dp0"

echo ========================================
echo [CLEAN] Removing old build...
echo ========================================

if exist "build" (
    rmdir /s /q "build"
)

if exist "20.jar" (
    del /f /q "20.jar"
)

mkdir "build\classes"

echo ========================================
echo [BUILD] Creating classpath...
echo ========================================

set "CP="

for %%F in ("lib\*.jar") do (
    set "CP=!CP!;%%~F"
)

if "!CP!"=="" (
    echo [ERROR] No JAR files found in lib!
    pause
    exit /b 1
)

echo [BUILD] Libraries found.

echo ========================================
echo [BUILD] Collecting Java sources...
echo ========================================

dir /s /b "src\*.java" > "sources.txt"

if errorlevel 1 (
    echo [ERROR] Cannot find Java source files!
    del /q "sources.txt" 2>nul
    pause
    exit /b 1
)

echo ========================================
echo [BUILD] Compiling Java 17...
echo ========================================

javac ^
    -encoding UTF-8 ^
    -source 17 ^
    -target 17 ^
    -cp "!CP!" ^
    -processorpath "!CP!" ^
    -d "build\classes" ^
    @sources.txt

if errorlevel 1 (
    echo.
    echo ========================================
    echo [ERROR] COMPILE FAILED!
    echo ========================================
    del /q "sources.txt" 2>nul
    pause
    exit /b 1
)

del /q "sources.txt"

echo ========================================
echo [BUILD] Copying resources...
echo ========================================

if exist "src\META-INF" (
    xcopy "src\META-INF" "build\classes\META-INF\" /E /I /Y >nul
)

echo ========================================
echo [BUILD] Creating 20.jar...
echo ========================================

jar cfe "20.jar" "nro.models.server.ServerManager" -C "build\classes" .

if errorlevel 1 (
    echo.
    echo ========================================
    echo [ERROR] JAR BUILD FAILED!
    echo ========================================
    pause
    exit /b 1
)

echo.
echo ========================================
echo [BUILD] SUCCESS
echo [BUILD] 20.jar created successfully
echo ========================================

echo.
echo [START] Starting Admin Panel...
start "" /D "admin-desktop" cmd /c "npm start"

echo.
echo [START] Starting Game Server...
echo.

java -server -Dfile.encoding=UTF-8 -cp "20.jar!CP!" nro.models.server.ServerManager

pause