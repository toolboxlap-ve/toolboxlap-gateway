@echo off
REM ============================================================================
REM Toolbox Gateway - environment setup
REM
REM Creates .env from .env.example if .env does not already exist.
REM Will NOT overwrite an existing .env.
REM
REM Usage:
REM   - Double-click this file
REM   - From cmd.exe:    setup-env.cmd
REM   - From PowerShell: .\setup-env.cmd
REM ============================================================================

cd /d "%~dp0"

if exist ".env" (
  echo [Toolbox Gateway] .env already exists. Not overwriting.
  echo [Toolbox Gateway] To start fresh, delete .env and run setup-env.cmd again.
  pause
  exit /b 0
)

if not exist ".env.example" (
  echo [Toolbox Gateway] ERROR: .env.example is missing. Project is incomplete.
  pause
  exit /b 1
)

copy /Y ".env.example" ".env" >NUL
if errorlevel 1 (
  echo [Toolbox Gateway] ERROR: failed to copy .env.example to .env
  pause
  exit /b 1
)

echo [Toolbox Gateway] .env created from .env.example.
echo [Toolbox Gateway] Edit .env and set GMI_API_KEY before starting the gateway.
echo [Toolbox Gateway] Then run start-gateway.cmd to launch the gateway.
pause
exit /b 0
