@echo off
title Mizentia Local Backup System
color 0b

echo ==============================================================
echo               MIZENTIA LOCAL BACKUP SYSTEM
echo ==============================================================
echo.

:: Navigate to script directory
cd /d "%~dp0"

:: Check if node_modules exists
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm.cmd install
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed. Please check Node.js and NPM installation.
        pause
        exit /b 1
    )
) else (
    echo [INFO] Dependencies are already installed.
)

echo.
echo [INFO] Starting Local Network Server...
echo.

:: Start Express server on local network in the background
start "Mizentia Backup Server" cmd /c "node run-dev.js"

:: Wait 2 seconds for server to start
timeout /t 2 >nul

echo [INFO] Opening backup dashboard in your web browser...

echo.
echo ==============================================================
echo  Server is running in a background window.
echo  You can close this window now or press any key to exit.
echo ==============================================================
echo.
pause
