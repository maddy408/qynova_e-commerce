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

echo Checking if port 8080 is in use...
netstat -ano | findstr :8080 | findstr LISTENING >nul 2>nul
if %errorlevel% equ 0 (
    echo.
    echo ======================================================================
    echo [WARNING] Port 8080 is already in use!
    echo Checking for conflicting Apache (httpd.exe)...
    taskkill /F /IM httpd.exe >nul 2>nul
    if %errorlevel% equ 0 (
        echo [INFO] Stopped conflicting Apache process. Port 8080 is now free.
    ) else (
        echo If XAMPP Apache is running, please STOP Apache in XAMPP Control Panel.
        echo Apache is NOT needed (this project runs its own PHP server).
        echo Only MySQL should be started in XAMPP.
    )
    echo ======================================================================
    echo.
)

echo Starting Backend API on http://0.0.0.0:8080...
echo Using PHP: %PHP_BIN%
"%PHP_BIN%" -S 0.0.0.0:8080 -t public public/index.php
pause

