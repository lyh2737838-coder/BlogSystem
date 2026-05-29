@echo off
chcp 65001 >nul
cd /d "%~dp0"
title BlogSystem 数据库迁移

echo.
echo  ============================================
echo       BlogSystem 数据库迁移工具
echo  ============================================
echo.
echo   作用：
echo     - 首次使用：建库 / 建表 / 导入演示数据
echo     - 已有数据：补建新增的表和列 ^(幂等，安全^)
echo.
echo   不会清空已有数据。
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo  [X] 未检测到 Node.js
    pause
    exit /b 1
)

if not exist node_modules\mysql2 (
    echo  [!]  缺少依赖，先运行  启动.bat  完成 npm install
    pause
    exit /b 1
)

node server/migrate.js
echo.
pause
