import dotenv from 'dotenv';
const result = dotenv.config();
console.log('Dotenv result:', result);
console.log('GEMINI_API_KEY present:', !!process.env.GEMINI_API_KEY);
console.log('OPENAI_API_KEY present:', !!process.env.OPENAI_API_KEY);

import { LlmService } from '../electron/services/LlmService.ts';

async function verifyLlm() {
    const llmService = new LlmService();
    const today = '2025-12-18'; // Fixed date for consistent testing

    const testCases = [
        {
            profile: '홍길동',
            message: '내일 오후 2시 1종 보통 예약하고 싶어요.',
            description: 'Clear reservation'
        },
        {
            profile: '김철수',
            message: '가격이 얼마인가요?',
            description: 'Inquiry (not booking)'
        },
        {
            profile: '이영희',
            message: '다음주 화요일 예약 되나요?',
            description: 'Missing time and course'
        },
        {
            profile: '박민수',
            message: '12월 25일 10시 2종 자동',
            description: 'Specific date'
        }
    ];

    console.log(`--- LLM Verification (Today: ${today}) ---`);

    for (const test of testCases) {
        console.log(`\n[Test Case: ${test.description}]`);
        console.log(`Profile: ${test.profile}`);
        console.log(`Message: "${test.message}"`);

        try {
            const result = await llmService.analyzeMessage(test.message, test.profile, today);
            console.log('Result:', JSON.stringify(result, null, 2));
        } catch (error) {
            console.error('Error:', error);
        }
    }
}

verifyLlm().catch(console.error);
