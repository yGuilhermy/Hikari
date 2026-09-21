# ✨ Features, AI, and Media Processing

Hikari is not just a chat wrapper. It is an asynchronous processing ecosystem that combines LLMs, image diffusion, and metadata extraction.

---

## 📂 Summary

1. [🧠 1. Artificial Intelligence: The Prompt Life Cycle](#-1-artificial-intelligence-the-prompt-life-cycle)
2. [🎨 2. Image Generation (Provider Hierarchy)](#-2-image-generation-provider-hierarchy)
3. [🎵 3. Media Processing (Audio, Video, and Compression)](#-3-media-processing-audio-video-and-compression)
4. [🎙️ 4. Voice Assistant & DAVE Protocol (Discord Voice Calls)](#-4-voice-assistant--dave-protocol-discord-voice-calls)
5. [💾 5. Permanent AI Database & On-Demand Memory](#-5-permanent-ai-database--on-demand-memory-zero-token-overhead)
6. [💡 Advanced Usage Tips](#-advanced-usage-tips)

---

## 🧠 1. Artificial Intelligence: The Prompt Life Cycle

Hikari processes all AI messages through a **Global Queue (`processingQueue`)**.

### Response Flow:

1.  **Context Capture:** Hikari reads the last 5 to 10 messages from the channel (Short-term memory) to ensure coherence.
2.  **Trigger Identification:** The bot responds if:
    - It is mentioned (`@Hikari`).
    - The text contains the word "Hikari".
    - There is a direct reply to its message.
3.  **Multimodal Processing:** If an image is attached, it is sent along with the prompt for Vision analysis (subject to the capacity of the configured model). *(Vision support is currently being optimized)*
4.  **Tool Parsing:** The AI output is passed through a JSON parser that detects if it "decided" to use a tool (Web Search, Image, Music).

---

## 🎨 2. Image Generation (Provider Hierarchy)

Hikari has an aggressive fallback engine to ensure the user receives their art, even if the main APIs fail.

**Execution Order:**

1.  **Stability AI (Ultra/Core):** If a `STABILITY_API_KEY` is present. Photorealistic quality.
2.  **Gradio/SDXL-Flash:** High-speed free fallback.
3.  **Hugging Face (FLUX.1):** SOTA models running on inference endpoints.
4.  **Stable Horde:** Decentralized GPU network (on-demand usage).
5.  **Pollinations:** The ultimate fallback for 100% availability.

---

## 🎵 3. Media Processing (Audio, Video, and Compression)

We implemented a complete system for downloading and manipulating media via `youtubeAudioHandler.js`.

- **Multiplatform Support:** The bot supports downloading audio and video from popular platforms such as YouTube (general for audio, Shorts-only for video), Instagram Reels, and TikTok (including subdomains like `vt.tiktok.com`).
- **Smart Audio Download:** Extracts only the best audio stream (`bestaudio`) via `yt-dlp` and dynamically converts it to MP3 using `ffmpeg`.
- **Deezer HQ Music Engine (100% Deezer):** Dedicated module (`deezerMusicService.js` / `deezerMusicHandler.js`) to search and download studio-quality tracks in high quality (HQ MP3 / 320kbps) via `deemix`. Features a keyword confidence scoring algorithm and presents an interactive select dropdown with 5 options when search is ambiguous. All MP3 files are temporary and cleaned up immediately after sending.
- **Video Download with Metadata:** When downloading videos, Hikari can extract the original uploader and description for rich chat display, configurable via command parameters.
- **Smart Compression:** If the video file exceeds the server's upload limit (dynamically detected: 25MB default, 50MB for Boost Level 2, and 100MB for Boost Level 3), the user will be prompted to try compressing the video.
- **Global Queue & Host Protection:** The FFMPEG compression process runs in a global queue (only one compression at a time) to preserve VPS resources. There is an active RAM monitor: if memory usage exceeds 95%, the compression process is killed immediately to prevent host crashes.
- **Usage Limits:** There is a strict limit of 1 active download/process per user at a time to prevent abuse.
- **Automatic Cleanup:** All temporary files are deleted after sending. Large videos waiting for compression expire and are deleted after 6 hours.

---

## 🎙️ 4. Voice Assistant & DAVE Protocol (Discord Voice Calls)

Hikari's voice ecosystem allows her to participate in voice channels and process voice commands from users in real-time.

- **Native DAVE Protocol Connection (E2EE):** Uses the latest `@discordjs/voice` with native support for Discord's end-to-end encryption protocol (DAVE protocol version 1).
- **Audio Energy Filtering (PCM RMS):** Evaluates the PCM signal energy of incoming audio. Streams with RMS < 250 or from muted members are automatically dropped to avoid wasting STT API quotas.
- **STT Dictionary & 75+ Phonetic Variations Matcher:** Leverages prompt injection in Whisper ("Hikari") combined with a regular expression matcher recognizing 75+ variations and slang pronunciations.
- **Unified Voice MCP Tool:** Voice call management (`join_voice_call` and `leave_voice_call`) is exposed as a unified item in `/ia_ferramentas`.
- **Inactivity Disconnect:** Disconnects automatically when all human participants leave the call.

---

## 💾 5. Permanent AI Database & On-Demand Memory (Zero Token Overhead)

To avoid inflating the System Prompt on every request with hundreds of static tokens or historical facts, Hikari features an **autonomous permanent database** (`ai_database.json`).

- **On-Demand Retrieval ("Think Twice"):** Rather than stuffing all context into the prompt, the AI autonomously decides when to query memory using `database_read`. It performs the internal lookup and formulates a coherent, natural response with pinpoint precision.
- **Write & Update (`database_write`):** The AI can persist critical facts, user preferences, and long-term notes to disk across bot restarts.
- **Cleanup of Stale Records (`database_delete`):** Allows removing outdated or obsolete entries to keep storage lean.
- **Creator Protection (`protected: true`):** Sensitive and architectural records (such as creator biography and credentials) have the protected flag enabled. Regular users and autonomous AI routines are strictly prevented from overwriting or deleting protected records; only the Bot Owner (`isOwner`) has authorization to modify them.
- **Granular Control via Environment Variables & Panel:** Access can be individually managed via `.env` (`AI_DB_READ`, `AI_DB_WRITE`, `AI_DB_DELETE`) or dynamically toggled in the Owner Config Panel. Disabling read access automatically cascades to block write and delete operations for safety.
- **Privacy & Open-Source Security:** The local storage file `src/data/ai_database.json` is ignored in `.gitignore`, guaranteeing that private data and personal information are never exposed in public Git repositories.

---

## 💡 Advanced Usage Tips

- 💡 **Chat Summary (`/chat_resumo`):** The AI reads the last N messages and creates a semantic mapping of who said what and about which topics. Excellent for managing busy channels.
- 💡 **Trace.moe Integration:** The `/anime_origem` function allows you to find animes just by sending a frame. It returns the title, episode, and approximate timestamp.
- 💡 **Game Search and Steam Prices:** Hikari not only searches for Magnet links in databases but can also natively consult **Steam**! Just ask naturally, like "Is Elden Ring on sale on Steam?", and she will return updated data, prices, and a synopsis, as well as add a fun comment.
- 💡 **Currency and Crypto Converter:** Convert any value between real currencies (BRL, USD, EUR) or crypto (BTC, ETH) just by asking "how much is bitcoin today?". She uses financial APIs with daily local caching and automatic fallback.
- 💡 **Computer Vision & Editing:** Hikari has clear guidelines warning users that she cannot edit existing images and does not possess native computer vision in real-time.

---

> [!TIP]
> To see the full list of commands and detailed explanations, see the [Commands Guide](./COMMANDS.md).

---
[🏠 Back to Main Menu](../../README.md)
