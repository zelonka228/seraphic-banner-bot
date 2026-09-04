@echo off
chcp 65001 >nul
title Отправить сообщение через вебхук
cd /d "%~dp0"

set "TITLE=%~1"
set "TEXT=%~2"
set "LEVEL=%~3"

if "%TITLE%"=="" set /p "TITLE=Заголовок: "
if "%TEXT%"=="" set /p "TEXT=Текст: "

if "%LEVEL%"=="" set "LEVEL=success"
node alert.js "%TITLE%" "%TEXT%" "%LEVEL%"
echo.
pause
