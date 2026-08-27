@echo off
REM ============================================================================
REM Toolbox Gateway - launcher for Windows
REM
REM Behavior:
REM   1. cd into the script directory.
REM   2. If .env is missing, create it from .env.example.
REM   3. If node_modules is missing, run npm install.
REM   4. If GMI_API_KEY is blank or missing, show a clear warning.
REM   5. Start node src/server.js in the foreground.
REM   6. On error, pause so the user can read the message.
REM
REM Usage:
REM   - Double-click this file
REM   - From cmd.exe:    start-gateway.cmd
REM   - From PowerShell: .\start-gateway.cmd
REM
REM NOTE on Windows CMD parsing: never put literal parentheses inside an
REM echo line that lives inside a compound IF block. CMD treats the parens
REM as block delimiters and will mis-parse the rest of the script. This
REM was the original bug.
REM ============================================================================

cd /d "%~dp0"

REM --- Step 1: ensure .env exists -------------------------------------------
if not exist ".env" goto need_env
goto env_ok

:need_env
if not exist ".env.example" (
  echo [Toolbox Gateway] ERROR: .env.example is missing. Project is incomplete.
  pause
  exit /b 1
)
echo [Toolbox Gateway] .env missing, creating from .env.example ...
copy /Y ".env.example" ".env" >NUL
if errorlevel 1 (
  echo [Toolbox Gateway] ERROR: failed to copy .env.example to .env
  pause
  exit /b 1
)
echo [Toolbox Gateway] Created .env. Edit it and set GMI_API_KEY before use.
echo.

:env_ok

REM --- Step 2: ensure node_modules exists ----------------------------------
if exist "node_modules" goto modules_ok
echo [Toolbox Gateway] node_modules missing, running npm install ...
call npm install
if errorlevel 1 (
  echo [Toolbox Gateway] ERROR: npm install failed
  pause
  exit /b 1
)
echo.

:modules_ok

REM --- Step 3: warn if GMI_API_KEY is blank or missing ---------------------
REM Use findstr to detect a non-empty GMI_API_KEY value. We never print the
REM value, only whether it appears to be populated. The regex ^GMI_API_KEY=..
REM matches "GMI_API_KEY=" followed by at least one extra character.
findstr /R /C:"^GMI_API_KEY=.." ".env" >NUL 2>&1
if not errorlevel 1 goto key_ok
echo [Toolbox Gateway] WARNING: GMI_API_KEY is blank or missing in .env
echo [Toolbox Gateway] The gateway will start, but upstream calls will fail.
echo [Toolbox Gateway] Edit .env and set GMI_API_KEY to your GMI Cloud key.
echo.

:key_ok

REM --- Step 4: start the gateway -------------------------------------------
echo [Toolbox Gateway] Starting ...
echo Toolbox Gateway running at http://127.0.0.1:8787
echo [Toolbox Gateway] Press Ctrl+C in this window to stop the gateway.
echo.
node "%~dp0src\server.js"
set "RC=%errorlevel%"

if not "%RC%"=="0" (
  echo.
  echo [Toolbox Gateway] node exited with code %RC%
  pause
)
exit /b %RC%
