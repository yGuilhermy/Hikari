# 🎙️ Hikari Neural Voice System (Discord Voice Message & XTTS v2)

This document covers the technical design of Hikari's neural voice system, the architecture for sending official Discord Voice Messages, the transcription bypass mechanism, the tutorial for voice cloning and latent extraction with XTTS v2, and step-by-step instructions for hosting on Hugging Face Spaces (ZeroGPU) and Modal.com (NVIDIA T4).

---

## 📂 Table of Contents

1. [🧠 1. Architecture and Overview](#-1-architecture-and-overview)
2. [🎙️ 2. Official Discord Voice Messages (Microphone Audio)](#-2-official-discord-voice-messages-microphone-audio)
3. [⚡ 3. Triggers: AI Autonomous Decision & Owner Forced Trigger](#-3-triggers-ai-autonomous-decision--owner-forced-trigger)
4. [🏎️ 4. Provider Priority: Hugging Face and Modal.com](#-4-provider-priority-hugging-face-and-modalcom)
5. [🔄 5. Quota Optimization & Whisper Bypass](#-5-quota-optimization--whisper-bypass)
6. [🛠️ 6. Tutorial: Voice Cloning & Latent Extraction (XTTS v2)](#-6-tutorial-voice-cloning--latent-extraction-xtts-v2)
7. [🤗 7. Tutorial: Hosting on Hugging Face Spaces (ZeroGPU)](#-7-tutorial-hosting-on-hugging-face-spaces-zerogpu)
8. [☁️ 8. Tutorial: Hosting on Modal.com (NVIDIA T4 Serverless)](#-8-tutorial-hosting-on-modalcom-nvidia-t4-serverless)
9. [⚙️ 9. Bot Configuration (.env and /config)](#-9-bot-configuration-env-and-config)

---

## 🧠 1. Architecture and Overview

Hikari does not merely play audio streams in voice calls; she communicates directly inside Discord text channels using **Official Discord Voice Messages**.

```text
[User Interaction]
         │
         ▼
[LLM (Gemini / Qwen)] ───► Decides via MCP Tool 'send_voice_note' or Owner '!' Trigger
         │
         ▼
[ttsService.js: cleanForTts] ───► Phonetic Dictionary & Markdown Normalization
         │
         ├───► [1st: Hugging Face Space (ZeroGPU)] (~5s, no long cold start)
         │           │
         │           ▼ (On failure, quota limit, or timeout)
         └───► [2nd: Modal.com (NVIDIA T4)] (~1.9s warm / ~35s cold start)
                     │
                     ▼
             [WAV Audio Buffer]
                     │
                     ▼
         [FFmpeg: Opus Transcoding] (voice-message.ogg, 48kbps VBR)
                     │
                     ▼
     [Waveform & Duration Extraction] (256 PCM peaks in Base64)
                     │
                     ▼
[Discord REST API: 2-step Upload] (flags: 8192)
                     │
                     ├───► Official Voice Message in chat
                     └───► Cached in transcriptionCache (Whisper Bypass)
```

---

## 🎙️ 2. Official Discord Voice Messages (Microphone Audio)

Instead of sending generic `.mp3` files as attachments, Hikari utilizes Discord's official voice message protocol:

1. **Microphone Player:** The Discord client recognizes `flags: 8192` and renders a circular play button, speed adjustments (1x, 1.5x, 2x), and an interactive waveform scrubber.
2. **File Requirements:** Audio is piped into FFmpeg to create an OGG container with Opus audio (`-c:a libopus -b:a 48k -vbr on -f ogg`). The filename must be strictly `voice-message.ogg`.
3. **Waveform Calculation:** The synthesized 16-bit PCM audio is divided into 256 equal segments. Peak RMS amplitude is calculated for each segment, normalized from 0 to 255, and converted to a Base64 string.
4. **Discord REST API Upload:**
   - `POST /channels/{channel_id}/attachments`: Requests a pre-signed upload URL.
   - `PUT {upload_url}`: Streams the raw binary OGG buffer to Discord storage.
   - `POST /channels/{channel_id}/messages`: Posts the message with `flags: 8192`, referencing the uploaded file, `duration_secs`, and `waveform`.

---

## ⚡ 3. Triggers: AI Autonomous Decision & Owner Forced Trigger

Voice synthesis is triggered through two main mechanisms:

### A. Autonomous Model Choice (MCP Tool: `send_voice_note`)

Registered in `src/data/mcp_tools.json`. The AI autonomously calls this tool when:

- A user asks her to send voice or speak (_"send me an audio"_, _"say something out loud"_).
- The AI decides the conversation is better served with voice rather than text.
- During synthesis, the placeholder message is edited to `🎙️ **Gravando voz...**` and deleted upon audio delivery.

### B. Owner Forced Voice Trigger (`!`)

Exclusive to the bot owner (`config.isOwner(userId)`):

- By name: `! hikari good morning`
- By direct reply: Replying to any Hikari message with `! tell me a story`
- By mention: `! @Hikari say something` or `@Hikari ! speak to me`
- The leading `!` is stripped from the prompt, voice guidelines are injected into the prompt (1 to 4 sentences), and response delivery as an official voice message is mandatory.

### C. Slash Command `/ia_chat` (Option `voice: True|False`)

Users can explicitly choose whether they want official voice audio or plain text:

- `/ia_chat prompt: Tell me a fact voice:True`: Forces the response to be rendered as an official Discord Voice Message (1 to 4 short sentences).
- `/ia_chat prompt: ... voice:False`: Forces text response, disabling spontaneous voice and voice note tools.
- **Failure Handling (Text Fallback)**: If `voice:True` (or the owner's `!` trigger) is active and synthesis providers (Hugging Face / Modal) fail or timeout, Hikari delivers the response as plain text with the notice `-# 🎙️ Houve uma falha na voz.`.

### D. Prior Database Memory Context Before Speaking

When asked to speak about her creator (Guilhermy), bot personality, or saved guild records, the model queries the **internal database first** (`db_read`) to retrieve accurate context. It then chains the retrieved context directly into the voice generator (`send_voice_note`) to speak 1 to 4 natural, concise sentences.

---

## 🏎️ 4. Provider Priority: Hugging Face and Modal.com

To balance fast response times, zero server costs, and scalability, Hikari implements a dual-cloud fallback hierarchy:

| Provider               | Role         | Warm Response           | Cold Start          | Quota / Cost                                |
| :--------------------- | :----------- | :---------------------- | :------------------ | :------------------------------------------ |
| **Hugging Face Space** | **Primary**  | ~5.5 seconds            | **~5 to 7 seconds** | Free ZeroGPU                                |
| **Modal.com**          | **Fallback** | **~1.5 to 2.0 seconds** | ~35 to 45 seconds   | $30 free credits/month (~hundreds of hours) |

### Why is Hugging Face primary?

The FastAPI/Gradio web host on Hugging Face Spaces is Always-ON. When an audio request arrives after hours of inactivity, `@spaces.GPU` provisions GPU compute dynamically in ~5 to 7 seconds. On Modal, cold containers scale down to 0, requiring up to 45 seconds to initialize and load weights into VRAM. If Hugging Face encounters high demand or daily quota limits, Modal seamlessly takes over with a 90-second timeout window.

---

## 🔄 5. Quota Optimization & Whisper Bypass

Incoming voice messages from Discord users are transcribed using Whisper (Groq / Wit.ai). When Hikari speaks:

1. Upon sending a voice message, `registerBotAudio(messageId, text)` stores the spoken text directly in `transcriptionCache`.
2. When users reply to Hikari's audio or when conversation history is fetched, `resolveMessageAudioContent` identifies the author as the bot and loads the cached transcript immediately.
3. Hikari's voice messages **never trigger external Whisper API calls**, saving 100% of the transcription quota.
4. Audio transcripts in history follow the standardized bracketed key format:
   `Hikari: [audio transcrito]: message content`

---

## 🛠️ 6. Tutorial: Voice Cloning & Latent Extraction (XTTS v2)

XTTS v2 does not require retraining the complete neural network. It uses **neural conditioning latents**. You only need to extract two tensor embeddings from a clean reference audio.

### Prerequisites

- Python 3.10 or 3.11.
- NVIDIA GPU with CUDA (or CPU for a one-time extraction).
- Clean reference audio (`golden_sample.wav`): 30 seconds to 2 minutes of clean speech, no background music, no reverb, 24kHz or 44.1kHz mono WAV.

### Latent Extraction Script (`extract_latents.py`)

```python
import os
import torch
from TTS.api import TTS

reference_audio = "golden_sample.wav"
output_file = "custom_voice_v1.pth"

print("Loading XTTS v2 model...")
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cuda" if torch.cuda.is_available() else "cpu")

print("Calculating conditioning latents from reference audio...")
gpt_cond_latent, speaker_embedding = tts.synthesizer.tts_model.get_conditioning_latents(
    audio_path=[reference_audio]
)

saved_data = {
    "gpt_cond_latent": gpt_cond_latent.cpu(),
    "speaker_embedding": speaker_embedding.cpu()
}

torch.save(saved_data, output_file)
print(f"Cloning weights saved successfully to: {output_file}")
```

The output `.pth` file is lightweight (a few kilobytes) and ready for cloud deployment.

---

## 🤗 7. Tutorial: Hosting on Hugging Face Spaces (ZeroGPU)

Hugging Face Spaces allows you to host a Gradio API powered by dynamic ZeroGPU allocation at zero cost.

### 1. Create the Space

- Visit [huggingface.co/spaces](https://huggingface.co/spaces).
- Create a new Space with the **Gradio** SDK and select **ZeroGPU** hardware.

### 2. Space File Structure

```text
my-tts-space/
├── app.py
├── requirements.txt
└── custom_voice_v1.pth
```

### 3. `requirements.txt`

```text
torch
torchaudio
soundfile
numpy
TTS
spaces
gradio
gradio_client
```

### 4. `app.py`

```python
import os
import io
import spaces
import torch
import numpy as np
import soundfile as sf
import gradio as gr
from TTS.api import TTS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "custom_voice_v1.pth")

tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cuda")

latents_data = torch.load(MODEL_PATH, map_location="cpu")
cond_latent = latents_data["gpt_cond_latent"].to("cuda")
speaker_emb = latents_data["speaker_embedding"].to("cuda")

@spaces.GPU(duration=30)
def synthesize(text, model="v1", speed=1.15, temperature=0.65, pause_spacing_ms=200):
    if not text or len(text.strip()) == 0:
        return None

    out = tts.synthesizer.tts_model.inference(
        text=text,
        language="pt",
        gpt_cond_latent=cond_latent,
        speaker_embedding=speaker_emb,
        temperature=temperature,
        speed=speed,
        enable_text_splitting=True
    )

    out_path = os.path.join(BASE_DIR, "output.wav")
    sf.write(out_path, np.array(out["wav"]), 24000, format="WAV")
    return out_path

with gr.Blocks(title="Neural Voice TTS") as demo:
    t_in = gr.Textbox(label="Text")
    m_in = gr.Dropdown(choices=["v1"], value="v1", label="Model")
    s_in = gr.Slider(0.8, 1.5, value=1.15, label="Speed")
    tmp_in = gr.Slider(0.4, 0.9, value=0.65, label="Temperature")
    p_in = gr.Slider(50, 400, value=200, label="Pause (ms)")
    btn = gr.Button("Synthesize")
    a_out = gr.Audio(label="Audio", type="filepath")

    btn.click(
        synthesize,
        inputs=[t_in, m_in, s_in, tmp_in, p_in],
        outputs=[a_out],
        api_name="synthesize"
    )

demo.launch(server_name="0.0.0.0", server_port=7860)
```

The resulting Space endpoint will be `https://your-username-space-name.hf.space`.

---

## ☁️ 8. Tutorial: Hosting on Modal.com (NVIDIA T4 Serverless)

Modal provides serverless infrastructure for running GPU workloads on dedicated NVIDIA GPUs, billing strictly per second of synthesis time.

### 1. Install Modal CLI and Authenticate

```bash
pip install modal
modal setup
```

### 2. Modal Server Code (`modal_app.py`)

```python
import os
import io
import modal
import numpy as np
import soundfile as sf
import torch

app = modal.App("my-tts-audio")

image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "git")
    .pip_install(
        "torch",
        "torchaudio",
        "soundfile",
        "numpy",
        "TTS",
        "fastapi[standard]"
    )
    .copy_local_file("custom_voice_v1.pth", "/root/custom_voice_v1.pth")
)

@app.cls(gpu="T4", image=image, scaled_down_window=300)
class TTSService:
    @modal.enter()
    def load_model(self):
        os.environ["COQUI_TOS_AGREED"] = "1"
        from TTS.api import TTS
        self.tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cuda")
        data = torch.load("/root/custom_voice_v1.pth", map_location="cpu")
        self.cond_latent = data["gpt_cond_latent"].to("cuda")
        self.speaker_emb = data["speaker_embedding"].to("cuda")

    @modal.fastapi_endpoint(method="POST")
    def synthesize(self, payload: dict):
        from fastapi.responses import Response, JSONResponse

        text = payload.get("text", "")
        speed = float(payload.get("speed", 1.15))
        temperature = float(payload.get("temperature", 0.65))

        if not text:
            return JSONResponse({"error": "Missing text"}, status_code=400)

        out = self.tts.synthesizer.tts_model.inference(
            text=text,
            language="pt",
            gpt_cond_latent=self.cond_latent,
            speaker_embedding=self.speaker_emb,
            temperature=temperature,
            speed=speed,
            enable_text_splitting=True
        )

        buffer = io.BytesIO()
        sf.write(buffer, np.array(out["wav"]), 24000, format="WAV")
        buffer.seek(0)
        return Response(content=buffer.read(), media_type="audio/wav")
```

### 3. Deploy to Modal

```bash
modal deploy modal_app.py
```

Modal outputs a direct public URL, for example:
`https://your-username--my-tts-audio-ttsservice-synthesize.modal.run`.

---

## ⚙️ 9. Bot Configuration (.env and /config)

Set your environment variables in `.env` or manage them via the `/config` dashboard in Discord:

```env
HF_TTS_ENDPOINT=https://your-username-space-name.hf.space
MODAL_TTS_ENDPOINT=https://your-username--my-tts-audio-ttsservice-synthesize.modal.run
HF_TOKEN=hf_your_read_token_here

VOICE_CHAT_ENABLED=true
VOICE_SPONTANEOUS_ENABLED=true
VOICE_SPONTANEOUS_CHANCE=5
VOICE_COOLDOWN_MINUTES=15
VOICE_MAX_CHARS=180
VOICE_SPEED=1.15
VOICE_TEMPERATURE=0.65
```

### `/config` Command

In Discord, run `/config` and open **🎙️ Voz & Áudio (TTS)** to customize speed, temperature, cooldowns, and character caps directly through interactive components.
