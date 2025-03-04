#!/usr/bin/env bun
/**
 * Stations Pipeline Script
 *
 * This script runs the complete pipeline for processing radio stations:
 * 1. Fetch stations from Radio Browser API
 * 2. Classify stations using AI
 * 3. Validate station streams
 * 4. Filter stations for specific use cases
 *
 * The pipeline can be run in full or partially by specifying steps.
 */
import ora from 'ora'
import createLogger from '@/lib/logger'

// Import the individual pipeline steps
import fetchStations from './fetch'
import classifyStations from './classify'
import { validateAllStations } from './validate'
import filterStations from './filter'

const logger = createLogger('StationsPipeline')

// Pipeline steps
const STEPS = {
    FETCH: 'fetch',
    CLASSIFY: 'classify',
    VALIDATE: 'validate',
    FILTER: 'filter',
}

// Available pipeline configurations
const PIPELINES = {
    FULL: [STEPS.FETCH, STEPS.CLASSIFY, STEPS.VALIDATE, STEPS.FILTER],
    FETCH_ONLY: [STEPS.FETCH],
    CLASSIFY_ONLY: [STEPS.CLASSIFY],
    VALIDATE_ONLY: [STEPS.VALIDATE],
    FILTER_ONLY: [STEPS.FILTER],
    FETCH_CLASSIFY: [STEPS.FETCH, STEPS.CLASSIFY],
    CLASSIFY_VALIDATE: [STEPS.CLASSIFY, STEPS.VALIDATE],
    VALIDATE_FILTER: [STEPS.VALIDATE, STEPS.FILTER],
    NO_FILTER: [STEPS.FETCH, STEPS.CLASSIFY, STEPS.VALIDATE],
}

/**
 * Run a specific pipeline step
 */
async function runStep(step: string) {
    logger.info(`Running pipeline step: ${step}`)

    switch (step) {
        case STEPS.FETCH:
            await fetchStations()
            break
        case STEPS.CLASSIFY:
            await classifyStations()
            break
        case STEPS.VALIDATE:
            await validateAllStations()
            break
        case STEPS.FILTER:
            await filterStations()
            break
        default:
            logger.error(`Unknown pipeline step: ${step}`)
            throw new Error(`Unknown pipeline step: ${step}`)
    }
}

/**
 * Run a pipeline with the specified steps
 */
async function runPipeline(steps: string[]) {
    logger.info(`Starting pipeline with steps: ${steps.join(', ')}`)

    for (const step of steps) {
        const spinner = ora(`Running step: ${step}...`).start()

        try {
            await runStep(step)
            spinner.succeed(`Completed step: ${step}`)
        } catch (error) {
            spinner.fail(`Failed step: ${step}`)
            logger.error(`Error in pipeline step ${step}:`, error)
            throw error
        }
    }

    logger.success('Pipeline completed successfully')
}

/**
 * Main function
 */
async function main() {
    // Parse command line arguments
    const args = process.argv.slice(2)

    // Determine which pipeline to run
    let pipeline = PIPELINES.FULL

    if (args.length > 0) {
        const pipelineArg = args[0].toLowerCase()

        switch (pipelineArg) {
            case 'fetch':
                pipeline = PIPELINES.FETCH_ONLY
                break
            case 'classify':
                pipeline = PIPELINES.CLASSIFY_ONLY
                break
            case 'validate':
                pipeline = PIPELINES.VALIDATE_ONLY
                break
            case 'filter':
                pipeline = PIPELINES.FILTER_ONLY
                break
            case 'fetch-classify':
                pipeline = PIPELINES.FETCH_CLASSIFY
                break
            case 'classify-validate':
                pipeline = PIPELINES.CLASSIFY_VALIDATE
                break
            case 'validate-filter':
                pipeline = PIPELINES.VALIDATE_FILTER
                break
            case 'no-filter':
                pipeline = PIPELINES.NO_FILTER
                break
            case 'full':
                pipeline = PIPELINES.FULL
                break
            default:
                logger.error(`Unknown pipeline: ${pipelineArg}`)
                console.log(
                    'Available pipelines: fetch, classify, validate, filter, fetch-classify, classify-validate, validate-filter, no-filter, full',
                )
                process.exit(1)
        }
    }

    try {
        await runPipeline(pipeline)
    } catch (error) {
        logger.error('Pipeline failed', error)
        process.exit(1)
    }
}

// Run the main function if this file is executed directly
if (import.meta.path === Bun.main) {
    main().catch((error) => {
        logger.error('Unhandled error in main function', error)
        process.exit(1)
    })
}

export default {
    runPipeline,
    runStep,
    STEPS,
    PIPELINES,
}
