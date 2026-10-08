@echo off
cd /d %~dp0backend
echo Starting Qynova Backend API on http://localhost:8080...
php -S localhost:8080 -t public public/index.php 2>nul || "%LOCALAPPDATA%\Microsoft\WinGet\Packages\PHP.PHP.8.2_Microsoft.Winget.Source_8wekyb3d8bbwe\php.exe" -S localhost:8080 -t public public/index.php
pause
