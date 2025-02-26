@echo off
setlocal enabledelayedexpansion

:: Set variables
set "APP_NAME=HolyricsMonitor"
set "PUBLISH_DIR=%~dp0publish"
set "TASK_NAME=HolyricsMonitor"
set "EXE_PATH=%PUBLISH_DIR%\%APP_NAME%.exe"

:: Clean and create publish directory
if exist "%PUBLISH_DIR%" rmdir /s /q "%PUBLISH_DIR%"
mkdir "%PUBLISH_DIR%"

:: Build and publish the application
echo Building and publishing application...
dotnet publish -c Release -o "%PUBLISH_DIR%" --self-contained false
if %ERRORLEVEL% neq 0 (
    echo Error: Build failed
    exit /b 1
)

:: Verify the executable exists
if not exist "%EXE_PATH%" (
    echo Error: Built executable not found
    exit /b 1
)

:: Create the scheduled task
echo Creating scheduled task...
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    schtasks /delete /tn "%TASK_NAME%" /f
)

schtasks /create /tn "%TASK_NAME%" /tr "\"%EXE_PATH%\"" /sc onstart /ru System /rl HIGHEST /f
if %ERRORLEVEL% neq 0 (
    echo Error: Failed to create scheduled task
    exit /b 1
)

echo.
echo Build completed successfully!
echo Scheduled task created to run at system startup
echo.
pause