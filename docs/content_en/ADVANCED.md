# 🛠️ External Development and Tool System (MCP)

This guide is for developers and enthusiasts who wish to expand Hikari's brain using the **Model Context Protocol (MCP)**.

---

## 📂 Summary

1. [🧰 1. Understanding "Tools"](#-1-understanding-tools)
2. [📂 2. How to create a new Tool?](#-2-how-to-create-a-new-tool)
3. [🏗️ 3. Customizing the Soul (System Prompt)](#-3-customizing-the-soul-system-prompt)
4. [💡 Development Tips](#-development-tips)

---

## 🧰 1. Understanding "Tools"

Hikari doesn't know how to do everything by herself. She uses "Tools" to extend her capabilities. When the AI responds in a JSON format containing a `tool` field, the bot interrupts the text response and executes a programmed function.

### The Technical Flow:
1.  **Declaration:** The tool is described in the `src/data/mcp_tools.json` file.
2.  **Identification:** The AI receives these descriptions in the System Prompt.
3.  **Execution:** `llmHandler.js` intercepts the JSON, executes the logic in Node.js (e.g., `performWebSearch`), and returns the result to the AI to finalize the response.

---

## 📂 2. How to create a new Tool?

### Step 1: Define in JSON
Add a new object in `src/data/mcp_tools.json`:
```json
{
  "type": "function",
  "function": {
    "name": "my_command",
    "description": "Explanation for the AI to know when to use it.",
    "parameters": { ... }
  }
}
```

### Step 2: Implement in the Handler
In the `src/handlers/llmHandler.js` file, add the execution logic inside the `processQueue()` function or create a specific handler. Make sure to handle errors so the AI doesn't get "stuck" waiting for a response.

---

## 🏗️ 3. Customizing the Soul (System Prompt)

Hikari's personality is not just text; it's a set of safety and behavior guidelines.
- **Location:** `src/config/index.js` -> `systemPrompt` field.
- **Tip:** If you change the formatting rules (such as allowing emojis), remember that this can increase token consumption and change the "tone" of the conversations.

---

## 💡 Development Tips

- 💡 **Thought Trace Logs:** Watch the console. Hikari prints the AI's `"thought"` before each tool action. If it's "hallucinating", adjust the tool description in the JSON.
- 💡 **Permissions:** When creating tools that delete messages or manage roles, make sure the Bot has those permissions in Discord; otherwise, `discord.js` will throw a `Missing Permissions` error.
- 💡 **JSON Sanitization:** Always pass the AI's outputs through a `JSON.parse` filter if you're requesting structured logs, as smaller models can "leak" keys like `{"response": "..."}` in the middle of the text.
- 💡 **Internal Comments:** The bot uses recursive calls (`isInternalComment: true`) to generate natural speech after tool use, ensuring the AI always has a human "voice" after processing raw data.
- 💡 **Error Isolation:** Always use `try-catch` around new tools. A poorly implemented tool can bring down the entire bot process if not handled.

---
[🏠 Back to Main Menu](../../README.md)
