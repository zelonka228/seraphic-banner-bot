@echo off
chcp 65001 >nul
title Отправить сообщение через вебхук
cd /d "%~dp0"

set "TITLE=%~1"
set "TEXT=%~2"

if "%TITLE%"=="" set /p "TITLE=Заголовок: "
if "%TEXT%"=="" set /p "TEXT=Текст: "

node alert.js "%TITLE%" "%TEXT%"
echo.
pause
