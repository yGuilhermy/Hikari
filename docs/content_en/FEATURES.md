# ✨ Features, AI, and Media Processing

Hikari is not just a chat wrapper. It is an asynchronous processing ecosystem that combines LLMs, image diffusion, and metadata extraction.

---

## 📂 Table of Contents

1. [🧠 1. Artificial Intelligence: The Prompt Lifecycle](#-1-artificial-intelligence-the-prompt-lifecycle)
2. [🎨 2. Image Generation (Provider Hierarchy)](#-2-image-generation-provider-hierarchy)
3. [🎵 3. Media Processing (Audio, Video, and Compression)](#-3-media-processing-audio-video-and-compression)
4. [🎙️ 4. Voice Assistant & DAVE Protocol (Discord Calls)](#-4-voice-assistant--dave-protocol-discord-calls)
5. [🎙️ 5. Audio Transcription in History (Whisper On-Demand)](#-5-audio-transcription-in-history-whisper-on-demand)
6. [💾 6. Permanent AI Database & On-Demand Memory](#-6-permanent-ai-database--on-demand-memory-zero-token-overhead)
7. [🎙️ 7. Native Voice Messages (XTTS v2)](./VOICE.md)
8. [💡 Advanced Usage Tips](#-advanced-usage-tips)

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

## 🎙️ 5. Audio Transcription in History (Whisper On-Demand)

Hikari doesn't ignore voice notes sent in channels! When called upon in a chat whose recent history contains voice messages:

- **On-Demand Transcription:** Hikari only sends the voice audio file to Whisper when a user explicitly mentions her or asks a question relating to that conversation context.
- **Provider Hierarchy:** Primarily leverages **Wit.ai** for fast, free transcriptions across Portuguese and other languages, with automated fallback to the **Groq** API (`whisper-large-v3-turbo`).
- **Persistent Cache per Message:** Once a message's voice audio has been transcribed, the text is cached and mapped to that message in memory. Subsequent queries reuse the cached transcription without re-triggering API calls.
- **Intelligent Audio Type Filtering:** Discord voice notes are formatted as `[Transcribed audio: "..."]`, while standard music files or sound effects are identified solely by filename (e.g. `song.mp3`), preventing wasteful transcription attempts on music tracks.

---

## 💾 6. Permanent AI Database & On-Demand Memory (Zero Token Overhead)

To avoid inflating the System Prompt on every request with hundreds of static tokens or historical facts, Hikari features an **autonomous permanent database** (`src/data/ai_database.json`).

- **On-Demand Retrieval & Multi-Topic Aggregation (`db_read`):** Rather than stuffing all context into the prompt, the AI autonomously queries memory. It features tiered key lookup and **automatic aggregation**: if multiple records exist regarding a topic (e.g., `sekinin`, `sekinin_rules`, `sekinin_events`), it correlates and synthesizes all of them into a single, cohesive answer.
- **Author Tracking & Auditing (`db_write`):** Whenever storing a record, Hikari records authorship metadata (`salvo_por: "username - id"`, `savedById`, `savedByTag`) and an importance classification (`important: boolean`, default `false`), intelligently evaluated by the AI.
- **Secure Editing (`db_edit`):** Allows updating, correcting, or appending to existing notes while preserving authorship and history.
- **Controlled Deletion (`db_delete`):** Removes records from disk when explicitly requested.
- **Protection Against Unauthorized Edits & Deletions:**
  - Records tagged as **important** (`important: true`) can only be modified or deleted by the **original author** who created them, by **Server Staff/Moderators** (`Administrator`, `ManageGuild`, `ManageMessages`, or Server Owner), or by the **Bot Creator** (`isOwner`).
  - Unauthorized attempts by regular members are politely and naturally refused in chat by Hikari (without emojis), safeguarding community lore and notes against trolls.
  - Simple records (`important: false`) can be edited or deleted normally by any member.
- **Privacy Shield Against Bulk Dumps:** The AI is strictly barred from dumping the entire database (`*`, `all`, `dump`) for regular users, naturally explaining privacy constraints and asking the user to specify a topic.
- **Conduct Directives & Harmful Content Prevention:** Hikari strictly refuses to store defamatory notes, user harassment, attacks, Discord TOS violations, or criminal activities in the database.
- **Visual Footer Identification:** Responses derived from database lookups display the footer badge `-# 💾 Database`.
- **Creator Protection (`protected: true`):** Core structural records (such as `creator_info`) are locked against modification or deletion by anyone other than the bot creator.
- **Granular Control via Environment & Panel:** Access can be individually managed via `.env` (`AI_DB_READ`, `AI_DB_WRITE`, `AI_DB_EDIT`, `AI_DB_DELETE`) or toggled inside the Owner Config Panel (`/config`). Disabling read access automatically cascades to block write, edit, and delete operations.
- **Open-Source Privacy:** The database file `src/data/ai_database.json` is ignored in `.gitignore`, ensuring personal notes never leak to public repositories.

---

## 🎙️ 7. Native Voice Messages (XTTS v2 Neural Voice)

Hikari supports sending official voice notes in Discord chat with the native microphone player (`flags: 8192`), interactive waveform scrubber, and neural voice synthesis powered by XTTS v2.

- **Full Documentation & Training/Deploy Tutorial**: Check out the dedicated guide at [🎙️ Hikari Neural Voice System](./VOICE.md).

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
