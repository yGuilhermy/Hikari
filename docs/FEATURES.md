# ✨ Funcionalidades, IA e Processamento de Mídia

A Hikari não é apenas um wrapper de chat. Ela é um ecossistema de processamento as síncrono que combina LLMs, difusão de imagens e extração de metadados.

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

## 🎵 3. Processamento de Áudio e YouTube

Implementamos um sistema higiênico de download via `youtubeAudioHandler.js`.

- **Estratégia:** O bot utiliza o binário `yt-dlp` para extrair apenas o melhor stream de áudio (`bestaudio`).
- **Conversão:** O áudio é convertido via `ffmpeg` para MP3 com taxa de bits otimizada para o Discord.
- **Cleanup Automático:** Após o envio do arquivo, o handler limpa automaticamente o arquivo local da pasta `temp_audio` (ou a pasta de audios correspondente) para não saturar o disco.

---

## 💡 Dicas de Uso Avançado

- 💡 **Resumo de Chat (`/chat_resumo`):** A IA lê as últimas N mensagens e cria um mapeamento sântico de quem falou o que e sobre quais tópicos. Excelente para gerenciar canais movimentados.
- 💡 **Trace.moe Integration:** A função `/anime_origem` permite que você encontre animes apenas enviando um frame. Ela retorna o título, episódio e o timestamp aproximado.
- 💡 **Busca de Jogos:** Ao usar `/buscar_jogo`, a Hikari pesquisa links Magnéticos em bancos de dados FitGirl e DODI com prioridade para seeds saudáveis.

---

[🏠 Voltar ao Menu Principal](../README.md)
