# ✨ Funcionalidades, IA e Processamento de Mídia

A Hikari não é apenas um wrapper de chat. Ela é um ecossistema de processamento as síncrono que combina LLMs, difusão de imagens e extração de metadados.

---

## 📂 Sumário

1. [🧠 1. Inteligência Artificial: O Ciclo de Vida do Prompt](#-1-inteligência-artificial-o-ciclo-de-vida-do-prompt)
2. [🎨 2. Geração de Imagens (Hierarquia de Provedores)](#-2-geração-de-imagens-hierarquia-de-provedores)
3. [🎵 3. Processamento de Mídia (Áudio, Vídeo e Compressão)](#-3-processamento-de-mídia-áudio-vídeo-e-compressão)
4. [🎙️ 4. Assistente de Voz & Protocolo DAVE (Calls do Discord)](#-4-assistente-de-voz--protocolo-dave-calls-do-discord)
5. [🎙️ 5. Transcrição de Áudio no Histórico (Whisper Sob Demanda)](#-5-transcrição-de-áudio-no-histórico-whisper-sob-demanda)
6. [💾 6. Banco de Dados Permanente & Memória Sob Demanda](#-6-banco-de-dados-permanente--memória-sob-demanda-zero-token-overhead)
7. [💡 Dicas de Uso Avançado](#-dicas-de-uso-avançado)

---

## 🧠 1. Inteligência Artificial: O Ciclo de Vida do Prompt

A Hikari processa todas as mensagens de IA através de uma **Fila Global (`processingQueue`)**.

### Fluxo de Resposta:

1.  **Captura de Contexto:** A Hikari lê as últimas 5 a 10 mensagens do canal (Short-term memory) para garantir coerência.
2.  **Identificação de Gatilhos:** O bot responde se:
    - For mencionado (`@Hikari`).
    - O texto conter a palavra "Hikari".
    - Houver uma resposta direta (reply) à mensagem dela.
3.  **Processamento Multimodal:** Se houver uma imagem anexa, ela é enviada junto ao prompt para análise Vision (sujeito à capacidade do modelo configurado). (Ainda não implementado)
4.  **Parsing de Ferramentas:** A saída da IA é passada por um parser JSON que detecta se ela "decidiu" usar uma ferramenta (Busca Web, Imagem, Música).

---

## 🎨 2. Geração de Imagens (Hierarquia de Provedores)

A Hikari possui um motor de fallback agressivo para garantir que o usuário receba sua arte, mesmo que as APIs principais falhem.

**Ordem de Execução:**

1.  **Stability AI (Ultra/Core):** Se houver uma `STABILITY_API_KEY`. Qualidade fotorealista.
2.  **Gradio/SDXL-Flash:** Fallback gratuito de alta velocidade.
3.  **HuggingFace (FLUX.1):** Modelos SOTA rodando em endpoints de inferência.
4.  **Stable Horde:** Rede descentralizada de GPUs (uso sob demanda).
5.  **Pollinations:** O fallback definitivo para 100% de disponibilidade.

---

## 🎵 3. Processamento de Mídia (Áudio, Vídeo e Compressão)

Implementamos um sistema completo de download e manipulação de mídia via `youtubeAudioHandler.js`.

- **Suporte Multplataforma:** O bot suporta download de áudio e vídeo de plataformas populares, como YouTube (geral para áudio, apenas Shorts para vídeo), Instagram Reels e TikTok (incluindo subdomínios como `vt.tiktok.com`).
- **Download Inteligente de Áudio:** Extração apenas do melhor stream de áudio (`bestaudio`) via `yt-dlp` e conversão dinâmica com `ffmpeg` para MP3.
- **Motor de Música Deezer HQ (100% Deezer):** Módulo dedicado (`deezerMusicService.js` / `deezerMusicHandler.js`) para buscar e baixar áudios de estúdio em altíssima qualidade (HQ MP3 / 320kbps) via `deemix`. Possui algoritmo de fidelidade por palavras-chave e exibe um menu interativo de seleção de 5 opções quando a busca for ambígua. Todos os arquivos MP3 são temporários e removidos do disco imediatamente após o envio.
- **Download de Vídeo com Metadados:** Ao baixar vídeos, a Hikari pode extrair o uploader original e a descrição para exibição rica no chat, configurável via parâmetro.
- **Compressão Inteligente:** Se o arquivo de vídeo ultrapassar o limite de upload do servidor (detectado dinamicamente: 25MB para padrão, 50MB para Boost Nível 2 e 100MB para Boost Nível 3), o usuário recebe a opção de iniciar a compressão.
- **Fila Global & Proteção da Host:** O processo de compressão FFMPEG roda em uma fila global (apenas uma compressão simultânea) para preservar os recursos da VPS. Há um monitor de RAM ativo: se o uso de memória passar de 95%, a compressão é cancelada imediatamente para evitar travamento do servidor.
- **Limitação de Uso:** Há uma limitação estrita de 1 download/processo ativo por usuário ao mesmo tempo para evitar sobrecarga.
- **Cleanup Automático:** Todos os arquivos temporários são deletados após o envio. Vídeos grandes que aguardam compressão expiram após 6 horas.

---

## 🎙️ 4. Assistente de Voz & Protocolo DAVE (Calls do Discord)

O ecossistema de voz da Hikari permite que ela participe de chamadas de voz e atenda comandos dos usuários em tempo real.

- **Conexão Nativa com Protocolo DAVE (E2EE)**: Utiliza a versão mais recente do `@discordjs/voice` com suporte nativo ao protocolo de criptografia ponta a ponta do Discord (DAVE protocol version 1).
- **Filtro de Energia Corporal de Áudio (PCM RMS)**: Analisa a energia do sinal PCM do fluxo de áudio recebido. Áudios com RMS < 250 ou de membros mutados são descartados automaticamente para evitar uso desnecessário de cotas das APIs de STT.
- **Dicionário STT & Matcher Fonético de 75+ Variações**: Incorpora injeção de prompt no Whisper ("Hikari") aliado a um sistema de expressões regulares que identifica 75+ grafias e fonemas derivados de sotaques ou ruídos (ex: "Ricardo", "Hicari", "Icari", "Ficari", "Vicari", "Ih cari").
- **Ferramenta Unificada MCP (Assistente de Voz)**: O controle de chamada (`join_voice_call` e `leave_voice_call`) é integrado e gerenciado como um único item unificado no comando `/ia_ferramentas`.
- **Desconexão por Inatividade**: Quando todos os usuários humanos deixam o canal de voz, a Hikari se desconecta automaticamente preservando conexões do servidor.

---

## 🎙️ 5. Transcrição de Áudio no Histórico (Whisper Sob Demanda)

A Hikari não ignora áudios enviados nos canais! Quando acionada em um chat cujo histórico recente contém mensagens de voz:

- **Transcrição Sob Demanda:** A Hikari envia o arquivo de voz para o motor Whisper apenas quando o usuário a menciona ou pergunta algo relacionado àquela conversa.
- **Hierarquia de Provedores:** Utiliza primariamente **Wit.ai** para transcrição ultrarrápida e gratuita em português/outros idiomas, com fallback automático para a API do **Groq** (`whisper-large-v3-turbo`).
- **Cache Persistente por Mensagem:** Uma vez que o áudio de uma mensagem foi transcrito, o texto resultante fica vinculado em memória àquela mensagem do histórico. Nas próximas interações, a Hikari reutiliza o texto transcrito sem acionar novamente as APIs.
- **Filtro Inteligente de Tipo de Áudio:** Áudios de voz (notas de voz do Discord) são rotulados como `[Áudio transcrito: "..."]`, enquanto músicas ou arquivos de áudio normais são identificados apenas pelo nome original (ex: `musica.mp3`), evitando transcrições desnecessárias de faixas musicais.

---

## 💾 6. Banco de Dados Permanente & Memória Sob Demanda (Zero Token Overhead)

Para evitar inflar o System Prompt a cada requisição com centenas de tokens de dados fixos ou fatos históricos, a Hikari conta com um sistema de **banco de dados permanente autônomo** (`src/data/ai_database.json`).

- **Consulta Sob Demanda & Agregação Multitópicos (`db_read`):** Em vez de carregar tudo no prompt, a IA decide autonomamente quando precisa consultar a memória. Possui busca inteligente em camadas e **agregação automática**: se existirem múltiplos registros sobre um mesmo assunto (ex: `sekinin`, `sekinin_regras`, `sekinin_eventos`), ela unifica e sintetiza todos em uma única resposta completa.
- **Escrita e Auditoria de Autoria (`db_write`):** Ao salvar um registro, a Hikari grava automaticamente os metadados de autoria (`salvo_por: "usuario - id"`, `savedById`, `savedByTag`) e a classificação de relevância (`important: boolean`, padrão `false`), avaliada inteligentemente pela própria IA.
- **Edição Segura (`db_edit`):** Permite alterar, corrigir ou acrescentar novas informações a anotações prévias, preservando o histórico e a autoria.
- **Exclusão Controlada (`db_delete`):** Remove registros da memória quando solicitado.
- **Trava contra Deleção e Adulteração por Terceiros:**
  - Registros marcados como **importantes** (`important: true`) só podem ser alterados ou excluídos pelo **próprio autor** que os criou, por membros da **Staff/Moderação** (`Administrator`, `ManageGuild`, `ManageMessages` ou Dono do Servidor) ou pelo **Criador do Bot** (`isOwner`).
  - Tentativas de outros membros comuns são recusadas pela Hikari de forma amigável e natural no chat (sem emojis), protegendo anotações da comunidade contra trolls.
  - Registros simples (`important: false`) podem ser editados ou excluídos normalmente por qualquer membro.
- **Blindagem contra Vazamento e Dumps em Massa:** A IA é instruída e bloqueada de realizar despejos globais de todo o banco de dados (`*`, `tudo`, `dump`) para usuários comuns por motivos de segurança e privacidade, direcionando o usuário a especificar o tópico desejado (com bypass para o Criador).
- **Diretriz de Conduta e Proteção contra Conteúdo Nocivo:** A IA recusa categoricamente gravar acusações, difamações, ataques contra usuários, apologia a crimes ou violações aos Termos de Serviço do Discord no banco de dados.
- **Identificação Visual no Rodapé:** Respostas formuladas com base em dados recuperados do banco exibem o indicador `-# 💾 Database`.
- **Proteção do Criador (`protected: true`):** Registros estruturais (como `creator_info`) são blindados contra sobrescrita e deleção por qualquer usuário além do dono do bot.
- **Controle Granular por Variáveis e Painel:** O acesso pode ser gerenciado individualmente via `.env` (`AI_DB_READ`, `AI_DB_WRITE`, `AI_DB_EDIT`, `AI_DB_DELETE`) ou pelos botões do Painel de Configuração do Criador (`/config`). Caso a leitura seja desativada, a escrita e deleção são automaticamente bloqueadas por segurança.
- **Privacidade Open-Source:** O arquivo físico `src/data/ai_database.json` é ignorado no `.gitignore`, garantindo que informações pessoais e dados locais nunca vazem para o repositório público do GitHub.

---

## 💡 Dicas de Uso Avançado

- 💡 **Resumo de Chat (`/chat_resumo`):** A IA lê as últimas N mensagens e cria um mapeamento semântico de quem falou o que e sobre quais tópicos. Excelente para gerenciar canais movimentados.
- 💡 **Trace.moe Integration:** A função `/anime_origem` permite que você encontre animes apenas enviando um frame. Ela retorna o título, episódio e o timestamp aproximado.
- 💡 **Busca de Jogos e Preços da Steam:** A Hikari não apenas busca links Magnéticos em bases de dados, mas também pode consultar nativamente a **Steam**! Basta perguntar naturalmente como "O Elden Ring está em promoção na Steam?" e ela retornará dados atualizados, preços e sinopse, além de fazer um comentário divertido.
- 💡 **Conversor de Moedas e Cripto:** Converta qualquer valor entre moedas reais (BRL, USD, EUR) ou cripto (BTC, ETH) apenas perguntando "quanto tá o bitcoin hoje?". Ela usa APIs financeiras com cache local de expiração diária e fallback automático.
- 💡 **Visão Computacional e Edição:** A Hikari possui regras claras avisando que ela não realiza edições de imagens existentes e não possui visão computacional nativa em tempo real.

---

> [!TIP]
> Para ver a lista completa de comandos e explicações detalhadas, veja o [Guia de Comandos](./COMMANDS.md).

---

[🏠 Voltar ao Menu Principal](../README.md)
