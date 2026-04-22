
$ErrorActionPreference = "SilentlyContinue"

function Write-Header($text) {
    Write-Host "`n==== $text ====" -ForegroundColor Cyan
}

Write-Header "Verificando Node.js"
$nodeVersion = node -v
if ($LASTEXITCODE -ne 0) {
    Write-Host "[-] Node.js não encontrado." -ForegroundColor Red
    $choice = Read-Host "Deseja tentar instalar o Node.js via winget agora? (s/n)"
    if ($choice -eq 's') {
        winget install OpenJS.NodeJS.LTS
        Write-Host "[!] Por favor, reinicie este script após a conclusão da instalação do Node." -ForegroundColor Yellow
        exit
    }
} else {
    Write-Host "[+] Node.js detectado: $nodeVersion" -ForegroundColor Green
}

Write-Header "Instalando Dependências do Projeto (npm install)"
npm install
if ($LASTEXITCODE -eq 0) {
    Write-Host "[+] Dependências instaladas com sucesso." -ForegroundColor Green
} else {
    Write-Host "[-] Erro ao executar npm install." -ForegroundColor Red
}

Write-Header "Verificando yt-dlp"
yt-dlp --version
if ($LASTEXITCODE -ne 0) {
    Write-Host "[-] yt-dlp não encontrado." -ForegroundColor Red
    $choice = Read-Host "Deseja instalar o yt-dlp via winget? (s/n)"
    if ($choice -eq 's') {
        winget install yt-dlp.yt-dlp
    }
} else {
    Write-Host "[+] yt-dlp detectado." -ForegroundColor Green
}

Write-Header "Verificando ffmpeg"
ffmpeg -version
if ($LASTEXITCODE -ne 0) {
    Write-Host "[-] ffmpeg não encontrado." -ForegroundColor Red
    $choice = Read-Host "Deseja instalar o ffmpeg via winget? (s/n)"
    if ($choice -eq 's') {
        winget install Gyan.FFmpeg
    }
} else {
    Write-Host "[+] ffmpeg detectado." -ForegroundColor Green
}

Write-Header "Resumo do Sistema"
Write-Host "Node: " -NoNewline; node -v
Write-Host "npm:  " -NoNewline; npm -v
Write-Host "yt-dlp: Detectado"
Write-Host "ffmpeg: Detectado"

Write-Host "`n[✅] Configuração concluída! Se algum comando ainda falhar, reinicie o terminal." -ForegroundColor Cyan
pause
