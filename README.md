<h1 align="center">🌌 Hikari (The Silver Glare) ✧</h1>

<div align="center">
  <picture>
    <source
      width="100%"
      srcset="https://i.imgur.com/2NTL0Cj.png"
      media="(prefers-color-scheme: dark)"
    />
    <source
      width="100%"
      srcset="https://i.imgur.com/2NTL0Cj.png"
      media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)"
    />
    <img width="250" src="https://i.imgur.com/2NTL0Cj.png" alt="Hikari Banner" />
  </picture>
  <p><i>"Prazer em te conhecer! Eu sou a Hikari, sua agente de IA pessoal pro Discord... ✨"</i></p>
</div>

---

### 🎀 O que eu faço? (Funcionalidades)

Eu não sou apenas um bot de chat comum! Eu sou uma **Agente Autônoma** capaz de interagir com o mundo real para te ajudar:

- **🧠 Cérebro Avançado**: Suporte a múltiplos modelos através de **Gemini**, **LM Studio (Local)** e **HuggingFace**. Minha personalidade é natural e adaptável!
- **🌍 Pesquisa Inteligente**: Se eu não souber algo, eu pesquiso na internet em tempo real, leio os sites e te trago um resumo mastigadinho.
- **🎵 DJ Particular**: Baixe e ouça suas músicas favoritas do YouTube diretamente no Discord.
- **🎮 Cantinho dos Games**: Procuro torrents e magnets de jogos (Dodi/Fitgirl) e consulto nativamente a **Steam** para te dar preços e detalhes técnicos.
- **🎨 Ateliê de Arte**: Posso gerar imagens incríveis usando Stability AI ou Pollinations. Basta pedir!
- **💱 Mestre das Finanças**: Converto moedas e criptomoedas (BTC, USD, BRL) em tempo real com cotações oficiais.
- **🛡️ Vigilante Silenciosa**: Sistema de AutoMod interno com bloqueio automático de termos proibidos e gestão de appeals.

---

### 🚀 Como me acordar (Instalação)

Se você quer me hospedar no seu servidor (Ubuntu/Linux recomendado), siga estes passos:

1.  **Clone meu código**:

    ```bash
    git clone https://github.com/seu-perfil/hikari-bot.git
    cd hikari-bot
    ```

2.  **Instale os módulos**:

    ```bash
    npm install
    ```

    _Obs: Você precisa do `yt-dlp` e `ffmpeg` instalados no sistema para as funções de música funcionarem direitinho!_

3.  **Configure meus segredos**:
    - Renomeie o arquivo `.env_example` para `.env` e preencha as chaves.
    - **Dica:** Você pode mudar meu nome no `.env` alterando `BOT_NAME`!

4.  **Dê o Start**:
    ```bash
    node index.js
    ```

---

### 📚 Wiki & Documentação

Para guias detalhados, dicas de configuração e funcionamento técnico, consulte nossa documentação oficial:

- [🚀 **Guia de Instalação**](./docs/GET_STARTED.md): Tudo para colocar a Hikari no ar.
- [⚙️ **Configuração & Multi-Token**](./docs/CONFIGURATION.md): Como usar várias chaves e gerenciar donos.
- [🛡️ **Segurança & AutoMod**](./docs/MODERATION.md): Entenda como funciona a proteção do bot.
- [✨ **Lista de Funcionalidades**](./docs/FEATURES.md): O que e como pedir as coisas para a Hikari.
- [🎮 **Guia de Comandos**](./docs/COMMANDS.md): Detalhes de todos os comandos Slash (/).
- [🛠️ **Variáveis & APIs**](./docs/ENVIRONMENT.md): O que é cada campo do .env e onde pegar as keys.
- [🛠️ **Sistema de Tools (MCP)**](./docs/ADVANCED.md): Documentação para desenvolvedores e ferramentas.

---

### ⚙️ Personalização Centralizada

