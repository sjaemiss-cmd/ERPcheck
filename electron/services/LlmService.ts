import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { z } from 'zod';

// Define the schema for the LLM output (Zod for type inference)
const ReservationSchema = z.object({
    isBooking: z.boolean().describe("Whether the user is asking for a reservation or related inquiry."),
    name: z.string().describe("The customer's name extracted from the context or profile."),
    date: z.string().nullable().describe("The reservation date in YYYY-MM-DD format. Calculate based on 'today'."),
    time: z.string().nullable().describe("The reservation time in HH:mm format."),
    course: z.string().nullable().describe("The course type (e.g., '1종', '2종', '도로연수')."),
    reply: z.string().describe("A polite and concise draft reply in the manager's tone."),
    requiresManualCheck: z.boolean().describe("Set to true if the AI is uncertain or if the request is complex.")
});

export type ReservationData = z.infer<typeof ReservationSchema>;

// Gemini Schema Definition
const geminiSchema = {
    type: SchemaType.OBJECT,
    properties: {
        isBooking: { type: SchemaType.BOOLEAN, description: "Whether the user is asking for a reservation or related inquiry." },
        name: { type: SchemaType.STRING, description: "The customer's name extracted from the context or profile." },
        date: { type: SchemaType.STRING, description: "The reservation date in YYYY-MM-DD format. Calculate based on 'today'. Nullable.", nullable: true },
        time: { type: SchemaType.STRING, description: "The reservation time in HH:mm format. Nullable.", nullable: true },
        course: { type: SchemaType.STRING, description: "The course type (e.g., '1종', '2종', '도로연수'). Nullable.", nullable: true },
        reply: { type: SchemaType.STRING, description: "A polite and concise draft reply in the manager's tone." },
        requiresManualCheck: { type: SchemaType.BOOLEAN, description: "Set to true if the AI is uncertain or if the request is complex." }
    },
    required: ["isBooking", "name", "reply", "requiresManualCheck"]
};

export class LlmService {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor() {
        const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY; // Fallback for user convenience
        if (!apiKey) {
            console.warn("GEMINI_API_KEY is not set. LLM features will not work.");
        }
        this.genAI = new GoogleGenerativeAI(apiKey || '');
        this.model = this.genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: geminiSchema,
            },
        });
    }

    async analyzeMessage(
        messageText: string,
        profileName: string,
        currentDate: string = new Date().toISOString().split('T')[0]
    ): Promise<ReservationData> {
        const systemPrompt = `
You are the efficient and polite manager of '고수의 운전면허 도봉점' (Driving License Practice Center).
Your goal is to analyze customer messages from KakaoTalk and extract reservation details.

Current Date: ${currentDate}
(Use this date to calculate 'tomorrow', 'next Friday', etc.)

Rules:
1. **Date/Time**: Convert all relative dates to YYYY-MM-DD and HH:mm format.
2. **Course**: Identify keywords like '1종', '2종', '자동', '보통', '도로연수', '장롱'.
3. **Name**: Use the provided profile name if the user doesn't mention their name.
4. **Reply**: Write a draft reply.
   - If reservation details are complete: Confirm the details and ask for final confirmation.
   - If details are missing (e.g., time): Politely ask for the missing info.
   - Tone: Professional, friendly, concise. Korean language.
5. **Uncertainty**: If the message is ambiguous or not about reservation, set 'requiresManualCheck' to true.

Input Context:
- Customer Profile Name: ${profileName}
- Message: "${messageText}"
    `.trim();

        try {
            const result = await this.model.generateContent(systemPrompt);
            const responseText = result.response.text();
            const parsed = JSON.parse(responseText);

            return parsed as ReservationData;

        } catch (error) {
            console.error("LLM Analysis Error:", error);
            // Return a safe fallback
            return {
                isBooking: false,
                name: profileName,
                date: null,
                time: null,
                course: null,
                reply: "죄송합니다. 메시지를 분석하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
                requiresManualCheck: true
            };
        }
    }
}
