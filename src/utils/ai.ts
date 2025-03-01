import { GoogleGenerativeAI } from '@google/generative-ai'

const { GOOGLE_API_KEY } = process.env

if (!GOOGLE_API_KEY) {
    throw new Error('GOOGLE_API_KEY is not set')
}

export const googleGenerativeAI = new GoogleGenerativeAI(GOOGLE_API_KEY)
