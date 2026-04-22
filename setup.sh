GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

header() {
    echo -e "\n${CYAN}==== $1 ====${NC}"
}

header "Verificando Node.js"
if ! command -v node &> /dev/null; then
    echo -e "${RED}[-] Node.js não encontrado.${NC}"
    read -p "Deseja instalar o Node.js agora? (s/n) " resp
    if [ "$resp" = "s" ]; then
        echo "Instalando Node.js (via NodeSource)..."
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
else
    echo -e "${GREEN}[+] Node.js detectado: $(node -v)${NC}"
fi

header "Instalando Dependências do Projeto (npm install)"
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}[+] Dependências instaladas com sucesso.${NC}"
else
    echo -e "${RED}[-] Erro ao executar npm install.${NC}"
fi

header "Verificando ffmpeg"
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${RED}[-] ffmpeg não encontrado.${NC}"
    read -p "Deseja instalar o ffmpeg via apt? (s/n) " resp
    if [ "$resp" = "s" ]; then
        sudo apt-get update \u0026\u0026 sudo apt-get install -y ffmpeg
    fi
else
    echo -e "${GREEN}[+] ffmpeg detectado.${NC}"
fi

header "Verificando yt-dlp"
if ! command -v yt-dlp &> /dev/null; then
    echo -e "${RED}[-] yt-dlp não encontrado.${NC}"
    read -p "Deseja instalar o yt-dlp agora? (s/n) " resp
    if [ "$resp" = "s" ]; then
        sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
        sudo chmod a+rx /usr/local/bin/yt-dlp
        echo -e "${GREEN}[+] yt-dlp instalado em /usr/local/bin/yt-dlp${NC}"
    fi
else
    echo -e "${GREEN}[+] yt-dlp detectado.${NC}"
fi

header "Resumo do Sistema"
echo -e "Node:   $(node -v)"
echo -e "npm:    $(npm -v)"
echo -e "ffmpeg: $(ffmpeg -version | head -n 1)"
echo -e "yt-dlp: $(yt-dlp --version)"

echo -e "\n${GREEN}[✅] Configuração concluída!${NC}"
