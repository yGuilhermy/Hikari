# 🛠️ Desenvolvimento Externo e Sistema de Ferramentas (MCP)

Este guia é voltado para desenvolvedores e entusiastas que desejam expandir o cérebro da Hikari usando o **Model Context Protocol (MCP)**.

---

## 🧰 1. Entendendo as "Tools" (Ferramentas)

A Hikari não sabe fazer tudo sozinha. Ela utiliza "Tools" para estender suas capacidades. Quando a IA responde em formato JSON contendo um campo `tool`, o bot interrompe a resposta de texto e executa uma função programada.

### O Fluxo Técnico:
1.  **Declaração:** A ferramenta é descrita no arquivo `src/data/mcp_tools.json`.
2.  **Identificação:** A IA recebe essas descrições no System Prompt.
3.  **Execução:** O `llmHandler.js` intercepta o JSON, executa a lógica em Node.js (ex: `performWebSearch`) e devolve o resultado para a IA finalizar a resposta.

---

## 📂 2. Como criar uma nova Ferramenta?

### Passo 1: Definir no JSON
Adicione um novo objeto em `src/data/mcp_tools.json`:
```json
{
  "type": "function",
  "function": {
    "name": "meu_comando",
    "description": "Explicação para a IA saber quando usar.",
    "parameters": { ... }
  }
}
```

### Passo 2: Implementar no Handler
No arquivo `src/handlers/llmHandler.js`, adicione a lógica de execução dentro da função `processQueue()` ou crie um handler específico. Certifique-se de tratar erros para que a IA não fique "travada" esperando uma resposta.

---

## 🏗️ 3. Personalizando a Alma (System Prompt)

A personalidade da Hikari não é apenas texto; é um conjunto de diretrizes de segurança e comportamento.
- **Local:** `src/config/index.js` -> campo `systemPrompt`.
- **Dica:** Se você alterar as regras de formatação (como permitir emojis), lembre-se de que isso pode aumentar o consumo de tokens e mudar o "tom" das conversas.

---

## 💡 Dicas de Desenvolvimento

- 💡 **Logs de Pensamento (Thought Trace):** Observe o console. A Hikari imprime o `"thought"` da IA antes de cada ação de ferramenta. Se ela estiver "alucinando", ajuste a descrição da ferramenta no JSON.
- 💡 **Permissions:** Ao criar ferramentas que deletam mensagens ou gerenciam cargos, certifique-se de que o Bot tem essas permissões no Discord, caso contrário, a `discord.js` lançará um erro de `Missing Permissions`.
- 💡 **Isolamento de Erros:** Sempre use `try-catch` em volta de novas ferramentas. Uma ferramenta mal implementada pode derrubar todo o processo do bot se não for tratada.

---
[🏠 Voltar ao Menu Principal](../README.md)
