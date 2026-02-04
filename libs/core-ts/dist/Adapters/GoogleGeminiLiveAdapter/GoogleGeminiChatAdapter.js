"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleGeminiChatAdapter = void 0;
const genai_1 = require("@google/genai");
class GoogleGeminiChatAdapter {
    constructor(apiKey, onTextReceived, onScoreReceived, onUserTextReceived) {
        this.history = [];
        this.systemInstruction = '';
        this.modelName = 'gemini-2.0-flash-exp';
        this.config = {};
        this.apiKey = apiKey;
        this.onTextReceived = onTextReceived || (() => { });
        this.onScoreReceived = onScoreReceived || (() => { });
        this.onUserTextReceived = onUserTextReceived || (() => { });
        this.client = new genai_1.GoogleGenAI({ apiKey: this.apiKey });
    }
    async connect(systemInstruction, enableScoreTracking, voice, temperature, topP) {
        if (!this.apiKey) {
            console.error('Falta la API Key de Gemini');
            return false;
        }
        this.history = [];
        this.config = {
            temperature: temperature,
            topP: topP
        };
        this.tools = [];
        if (enableScoreTracking) {
            this.tools.push({
                functionDeclarations: [
                    {
                        name: 'report_score',
                        description: 'Report the score of the user\'s answer effectiveness.',
                        parameters: {
                            type: 'OBJECT',
                            properties: {
                                score: {
                                    type: 'INTEGER',
                                    description: 'The score of the answer from 0 to 10.',
                                },
                            },
                            required: ['score'],
                        },
                    },
                ],
            });
        }
        // Add instructions
        this.systemInstruction = systemInstruction;
        if (enableScoreTracking) {
            this.systemInstruction += '\n\nIMPORTANT: You are configured to track the user\'s answer quality. When the user answers, you MUST evaluate it and call the "report_score" function with a score from 0 to 10.';
        }
        console.log("Gemini Chat (Text) Connected");
        return true;
    }
    disconnect() {
        this.history = [];
    }
    async sendText(text) {
        try {
            // Add user message
            this.history.push({ role: 'user', parts: [{ text: text }] });
            await this.generateResponse();
        }
        catch (e) {
            console.error("Error sending text to Gemini Chat", e);
            console.error("Error al enviar mensaje (Chat)");
        }
    }
    async generateResponse() {
        console.log("Gemini Chat: generateResponse started. History length:", this.history.length);
        try {
            const req = {
                model: this.modelName,
                contents: this.history,
                config: {
                    ...this.config,
                    systemInstruction: { parts: [{ text: this.systemInstruction }] },
                }
            };
            if (this.tools && this.tools.length > 0) {
                req.config.tools = this.tools;
            }
            const stream = await this.client.models.generateContentStream(req);
            let fullText = "";
            let functionCalls = [];
            for await (const chunk of stream) {
                const candidates = chunk.candidates;
                if (!candidates || candidates.length === 0)
                    continue;
                const parts = candidates[0].content?.parts;
                if (!parts)
                    continue;
                for (const part of parts) {
                    // Handle Text
                    if (part.text) {
                        const text = part.text;
                        this.onTextReceived(text);
                        fullText += text;
                    }
                    // Handle Function Call
                    if (part.functionCall) {
                        functionCalls.push(part.functionCall);
                        // Process Score Immediately
                        const call = part.functionCall;
                        if (call.name === 'report_score') {
                            const args = call.args;
                            console.log("Gemini Chat: report_score called", args);
                            if (args && args.score !== undefined) {
                                let score = args.score;
                                if (typeof score === 'string')
                                    score = parseInt(score, 10);
                                if (!isNaN(score)) {
                                    this.onScoreReceived(score);
                                }
                            }
                        }
                    }
                }
            }
            // Append model response to history
            const modelParts = [];
            if (fullText) {
                modelParts.push({ text: fullText });
            }
            if (functionCalls.length > 0) {
                functionCalls.forEach(call => modelParts.push({ functionCall: call }));
            }
            if (modelParts.length > 0) {
                this.history.push({ role: 'model', parts: modelParts });
            }
            // If we had function calls, we MUST respond to them to continue the conversation
            if (functionCalls.length > 0) {
                console.log(`Gemini Chat: Found ${functionCalls.length} function calls. Processing...`);
                for (const call of functionCalls) {
                    // Assuming call.id is available, if not, a unique ID might need to be generated or omitted if not required by the API for functionResponse
                    console.log(`Gemini Chat: Sending response for ${call.name}`);
                    await this.sendFunctionResponse(call.name, call.id, { result: 'ok' });
                }
            }
            else {
                console.log("Gemini Chat: No function calls found in this turn.");
            }
        }
        catch (e) {
            console.error("Error generating response", e);
            console.error(`Gemini Chat Error: ${e}`);
        }
    }
    sendContextUpdate(fileName, content) {
        const updateMsg = `SYSTEM UPDATE from ${fileName}:\n${content}`;
        // In Chat Mode, we want this to trigger a response because it's usually the "Question"
        this.sendText(updateMsg);
    }
    async sendFunctionResponse(name, id, response) {
        // Push function response
        this.history.push({
            role: 'function',
            parts: [{
                    functionResponse: {
                        name: name,
                        response: response
                    }
                }]
        });
        // Trigger next generation to continue conversation (model will see the function output and continue)
        await this.generateResponse();
    }
    // Audio methods - No-op
    async resumeAudio() { }
}
exports.GoogleGeminiChatAdapter = GoogleGeminiChatAdapter;
