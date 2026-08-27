@echo off
rem Launch.cmd: Windows launcher that clears the poison env vars and runs
rem the real Electron EXE. Required because some user machines have
rem ELECTRON_RUN_AS_NODE=1 set globally, which causes the Electron EXE
rem to silently exit (it goes to Node mode with no script to run).
rem
rem This file is auto-included in both the win-unpacked and the portable
rem SFX outputs. Drop a copy into the win-unpacked dir for development.

setlocal
set ELECTRON_RUN_AS_NODE=
set NODE_ENV=
set NODE_OPTIONS=
set NODE_PATH=
cd /d %~dp0
"%~dp0TOOLBOXLAP Gateway GMI.exe" %*
exit /b %ERRORLEVEL%
