# 🎙️ Sistema Vocal Neural da Hikari (Discord Voice Message & XTTS v2)

Este documento detalha o funcionamento técnico da voz neural da Hikari, a arquitetura de envio de mensagens de voz nativas no Discord, o bypass de transcrição, o tutorial para clonagem e extração de latentes do modelo XTTS v2 e o passo a passo para hospedagem gratuita e de alta performance no Hugging Face Space e Modal.com.

---

## 📂 Sumário

1. [🧠 1. Arquitetura e Funcionamento Geral](#-1-arquitetura-e-funcionamento-geral)
2. [🎙️ 2. Mensagens de Voz Nativas no Discord (Microfone Real)](#-2-mensagens-de-voz-nativas-no-discord-microfone-real)
3. [⚡ 3. Gatilhos: Decisão da IA e Disparo do Dono](#-3-gatilhos-decisão-da-ia-e-disparo-do-dono)
4. [🏎️ 4. Prioridade de Provedores: Hugging Face e Modal](#-4-prioridade-de-provedores-hugging-face-e-modal)
5. [🔄 5. Otimização de Cotas e Bypass do Whisper](#-5-otimização-de-cotas-e-bypass-do-whisper)
6. [🛠️ 6. Tutorial: Clonagem e Extração de Latentes (XTTS v2)](#-6-tutorial-clonagem-e-extração-de-latentes-xtts-v2)
7. [🤗 7. Tutorial: Hospedagem no Hugging Face Space (ZeroGPU)](#-7-tutorial-hospedagem-no-hugging-face-space-zerogpu)
8. [☁️ 8. Tutorial: Hospedagem no Modal.com (NVIDIA T4 Serverless)](#-8-tutorial-hospedagem-no-modalcom-nvidia-t4-serverless)
9. [⚙️ 9. Configurações do Bot (.env e /config)](#-9-configurações-do-bot-env-e-config)

---

## 🧠 1. Arquitetura e Funcionamento Geral

A Hikari não reproduz apenas áudio em chamadas de voz; ela possui a capacidade de se comunicar diretamente nos canais de texto através de **Mensagens de Voz Oficiais do Discord**.

```text
[Interação do Usuário]
         │
         ▼
[LLM (Gemini / Qwen)] ───► Decisão via MCP Tool 'send_voice_note' ou Gatilho '!'
         │
         ▼
[ttsService.js: cleanForTts] ───► Dicionário Fonético PT-BR e Limpeza de Formatação
         │
         ├───► [1º Hugging Face Space (ZeroGPU)] (~5s, sem cold start longo)
         │           │
         │           ▼ (Se falhar ou esgotar cota)
         └───► [2º Modal.com (NVIDIA T4)] (~1.9s aquecido / ~35s cold start)
                     │
                     ▼
             [Buffer de Áudio WAV]
                     │
                     ▼
         [FFmpeg: Transcodificação Opus] (voice-message.ogg, 48kbps VBR)
                     │
                     ▼
     [Cálculo de Waveform & Duração] (256 picos PCM em Base64)
                     │
                     ▼
[Discord REST API: Upload em 2 etapas] (flags: 8192)
                     │
                     ├───► Mensagem de voz oficial no chat
                     └───► Registro no transcriptionCache (Bypass do Whisper)
```

---

## 🎙️ 2. Mensagens de Voz Nativas no Discord (Microfone Real)

Diferente de bots que enviam arquivos genéricos `.mp3` como anexos de download, a Hikari utiliza o protocolo oficial de mensagens de voz do Discord:

1. **Player de Microfone:** O aplicativo do Discord identifica o áudio com a flag de sistema `flags: 8192` e o renderiza com o botão circular de reprodução, controle de velocidade (1x, 1.5x, 2x) e waveform interativa.
2. **Formato do Arquivo:** O áudio é convertido em streaming direto via FFmpeg para o container OGG com codec Opus (`-c:a libopus -b:a 48k -vbr on -f ogg`). O nome do arquivo deve ser obrigatoriamente `voice-message.ogg`.
3. **Extração de Waveform:** O sistema analisa as amostras PCM de 16 bits do áudio sintetizado, dividindo a faixa em 256 blocos uniformes. O pico RMS de cada bloco é normalizado para um valor de 0 a 255 e codificado em uma string Base64.
4. **Fluxo de Upload REST:** Como bibliotecas de alto nível frequentemente ignoram os metadados de waveform, o envio é feito via chamadas diretas à API REST do Discord (v10):
   - `POST /channels/{channel_id}/attachments`: Solicita uma URL de upload pré-assinada.
   - `PUT {upload_url}`: Envia o buffer binário do OGG diretamente para os servidores de mídia do Discord.
   - `POST /channels/{channel_id}/messages`: Cria a mensagem com `flags: 8192`, referenciando o anexo e informando `duration_secs` e `waveform`.

---

## ⚡ 3. Gatilhos: Decisão da IA e Disparo do Dono

O sistema de voz possui duas modalidades principais de disparo:

### A. Decisão Autônoma do Modelo (MCP Tool: `send_voice_note`)

A ferramenta `send_voice_note` é registrada no schema global de MCP tools da Hikari (`src/data/mcp_tools.json`). O modelo decide de forma orgânica quando falar:

- Quando o usuário pede um áudio explicitamente (_"me manda um áudio"_, _"fala comigo"_).
- Quando a IA decide, por contexto, responder em voz em vez de texto digitado.
- Durante a síntese, a mensagem temporária do bot é editada para `🎙️ **Gravando voz...**` e posteriormente apagada ao enviar o áudio final.

### B. Gatilho Forçado Exclusivo do Dono (`!`)

Para permitir que o mestre/dono force respostas em áudio sob demanda sem gastar tokens com comandos complexos:

- Se a mensagem iniciar com `!` e o autor for o dono (`config.isOwner(userId)`):
  - Por nome: `! hikari bom dia`
  - Por resposta direta: Clicar em responder em qualquer mensagem da Hikari e enviar `! bom dia`
  - Por menção: `! @Hikari conta uma história` ou `@Hikari ! fala comigo`
- O prefixo `!` é consumido da mensagem, uma diretiva instrui o modelo a responder com sentenças curtas adequadas para fala (1 a 4 frases) e a resposta é enviada obrigatoriamente como áudio de voz oficial.

### C. Comando Slash `/ia_chat` (Opção `voice: True|False`)

Qualquer usuário pode escolher explicitamente se deseja áudio oficial ou texto através do comando:

- `/ia_chat prompt: Me conte uma curiosidade voice:True`: Força a resposta a ser enviada como mensagem de voz nativa oficial (1 a 4 frases).
- `/ia_chat prompt: ... voice:False`: Força a resposta em texto, desativando voz espontânea e ferramentas de áudio.
- **Tratamento de Falhas (Fallback para Texto)**: Caso `voice:True` (ou o trigger do dono `!`) seja utilizado e os provedores de síntese (Hugging Face / Modal) falhem ou estejam indisponíveis, a Hikari envia o conteúdo normalmente em texto adicionando no rodapé `-# 🎙️ Houve uma falha na voz.`.

### D. Consulta Prévia ao Banco de Dados (Memória Contextual)

Quando o usuário pede para a Hikari falar sobre o seu criador (Guilhermy), sobre a identidade da bot ou tópicos salvos na memória, a IA consulta **primeiro o banco de dados** (`db_read`) para recuperar os fatos corretos. Em seguida, ela encadeia os dados na ferramenta de voz (`send_voice_note`) formulando 1 a 4 frases curtas e naturais.

---

## 🏎️ 4. Prioridade de Provedores: Hugging Face e Modal

Para conciliar tempo de resposta, cotas gratuitas e escalabilidade, o bot opera com uma hierarquia inteligente:

| Provedor               | Função       | Tempo Aquecido          | Tempo Frio (Cold Start) | Limite / Cota                         |
| :--------------------- | :----------- | :---------------------- | :---------------------- | :------------------------------------ |
| **Hugging Face Space** | **Primário** | ~5.5 segundos           | **~5 a 7 segundos**     | ZeroGPU compartilhado                 |
| **Modal.com**          | **Fallback** | **~1.5 a 2.0 segundos** | ~35 a 45 segundos       | $30 créditos/mês (~centenas de horas) |

### Por que o Hugging Face é o primário?

O servidor web do Hugging Face Space permanece em execução contínua (Always-ON). Quando uma solicitação chega após horas de inatividade, o decorador `@spaces.GPU` aloca a GPU instantaneamente e entrega o áudio em cerca de 5 a 6 segundos. No Modal, uma máquina desaquecida leva até 45 segundos para provisionar a imagem e carregar os pesos na VRAM. Caso o Hugging Face Space atinja sua cota diária ou ocorra fila, o Modal assume como fallback seguro com timeout de 90 segundos.

---

## 🔄 5. Otimização de Cotas e Bypass do Whisper

Quando usuários enviam áudios no chat, o bot precisa transcrevê-los usando Whisper (Groq / Wit.ai) para que o LLM entenda o que foi dito. No entanto, quando a própria Hikari envia um áudio:

1. No momento em que a mensagem de voz é enviada, a função `registerBotAudio(messageId, text)` grava o texto original diretamente no `transcriptionCache`.
2. Quando membros respondem à mensagem de voz da Hikari ou quando o histórico do canal é lido, o handler `resolveMessageAudioContent` detecta que a autoria é do bot e recupera o texto direto da memória.
3. O áudio da Hikari **nunca passa pelo Whisper**, economizando 100% das cotas de transcrição da API.
4. No contexto do chat, as mensagens de voz são estruturadas com a chave padronizada:
   `Hikari: [audio transcrito]: texto da resposta`

---

## 🛠️ 6. Tutorial: Clonagem e Extração de Latentes (XTTS v2)

Em vez de retreinar uma rede neural inteira (o que exige dezenas de horas de GPU e bases de dados enormes), o XTTS v2 utiliza **latentes neurais de condicionamento**. Basta extrair dois tensores a partir de um áudio de referência limpo para clonar qualquer voz perfeitamente.

### Pré-requisitos

- Python 3.10 ou 3.11.
- GPU NVIDIA com CUDA (ou processamento em CPU para extração única).
- Áudio de referência limpo (`golden_sample.wav`): 30 segundos a 2 minutos de voz clara, sem música de fundo, sem eco, em formato WAV 24.000 Hz ou 44.100 Hz mono.

### Script de Extração de Latentes (`extrair_latentes.py`)

```python
import os
import torch
from TTS.api import TTS

audio_referencia = "golden_sample.wav"
arquivo_saida = "voz_personalizada_v1.pth"

print("Carregando modelo base XTTS v2...")
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cuda" if torch.cuda.is_available() else "cpu")

print("Calculando latentes neurais a partir do áudio de referência...")
gpt_cond_latent, speaker_embedding = tts.synthesizer.tts_model.get_conditioning_latents(
    audio_path=[audio_referencia]
)

dados_salvos = {
    "gpt_cond_latent": gpt_cond_latent.cpu(),
    "speaker_embedding": speaker_embedding.cpu()
}

torch.save(dados_salvos, arquivo_saida)
print(f"Pesos de clonagem salvos com sucesso em: {arquivo_saida}")
```

O arquivo gerado `.pth` tem apenas alguns kilobytes e contém toda a identidade vocal da personagem pronta para ser carregada em nuvem.

---

## 🤗 7. Tutorial: Hospedagem no Hugging Face Space (ZeroGPU)

O Hugging Face Spaces permite hospedar uma API Gradio com aceleração ZeroGPU sem custos de servidor.

### 1. Criar o Space

- Acesse [huggingface.co/spaces](https://huggingface.co/spaces).
- Crie um novo Space selecionando o SDK **Gradio** e Hardware **ZeroGPU**.

### 2. Estrutura de Arquivos do Space

```text
meu-space-tts/
├── app.py
├── requirements.txt
└── voz_personalizada_v1.pth
```

### 3. Conteúdo do `requirements.txt`

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

### 4. Conteúdo do `app.py`

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
MODEL_PATH = os.path.join(BASE_DIR, "voz_personalizada_v1.pth")

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
    t_in = gr.Textbox(label="Texto")
    m_in = gr.Dropdown(choices=["v1"], value="v1", label="Modelo")
    s_in = gr.Slider(0.8, 1.5, value=1.15, label="Velocidade")
    tmp_in = gr.Slider(0.4, 0.9, value=0.65, label="Temperatura")
    p_in = gr.Slider(50, 400, value=200, label="Pausa (ms)")
    btn = gr.Button("Sintetizar")
    a_out = gr.Audio(label="Áudio", type="filepath")

    btn.click(
        synthesize,
        inputs=[t_in, m_in, s_in, tmp_in, p_in],
        outputs=[a_out],
        api_name="synthesize"
    )

demo.launch(server_name="0.0.0.0", server_port=7860)
```

Depois de publicado, o endpoint do Space será `https://seu-usuario-nome-do-space.hf.space`.

---

## ☁️ 8. Tutorial: Hospedagem no Modal.com (NVIDIA T4 Serverless)

O Modal.com oferece uma infraestrutura serverless para executar modelos em GPUs NVIDIA dedicadas (T4, A10G, A100) pagando apenas pelos segundos em que a GPU realiza a síntese.

### 1. Instalar a CLI do Modal e Autenticar

```bash
pip install modal
modal setup
```

### 2. Código do Servidor Modal (`modal_app.py`)

```python
import os
import io
import modal
import numpy as np
import soundfile as sf
import torch

app = modal.App("meu-audio-tts")

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
    .copy_local_file("voz_personalizada_v1.pth", "/root/voz_personalizada_v1.pth")
)

@app.cls(gpu="T4", image=image, scaled_down_window=300)
class TTSService:
    @modal.enter()
    def load_model(self):
        os.environ["COQUI_TOS_AGREED"] = "1"
        from TTS.api import TTS
        self.tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cuda")
        dados = torch.load("/root/voz_personalizada_v1.pth", map_location="cpu")
        self.cond_latent = dados["gpt_cond_latent"].to("cuda")
        self.speaker_emb = dados["speaker_embedding"].to("cuda")

    @modal.fastapi_endpoint(method="POST")
    def synthesize(self, payload: dict):
        from fastapi.responses import Response, JSONResponse

        text = payload.get("text", "")
        speed = float(payload.get("speed", 1.15))
        temperature = float(payload.get("temperature", 0.65))

        if not text:
            return JSONResponse({"error": "Texto ausente"}, status_code=400)

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

### 3. Realizar o Deploy

```bash
modal deploy modal_app.py
```

O Modal imprimirá o endpoint de acesso direto, por exemplo:
`https://seu-usuario--meu-audio-tts-ttsservice-synthesize.modal.run`.

---

## ⚙️ 9. Configurações do Bot (.env e /config)

Para vincular os serviços ao bot, declare as variáveis no seu `.env` ou configure pelo comando interativo `/config` no Discord:

```env
HF_TTS_ENDPOINT=https://seu-usuario-nome-do-space.hf.space
MODAL_TTS_ENDPOINT=https://seu-usuario--meu-audio-tts-ttsservice-synthesize.modal.run
HF_TOKEN=hf_seu_token_de_leitura_aqui

VOICE_CHAT_ENABLED=true
VOICE_SPONTANEOUS_ENABLED=true
VOICE_SPONTANEOUS_CHANCE=5
VOICE_COOLDOWN_MINUTES=15
VOICE_MAX_CHARS=180
VOICE_SPEED=1.15
VOICE_TEMPERATURE=0.65
```

### Painel `/config`

No Discord, digite `/config` e navegue até a categoria **🎙️ Voz & Áudio (TTS)** para ajustar velocidade, temperatura, cooldown e limites de caracteres diretamente pela interface de botões.
