import { GoogleGenerativeAI } from '@google/generative-ai'
import { OpenAI } from 'openai'
import { zodResponseFormat } from 'openai/helpers/zod'
import type { TopicExtractionConfig } from '@/lib/config/types'
import { z } from 'zod'
/**
 * Topic Extraction AI provider interface
 * This allows us to provide a consistent interface for different AI providers
 */
export interface TopicExtractionAI {
    /**
     * Generate content using the AI provider
     * @param prompt The prompt to send to the AI
     * @returns The text response from the AI
     */
    generateContent(prompt: string): Promise<string>
}

/**
 * Google AI implementation for topic extraction using OpenAI compatible client
 */
class GoogleTopicExtractionAI implements TopicExtractionAI {
    private client: OpenAI
    private model: string

    constructor(apiKey: string, model: string) {
        this.client = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        })
        this.model = model
    }

    async generateContent(prompt: string): Promise<string> {
        const response = await this.client.beta.chat.completions.parse({
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a helpful assistant that extracts topics from radio transcriptions.',
                },
                { role: 'user', content: prompt },
            ],
            response_format: zodResponseFormat(
                z.object({
                    topics: z.array(
                        z.object({
                            name: z.string(),
                            normalizedName: z.string(),
                            relevanceScore: z.number(),
                        }),
                    ),
                }),
                'topics',
            ),
        })

        return response.choices[0]?.message?.content || ''
    }
}

/**
 * OpenAI implementation for topic extraction
 */
class OpenAITopicExtractionAI implements TopicExtractionAI {
    private client: OpenAI
    private model: string

    constructor(apiKey: string, model: string) {
        this.client = new OpenAI({ apiKey })
        this.model = model
    }

    async generateContent(prompt: string): Promise<string> {
        console.log('Prompt', prompt)
        const response = await this.client.beta.chat.completions.parse({
            model: this.model,
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a helpful assistant that extracts topics from radio transcriptions.',
                },
                { role: 'user', content: prompt },
            ],
            response_format: zodResponseFormat(
                z.object({
                    topics: z.array(
                        z.object({
                            name: z.string(),
                            normalizedName: z.string(),
                            relevanceScore: z.number(),
                        }),
                    ),
                }),
                'topics',
            ),
        })

        return response.choices[0]?.message?.content || ''
    }
}

/**
 * Create an AI client for topic extraction based on the configuration
 *
 * @param config Topic extraction configuration
 * @returns A provider-agnostic AI client for topic extraction
 */
export function createTopicExtractionAI(
    config: TopicExtractionConfig,
): TopicExtractionAI {
    if (config.provider === 'openai') {
        if (!config.openai.apiKey) {
            throw new Error('OpenAI API key is required for topic extraction')
        }
        return new OpenAITopicExtractionAI(
            config.openai.apiKey,
            config.openai.model || 'gpt-4o-mini',
        )
    } else {
        if (!config.google.apiKey) {
            throw new Error('Google API key is required for topic extraction')
        }
        return new GoogleTopicExtractionAI(
            config.google.apiKey,
            config.google.model || 'gemini-2.0-flash',
        )
    }
}
