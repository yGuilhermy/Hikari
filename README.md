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

<div align="center">
  <p><i>"Não esqueça de me dar carinho (e processamento)!"</i></p>
  <p>Feito com 💜 e café por <b>yGuilhermy</b></p>
</div>
