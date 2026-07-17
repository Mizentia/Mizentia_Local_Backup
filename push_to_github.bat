@echo off
setlocal enabledelayedexpansion

title Mizentia Local Backup Auto Git Push

echo ===================================================
echo      Mizentia Local Backup Git Push Automation
echo ===================================================
echo.

:: Check if Git is installed
where git >nul 2>nul
if !errorlevel! neq 0 (
    echo [ERROR] Git is not installed on this system!
    echo Please download and install Git from https://git-scm.com/
    goto end
)

:: Check if inside a git repository
if not exist .git (
    echo [WARNING] This folder is not a Git repository yet!
    set /p init_choice="Do you want to initialize Git in this folder? (y/n, default: y): "
    if /i "!init_choice!"=="n" (
        echo Cancelled initialization.
        goto end
    )
    
    echo Running 'git init'...
    git init
    
    :: Create default .gitignore if not exists
    if not exist .gitignore (
        echo Creating default .gitignore...
        (
            echo node_modules/
            echo config.json
            echo state.json
            echo .tmp.driveupload/
            echo .tmp.drivedownload/
            echo Thumbs.db
            echo .DS_Store
        ) > .gitignore
    )
)

:: Ask if user wants to configure local credentials for this repository
echo.
echo ===================================================
echo  Configure Local Git Credentials (Optional)
echo ===================================================
git config --local user.name >nul 2>nul
if !errorlevel! equ 0 (
    for /f "tokens=*" %%i in ('git config --local user.name') do set current_user=%%i
    for /f "tokens=*" %%i in ('git config --local user.email') do set current_email=%%i
    echo Current Local User: !current_user! ^(!current_email!^)
    set /p change_creds="Do you want to change these local credentials? (y/n, default: n): "
    if /i "!change_creds!"=="y" (
        set /p git_user="Enter GitHub Username: "
        if not "!git_user!"=="" git config --local user.name "!git_user!"
        set /p git_email="Enter GitHub Email: "
        if not "!git_email!"=="" git config --local user.email "!git_email!"
    )
) else (
    set /p setup_creds="Do you want to set specific local GitHub credentials for this repository? (y/n, default: n): "
    if /i "!setup_creds!"=="y" (
        set /p git_user="Enter GitHub Username: "
        if not "!git_user!"=="" git config --local user.name "!git_user!"
        set /p git_email="Enter GitHub Email: "
        if not "!git_email!"=="" git config --local user.email "!git_email!"
    )
)

:: Get status
echo Checking Git status...
git status --short
echo.

:: Check if there are changes
git status --short | findstr /R "^" >nul
if !errorlevel! neq 0 (
    echo [INFO] No local changes detected to commit.
    echo Checking if push is needed...
    goto push_stage
)

:add_stage
echo.
echo ===================================================
echo  Staging changes (git add .)...
echo ===================================================
git add .
if !errorlevel! neq 0 (
    echo [ERROR] Failed to stage files. Check folder permissions.
    goto end
)

:: Prompt for commit message
echo.
set /p commit_msg="Enter commit message (Press Enter for auto-message): "
if "!commit_msg!"=="" (
    set "commit_msg=Auto-update: %date% %time%"
)

echo.
echo Committing changes: "!commit_msg!"
git commit -m "!commit_msg!"
if !errorlevel! neq 0 (
    echo [ERROR] Commit failed.
    goto end
)

:push_stage
:: Check if remote is configured
git remote -v | findstr "origin" >nul 2>nul
if !errorlevel! neq 0 (
    echo.
    echo ===================================================
    echo [WARNING] No remote repository (origin) configured!
    echo ===================================================
    set /p remote_url="Enter your GitHub Repository URL: "
    if "!remote_url!"=="" (
        echo Remote config skipped. Push cannot proceed.
        goto end
    )
    git remote add origin !remote_url!
    echo Remote 'origin' added successfully.
)

:: Get current branch
for /f "tokens=*" %%i in ('git branch --show-current') do set current_branch=%%i
if "!current_branch!"=="" (
    set current_branch=main
)

echo.
echo ===================================================
echo Pushing changes to GitHub (Branch: !current_branch!)...
echo ===================================================
git push origin !current_branch!
if !errorlevel! equ 0 goto push_success

echo.
echo ===================================================
echo [ERROR] Git push failed! Common reasons:
echo 1. You are not logged in to GitHub (run 'git credential-manager configure' or login via browser).
echo 2. The remote branch has new changes (run 'git pull origin !current_branch!' first).
echo 3. The remote repository URL is incorrect or access is denied.
echo ===================================================
goto end

:push_success
echo.
echo ===================================================
echo [SUCCESS] Project successfully pushed to GitHub!
echo ===================================================

:end
echo.
echo ===================================================
echo  Press any key to close this terminal...
echo ===================================================
pause >nul
