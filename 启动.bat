@echo off
REM 关键: 顶部立刻 pause,这样无论后面任何一行炸了你都能看到窗口
title BlogSystem 启动器
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  ============================================
echo            BlogSystem 启动器
echo  ============================================
echo.

set "PORT=3000"
set "MYSQL_SERVICE=MySQL80"
set "NPM_REGISTRY=https://registry.npmmirror.com"
set "URL=http://localhost:%PORT%"

REM ---------- 1. Node.js ----------
echo  [..] 检查 Node.js
where node >nul 2>nul
if errorlevel 1 goto :NO_NODE
for /f "delims=" %%v in ('node -v') do set "NODE_VER=%%v"
echo  [OK] Node.js %NODE_VER%

REM ---------- 2. .env ----------
echo  [..] 检查 .env
if exist .env goto :ENV_OK
if exist .env.example (copy .env.example .env >nul) else goto :NO_ENV
echo  [!]  已从 .env.example 复制 .env
:ENV_OK
echo  [OK] .env 已就绪

REM ---------- 3. node_modules ----------
echo  [..] 检查依赖
if exist node_modules\express goto :DEPS_OK
echo  [!]  缺少依赖,正在 npm install (淘宝镜像)...
call npm install --registry=%NPM_REGISTRY%
if errorlevel 1 goto :NPM_FAIL
:DEPS_OK
echo  [OK] 依赖完整

REM ---------- 4. MySQL ----------
echo  [..] 检查 %MYSQL_SERVICE% 服务
sc query %MYSQL_SERVICE% 2>nul | findstr /C:"RUNNING" >nul
if not errorlevel 1 goto :MYSQL_OK
echo  [!]  %MYSQL_SERVICE% 未运行,尝试启动...
net start %MYSQL_SERVICE% >nul 2>nul
if errorlevel 1 goto :MYSQL_FAIL
:MYSQL_OK
echo  [OK] %MYSQL_SERVICE% 运行中

REM ---------- 5. 迁移 ----------
echo  [..] 应用数据库迁移
call node server/migrate.js >"%TEMP%\blog_migrate.log" 2>&1
if errorlevel 1 goto :MIGRATE_FAIL
echo  [OK] 数据库就绪

REM ---------- 6. 释放端口 ----------
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>nul

REM ---------- 7. 等服务就绪再开浏览器 ----------
start "BlogSystem-Browser" /min cmd /c "node server\wait-and-open.js %PORT% 30000"

echo.
echo  --------------------------------------------
echo   服务地址: %URL%
echo   默认账号: admin / admin123    lyh / user123
echo   浏览器将在服务就绪后自动打开
echo   按 Ctrl+C 停止
echo  --------------------------------------------
echo.

REM ---------- 8. 启动服务 ----------
node server/index.js
echo.
echo  [服务已退出,退出码=%errorlevel%]
goto :END

:NO_NODE
echo  [X] 未检测到 Node.js,请安装 https://nodejs.org/zh-cn/
goto :END

:NO_ENV
echo  [X] 缺少 .env 和 .env.example
goto :END

:NPM_FAIL
echo  [X] 依赖安装失败
goto :END

:MYSQL_FAIL
echo  [X] 启动 %MYSQL_SERVICE% 失败 (可能需要管理员权限)
echo      请右键启动器选择"以管理员身份运行",或手动启动 MySQL
goto :END

:MIGRATE_FAIL
echo  [X] 迁移失败,日志:
type "%TEMP%\blog_migrate.log"
goto :END

:END
echo.
echo  按任意键关闭窗口...
pause >nul
