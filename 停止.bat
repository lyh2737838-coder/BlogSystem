@echo off
chcp 65001 >nul
title BlogSystem 停止服务

set PORT=3000

echo.
echo  ============================================
echo       停止 BlogSystem 服务 ^(端口 %PORT%^)
echo  ============================================
echo.

set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    echo   端口 %PORT% 被 PID %%a 占用，正在结束...
    taskkill /F /PID %%a >nul 2>nul
    if not errorlevel 1 (
        echo   [OK] 已结束 PID %%a
        set FOUND=1
    )
)

if "%FOUND%"=="0" (
    echo   端口 %PORT% 没有占用进程，无需停止。
)

echo.
pause
