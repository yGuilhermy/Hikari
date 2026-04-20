# ✨ Features, AI, and Media Processing

Hikari is not just a chat wrapper. It is an asynchronous processing ecosystem that combines LLMs, image diffusion, and metadata extraction.

---

## 📂 Summary

1. [🧠 1. Artificial Intelligence: The Prompt Life Cycle](#-1-artificial-intelligence-the-prompt-life-cycle)
2. [🎨 2. Image Generation (Provider Hierarchy)](#-2-image-generation-provider-hierarchy)
3. [🎵 3. Audio and YouTube Processing](#-3-audio-and-youtube-processing)
4. [💡 Advanced Usage Tips](#-advanced-usage-tips)

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

## 🎵 3. Audio and YouTube Processing

We implemented a clean download system via `youtubeAudioHandler.js`.

- **Strategy:** The bot uses the `yt-dlp` binary to extract only the best audio stream (`bestaudio`).
- **Conversion:** The audio is converted via `ffmpeg` to MP3 with an optimized bitrate for Discord.
- **Automatic Cleanup:** After sending the file, the handler automatically cleans up the local file from the `temp_audio` folder (or the corresponding audio folder) to avoid disk saturation.

---

## 💡 Advanced Usage Tips

- 💡 **Chat Summary (`/chat_resumo`):** The AI reads the last N messages and creates a semantic mapping of who said what and about which topics. Excellent for managing busy channels.
- 💡 **Trace.moe Integration:** The `/anime_origem` function allows you to find animes just by sending a frame. It returns the title, episode, and approximate timestamp.
- 💡 **Game Search and Steam Prices:** Hikari not only searches for Magnet links in FitGirl/DODI databases but can also natively consult **Steam**! Just ask naturally, like "Is Elden Ring on sale on Steam?", and she will return updated data, prices, and a synopsis, all directly from the chat.
- 💡 **Currency and Crypto Converter:** Convert any value between real currencies (BRL, USD, EUR) or crypto (BTC, ETH) just by asking "how much is bitcoin today?". She uses real-time financial APIs to ensure mathematical accuracy.

---

> [!TIP]
> To see the full list of commands and detailed explanations, see the [Commands Guide](./COMMANDS.md).

---
[🏠 Back to Main Menu](../../README.md)
