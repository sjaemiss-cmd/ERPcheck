import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenerativeAI } from '@google/generative-ai';

async function listModels() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('GEMINI_API_KEY not found');
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    try {
        console.log('Testing model: gemini-1.5-flash');
        const modelFlash = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        try {
            await modelFlash.generateContent("Hello");
            console.log('Success: gemini-1.5-flash');
        } catch (e: any) { console.log('Failed: gemini-1.5-flash', e.message); }

        console.log('Testing model: gemini-1.5-flash-001');
        const modelFlash001 = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });
        try {
            await modelFlash001.generateContent("Hello");
            console.log('Success: gemini-1.5-flash-001');
        } catch (e: any) { console.log('Failed: gemini-1.5-flash-001', e.message); }

        console.log('Testing model: gemini-1.5-pro-001');
        const modelPro001 = genAI.getGenerativeModel({ model: "gemini-1.5-pro-001" });
        try {
            await modelPro001.generateContent("Hello");
            console.log('Success: gemini-1.5-pro-001');
        } catch (e: any) { console.log('Failed: gemini-1.5-pro-001', e.message); }

        console.log('Testing model: gemini-2.0-flash-exp');
        const model20Exp = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        try {
            await model20Exp.generateContent("Hello");
            console.log('Success: gemini-2.0-flash-exp');
        } catch (e: any) { console.log('Failed: gemini-2.0-flash-exp', e.message); }

    } catch (error) {
        console.error('Error listing models:', error);
    }
}

listModels();
