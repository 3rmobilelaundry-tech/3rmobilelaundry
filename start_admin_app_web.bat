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
echo Starting Admin App in Web Browser...
echo ==================================================
echo.

cd admin-app

if not exist node_modules (
    echo [System] First time setup: Installing dependencies...
    echo This might take a few minutes. Please wait...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [Error] Installation failed. Please check your internet connection.
        pause
        exit /b
    )
)

echo.
echo [System] Ensuring web support dependencies are installed...
call npx expo install react-native-web@~0.18.10 react-dom@18.2.0 @expo/webpack-config@^18.0.1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [Error] Failed to install web dependencies automatically.
    echo Please run the following command manually inside the admin-app folder:
    echo     npx expo install react-native-web@~0.18.10 react-dom@18.2.0 @expo/webpack-config@^18.0.1
    pause
    exit /b
)

echo.
echo [System] Launching Admin App...
echo If a browser window opens, please wait for the app to load.
echo.
echo [System] Ensuring animation dependencies are installed...
call npx expo install react-native-reanimated
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [Error] Failed to install react-native-reanimated automatically.
    echo Please run the following command manually inside the admin-app folder:
    echo     npx expo install react-native-reanimated
    pause
    exit /b
)
echo.
node node_modules\expo\bin\cli.js start --web

pause
