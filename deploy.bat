@echo off 
title GitHub Pages Deployer 
if not exist .git ( 
    git init 
    git branch -M main 
    git remote add origin https://github.com/6321martys/korean-word-app.git 
) 
echo. 
echo ========================================================== 
echo  [1/3] Adding files to stage... (git add) 
echo ========================================================== 
git add . 
echo. 
echo ========================================================== 
echo  [2/3] Creating commit... (git commit) 
echo ========================================================== 
set commit_message=Update: %2026-07-20% %17:57:17.56% 
git commit -m " "%%commit_message%% 
echo. 
echo ========================================================== 
echo  [3/3] Uploading to GitHub... (git push) 
echo ========================================================== 
git push -u origin main 
echo. 
echo ========================================================== 
echo  Deploy Complete! 
echo  URL: https://6321martys.github.io/korean-word-app/ 
echo ========================================================== 
pause
