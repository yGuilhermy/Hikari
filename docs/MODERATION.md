# 🛡️ Sistema de Segurança, AutoMod e TOS

A Hikari opera sob uma filosofia de "Sanidade como Serviço". Este documento explica o fluxo técnico de proteção da Hikari, desde a entrada em novos servidores até o bloqueio global de usuários maliciosos.

---

## ⚖️ 1. O Fluxo de Termos de Serviço (TOS)

Ao ser adicionada a uma guilda, se `REQUIRE_TOS` estiver ativo:
1.  **Bloqueio de Comandos:** Todos os comandos de IA retornam um aviso de "TOS Pendente".
2.  **Aviso para Administrador:** A Hikari envia um embed interativo detectando quem adicionou o bot.
3.  **Webhook de Auditoria:** O Dono do bot recebe uma notificação com as opções: `REMOVER BOT` ou `CONFIRMAR SERVER`. 
    - *Isso permite que você monitore quem está usando sua instância.*

## 🛡️ 2. Hierarquia do AutoMod (Automated Blocking)

O sistema de AutoMod analisa prompts e contextos em busca de padrões proibidos (RegEx e Listas Negras). A punição segue uma hierarquia de três níveis:

### 🏙️ Nível 1: Servidor (Guild Ban)
- **O que checa:** O nome do servidor onde o bot foi convidado.
- **Trigger:** Palavras de ódio, conteúdo explícito ou nomes reservados.
- **Ação:** O bot sai automaticamente da guilda e o servidor é adicionado à `blacklist`.

### 📺 Nível 2: Canal (Channel Block)
- **O que checa:** O nome do canal (`#general`, etc).
- **Trigger:** Termos proibidos no nome do chat (ex: canais de vazamentos ou pirataria explícita).
- **Ação:** As funções de IA são silenciadas especificamente naquele canal.

### 👤 Nível 3: Usuário (User Ban)
- **O que checa:** O conteúdo do prompt enviado pelo usuário.
- **Trigger:** Tentativas de "Jailbreak", solicitações NSFW, racismo ou comportamentos tóxicos.
- **Ação:** O usuário é banido globalmente do bot.

---

## 🔨 3. Comandos de Administração Remota

Todo alerta de segurança enviado via Webhook possui botões de ação imediata. Isso é processado pelo `interactionCreate.js` de forma assíncrona.

- `/adm_banir type:[user|guild] id:[ID] motivo:[texto]`
- `/adm_desbanir`
- `/adm_lista_bans`

## 💡 Dicas de Moderação e Segurança

- 💡 **ID do Canal de Apelação:** Configure `APPEAL_CHANNEL_ID` no `.env`. Usuários banidos receberão um link para este canal para tentar reverter a punição.
- 💡 **Remoção Silenciosa:** Se você clicar no botão `Remover Bot` no webhook administrativo, a Hikari sairá do servidor de destino sem emitir nenhum aviso, evitando atritos desnecessários.
- 💡 **Trigger Word:** O log de aviso agora exibe exatamente a **Palavra Chave** que ativou o AutoMod, facilitando o discernimento entre ataques reais e falsos positivos.

---
[🏠 Voltar ao Menu Principal](../README.md)
