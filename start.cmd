@echo off
chcp 65001 >nul
title 紫禁城 · 中轴 —— 本地预览
cd /d "%~dp0"

echo.
echo   紫禁城 · 中轴  —— 正在启动本地预览服务器
echo.

rem 该作品使用 ES Module，浏览器不允许 file:// 页面加载模块，
rem 所以必须通过一个静态服务器访问（这正是双击 index.html 打不开的原因）。

where python >nul 2>nul
if %errorlevel%==0 (
  set "SRV=python -m http.server 8080 --bind 127.0.0.1"
  goto run
)

where py >nul 2>nul
if %errorlevel%==0 (
  set "SRV=py -m http.server 8080 --bind 127.0.0.1"
  goto run
)

echo   没有找到 Python。请任选一种：
echo     1) 安装 Python 后重新双击本文件
echo     2) 在项目目录执行 npx serve .
echo     3) 在项目目录执行 node tools\serve.mjs . 8080
echo.
pause
exit /b 1

:run
start "" http://127.0.0.1:8080/
echo   地址：http://127.0.0.1:8080/
echo   关闭本窗口即停止预览。
echo.
%SRV%
pause
