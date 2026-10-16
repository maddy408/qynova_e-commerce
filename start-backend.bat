@echo off
setlocal
cd /d %~dp0backend

set "PHP_BIN=php"
where php >nul 2>nul
if %errorlevel% neq 0 (
    if exist "C:\xampp\php\php.exe" (
        set "PHP_BIN=C:\xampp\php\php.exe"
    ) else (
        echo [ERROR] PHP executable was not found in PATH or at C:\xampp\php\php.exe.
        pause
        exit /b 1
    )
)

echo Starting Backend API on http://0.0.0.0:8080...
echo Using PHP: %PHP_BIN%
"%PHP_BIN%" -S 0.0.0.0:8080 -t public public/index.php
pause

