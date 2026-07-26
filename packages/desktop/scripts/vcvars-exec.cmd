@echo off
rem Fuerza el entorno de BuildTools 2022 (MSVC 14.44) antes de correr cargo/tauri.
rem Ver README.md: en esta maquina hay una instalacion de "VS 18 Community"
rem incompleta (sin msvcrt.lib de escritorio) que rustc elige por defecto si
rem no se fuerza explicitamente BuildTools 2022. Si esa ruta no existe (otra
rem maquina, instalacion limpia), simplemente corre el comando sin tocar nada.
set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if exist "%VCVARS%" (
  call "%VCVARS%" >nul
)
%*
