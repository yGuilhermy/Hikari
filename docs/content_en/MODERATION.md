# 🛡️ Security System, AutoMod, and TOS

Hikari operates under a philosophy of "Sanity as a Service." This document explains Hikari's technical protection flow, from joining new servers to global blocking of malicious users.

---

## 📂 Summary

1. [⚖️ 1. The Terms of Service (TOS) Flow](#-1-the-terms-of-service-tos-flow)
2. [🛡️ 2. AutoMod Hierarchy](#-2-automod-hierarchy-automated-blocking)
3. [🔨 3. Remote Administration Commands](#-3-remote-administration-commands)
4. [💡 Moderation and Security Tips](#-moderation-and-security-tips)

---

## ⚖️ 1. The Terms of Service (TOS) Flow

When added to a guild, if `REQUIRE_TOS` is active:
1.  **Command Block:** All AI commands return a "TOS Pending" warning.
2.  **Administrator Warning:** Hikari sends an interactive embed detecting who added the bot.
3.  **Audit Webhook:** The bot owner receives a notification with the options: `REMOVE BOT` or `CONFIRM SERVER`.
    - *This allows you to monitor who is using your instance.*

## 🛡️ 2. AutoMod Hierarchy (Automated Blocking)

The AutoMod system analyzes prompts and contexts for forbidden patterns (RegEx and Blacklists). Punishment follows a three-level hierarchy:

### 🏙️ Level 1: Server (Guild Ban)
- **What it checks:** The name of the server where the bot was invited.
- **Trigger:** Hate speech, explicit content, or reserved names.
- **Action:** The bot automatically leaves the guild, and the server is added to the `blacklist`.

### 📺 Level 2: Channel (Channel Block)
- **What it checks:** The channel name (e.g., `#general`).
- **Trigger:** Forbidden terms in the chat name (e.g., leak channels or explicit piracy).
- **Action:** AI functions are silenced specifically in that channel.

### 👤 Level 3: User (User Ban)
- **What it checks:** The content of the prompt sent by the user.
- **Trigger:** "Jailbreak" attempts, NSFW requests, racism, or toxic behavior.
- **Action:** The user is globally banned from the bot.

---

## 🔨 3. Remote Administration Commands

Every security alert sent via Webhook has immediate action buttons. This is processed asynchronously by `interactionCreate.js`.

- `/adm_banir type:[user|guild] id:[ID] reason:[text]`
- `/adm_desbanir`
- `/adm_lista_bans`

## 💡 Moderation and Security Tips

- 💡 **Appeal Channel ID:** Configure `APPEAL_CHANNEL_ID` in `.env`. Banned users will receive a link to this channel to attempt to reverse the punishment.
- 💡 **Silent Removal:** If you click the `Remove Bot` button in the administrative webhook, Hikari will leave the target server without issuing any warning, avoiding unnecessary friction.
- 💡 **Trigger Word:** The warning log now displays exactly the **Keyword** that activated the AutoMod, making it easier to distinguish between actual attacks and false positives.

---
[🏠 Back to Main Menu](../../README.md)
