@echo off
title Elipse Backend Restart
echo ============================================
echo  Stopping old backend processes on 5003, 5004, 5005...
echo ============================================
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5005 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5004 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5003 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 2 /nobreak >nul
echo.
echo ============================================
echo  Starting backend...
echo  URL: http://localhost:5005/status
echo ============================================
cd /d "%~dp0.."
start "" cmd /k "npm run dev"
timeout /t 6 /nobreak >nul
echo.
echo Backend started. Health check:
curl -s http://localhost:5005/status
echo.
pause
