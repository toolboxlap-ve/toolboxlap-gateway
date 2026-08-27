@echo off
REM ============================================================================
REM Toolbox Gateway - stop helper
REM
REM Terminates any node.exe process whose command line contains src\server.js
REM under this directory. Uses PowerShell so it works on Windows 10/11/Server
REM without depending on the deprecated WMIC tool.
REM
REM Usage:
REM   - Double-click this file
REM   - From cmd.exe:    stop-gateway.cmd
REM   - From PowerShell: .\stop-gateway.cmd
REM ============================================================================

cd /d "%~dp0"

set "SCRIPT_DIR=%cd%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'SilentlyContinue';" ^
  "$target = '%SCRIPT_DIR%';" ^
  "$procs = Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine -like ('*' + $target + '*src\server.js*') };" ^
  "if (-not $procs) {" ^
  "  Write-Host '[Toolbox Gateway] No running server.js node process was found.';" ^
  "  Write-Host '[Toolbox Gateway] If the gateway is open in another window, close that window.';" ^
  "  exit 0" ^
  "};" ^
  "Write-Host '[Toolbox Gateway] Stopping gateway ...';" ^
  "foreach ($p in $procs) {" ^
  "  Write-Host ('  killing PID ' + $p.ProcessId);" ^
  "  Stop-Process -Id $p.ProcessId -Force" ^
  "};" ^
  "Write-Host '[Toolbox Gateway] Stopped.'"

exit /b %errorlevel%
