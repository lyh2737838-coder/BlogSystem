@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   启动 BlogSystem (MySQL)...
echo.
node server/index.js
pause
