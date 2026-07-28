@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo   龙门架实时受力分析
echo   浏览器打开后不要关掉这个黑窗口，用完直接关掉即可。
echo.
start "" http://localhost:8321
python -m http.server 8321
