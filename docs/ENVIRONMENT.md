# 🔑 Guia de Variáveis de Ambiente e Configuração / Environment & Config Guide

Este guia explica cada entrada do arquivo `.env` e as configurações internas da Hikari, com os links necessários para obter as chaves de API.

---

## 📂 Sumário / Summary
1. [🌐 Configurações Obrigatórias](#-configurações-obrigatórias)
2. [🤖 Chaves de API de IA](#-chaves-de-api-de-ia)
3. [🌍 Provedores e URLs](#-provedores-e-urls)
4. [👑 Governança e Preferências](#-governança-e-preferências)

---

## 🌐 Configurações Obrigatórias

| Variável | Descrição | Onde Obter |
| :--- | :--- | :--- |
| `DISCORD_TOKEN` | Token de acesso do seu bot no Discord. | [Discord Developer Portal](https://discord.com/developers/applications) |
| `DISCORD_CLIENT_ID` | ID da aplicação do seu bot. | [Discord Developer Portal](https://discord.com/developers/applications) |

---

## 🤖 Chaves de API de IA

### 🧠 Modelos de Linguagem (LLM)
- **`GEMINI_API_KEY`**: Chave principal para o motor da Hikari. Suporta rotação (ex: `key1,key2`).
  - 🔗 **Obter em:** [Google AI Studio](https://aistudio.google.com/app/apikey)
- **`HF_TOKEN`**: Token para modelos do HuggingFace (como o FLUX para imagens ou modelos de chat).
  - 🔗 **Obter em:** [Hugging Face Settings](https://huggingface.co/settings/tokens)
- **`LM_STUDIO_API_KEY`**: Opcional. Use se estiver rodando um modelo local via LM Studio.

### 🎨 Geração de Imagens
- **`STABILITY_API_KEY`**: Para geração de imagens de ultra qualidade (SDXL/Stable Diffusion).
  - 🔗 **Obter em:** [Stability AI Platform](https://platform.stability.ai/account/keys)
- **`HORDE_API_KEY`**: Chave para a rede AI Horde (descentralizada). Use `0000000000` para uso anônimo com menor prioridade.
  - 🔗 **Obter em:** [AI Horde Register](https://aihorde.net/register)

### 🔍 Pesquisa e Outros
- **`BRAVE_API_KEY`**: Utilizada para que a IA possa pesquisar na internet em tempo real.
  - 🔗 **Obter em:** [Brave Search API](https://api.search.brave.com/app/dashboard)

---

## 🌍 Provedores e URLs

- **`LOCAL_LLM_URL`**: Endpoint do seu servidor local (LM Studio / Ollama). Padrão: `http://localhost:1234/v1/chat/completions`.
- **`GEMINI_URL`**: URL da API do Gemini (OpenAI compatible). 
- **`HF_API_URL`**: Endpoint para inferência do HuggingFace.
- **`LOG_WEBHOOK_URL`**: URL de um webhook do Discord para receber logs de erro e status direto no seu servidor.

---

## 👑 Governança e Preferências

- **`OWNER_ID`**: Seu ID de usuário do Discord (ou vários separados por vírgula). Permite comandos administrativos.
- **`PREFIX`**: Prefixo para comandos legados (se houver). Padrão: `@`.
- **`BOT_NAME`**: O nome que a Hikari reconhecerá como sendo dela.
- **`REQUIRE_TOS`**: Se `true`, novos servidores precisam aceitar os termos de uso antes de usar o bot.
- **`SAVE_HISTORY`**: Salva o histórico de mensagens em `src/data/historico.txt` para depuração.

---

## 🇬🇧 Quick Reference (English)

- **`DISCORD_TOKEN`**: your bot secret from [Discord Developers](https://discord.com/developers/applications).
- **`GEMINI_API_KEY`**: get it for free at [Google AI Studio](https://aistudio.google.com/app/apikey).
- **`STABILITY_API_KEY`**: for high-end image generation at [Stability AI](https://platform.stability.ai/account/keys).
- **`BRAVE_API_KEY`**: enables the "Web Search" tool for the AI. Get it at [Brave Search API](https://api.search.brave.com/app/dashboard).
- **`OWNER_ID`**: your Discord User ID (or multiple IDs separated by commas).

---
[🏠 Voltar ao Menu Principal](../README.md)
