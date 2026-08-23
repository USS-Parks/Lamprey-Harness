# Train elsewhere, serve here

Lamprey does not train models. Fine-tune in Unsloth (or any other trainer), export or serve an OpenAI-compatible `/v1` endpoint, then point Lamprey at that URL.

1. Train and export outside Lamprey.
2. Serve the result (Ollama, LM Studio, Unsloth Studio API, vLLM, llama.cpp, …).
3. Settings → API keys → **Local presets**: Ollama and LM Studio fill the built-in base URL if you have not already set one. Unsloth Studio adds a custom endpoint (`http://127.0.0.1:8000/v1` by default — edit the port if yours differs).
4. Settings → Models → import from `/v1/models`. Tool calling and vision stay **off** until you enable them.

Local tools still go through approval, snip, and gated filters. There is no LoRA / RL trainer in the app.
