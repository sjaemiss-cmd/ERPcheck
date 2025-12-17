export interface IReservationCandidate {
    id: string;
    source: 'NAVER' | 'KAKAO';
    status: 'PENDING' | 'VALID' | 'CONFLICT' | 'DUPLICATE' | 'REGISTERED';
    name: string;
    phone?: string;
    requestDate: string; // YYYY-MM-DD
    requestTime: string; // HH:mm
    course: '1-TYPE' | '2-TYPE' | 'UNKNOWN';
    originalText: string;
    durationMin?: number;
    product?: string;
    option?: string;
    request?: string;
    aiGuess?: boolean; // True if parsed from unstructured text
}