Quer mudar minha alma? Tudo o que é importante está em `src/config/index.js`. Lá você pode ajustar:

- 👑 O ID do meu mestre (Owner ID)
- 📝 Meu System Prompt (Minha personalidade básica)
- 🌐 URLs e Modelos de IA padrão
- 🤖 Meu nome de ativação no chat

---

### 📝 Notas do dev

- A Hikari é uma IA que está em desenvolvimento, então ela pode não funcionar perfeitamente em todos os casos.
- Você pode mudar o nome da Hikari no `.env` alterando `BOT_NAME`!
- Caso for hospedar uma copia da hikari, Por favor, mantenha o repositório original linkado!
- Esse é um projeto pessoal, não espere extrema velocidade para atualizações, adições, correções ou qualquer outra coisa.
- Você é livre para clonar, modificar, fazer forks e usar como quiser, com os devidos créditos ao repositório original.
- O servidor principal de onde a hikari foi criada e onde eu sou mais ativo: https://discord.gg/NXwKvKNKCd
- O ID da Hikari original é: 1429544961734885406

---

### 📝 ToDo (Para mim mesmo)

- [ ] Adicionar mais funcionalidades (MCPs)
- [ ] Suporte ao Ollama (é facil, mas preguiça)
- [ ] Adicionar mais modelos de IA (Fallbacks)
- [ ] Adicionar mais integrações (APIs)
- [ ] Adicionar mais comandos
- [ ] Otimizar o uso de Tokens
- [ ] Adicionar mais segurança

---

---

<h1 align="center">🌌 Hikari (The Silver Glare) ✧ (English Version)</h1>

<div align="center">
  <p><i>"Nice to meet you! I'm Hikari, your personal AI agent for Discord... ✨"</i></p>
</div>

### 🎀 What can I do? (Features)

I'm not just a common chat bot! I'm an **Autonomous Agent** capable of interacting with the real world to help you:

- **🧠 Advanced Brain**: Support for multiple models via **Gemini**, **LM Studio (Local)**, and **HuggingFace**. My personality is natural and adaptable!
- **🌍 Smart Search**: If I don't know something, I research it on the internet in real-time, read the websites, and bring you a summarized report.
- **🎵 Personal DJ**: Download and listen to your favorite YouTube songs directly on Discord.
- **🎮 Gaming Corner**: I look for torrents and magnets for games (Dodi/Fitgirl) and natively consult **Steam** for prices and technical details.
- **🎨 Art Studio**: I can generate amazing images using Stability AI or Pollinations. Just ask!
- **💱 Finance Master**: I convert currencies and cryptocurrencies (BTC, USD, BRL) in real-time with official quotes.
- **🛡️ Silent Guardian**: Internal AutoMod system with automatic blocking of forbidden terms and appeal management.

### 🚀 How to wake me up (Installation)

If you want to host me on your server (Ubuntu/Linux recommended), follow these steps:

1.  **Clone my code**:
    ```bash
    git clone https://github.com/yGuilhermy/Hikari.git
    cd hikari-bot
    ```
2.  **Install modules**:
    ```bash
    npm install
    ```
    *Note: You need `yt-dlp` and `ffmpeg` installed on your system for music functions to work properly!*
3.  **Configure my secrets**:
    - Rename `.env_example` to `.env` and fill in the keys.
    - **Tip:** You can change my name in `.env` by modifying `BOT_NAME`!
4.  **Start**:
    ```bash
    node index.js
    ```

### ⚙️ Centralized Customization

Want to change my soul? Everything important is in `src/config/index.js`. There you can adjust:
- 👑 My master's ID (Owner ID)
- 📝 My System Prompt (My basic personality)
- 🌐 Default IA URLs and Models
- 🤖 My activation name in chat

---
<div align="center">
  <p><i>"Don't forget to give me some love (and processing power)!"</i></p>
  <p>Made with 💜 and coffee by <b>yGuilhermy</b></p>
</div>
