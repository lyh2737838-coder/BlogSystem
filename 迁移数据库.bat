@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   建库 / 建表 / 导入数据...
echo.
node server/migrate.js
pause
