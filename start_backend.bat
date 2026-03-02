@echo off
setlocal
echo ==================================================
echo Checking System Requirements...
echo ==================================================

:: Check if Node.js is installed
node -v >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [CRITICAL ERROR] Node.js is NOT installed!
    echo.
    echo This app requires Node.js to run.
    echo.
    echo 1. I am opening the Node.js download page for you.
    echo 2. Please download and install the "LTS" version.
    echo 3. IMPORTANT: After installing, RESTART your computer - or at least close and reopen this folder.
    echo 4. Then try running this file again.
    echo.
    echo Opening https://nodejs.org/...
    start https://nodejs.org/
    pause
    exit /b
)

echo Node.js is installed. Proceeding...
echo.
echo ==================================================
echo Starting Backend Server...
echo ==================================================
echo.

cd backend

if not exist node_modules (
    echo [System] First time setup: Installing backend dependencies...
    echo This might take a few minutes.
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [Error] Installation failed. Please check your internet connection.
        pause
        exit /b
    )
)

echo.
echo [System] Launching Server...
echo The server will start on port 5000.
echo.
call npm start

pause
