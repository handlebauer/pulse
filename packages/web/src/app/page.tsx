import { createClient } from '@/lib/db/clients/server'
import { Globe } from '@/components/Globe'
import { AudioPlayerProvider } from '@/contexts/AudioPlayerContext'

type Station = {
    id: string
    stationName: string
    latitude: number
    longitude: number
    streamUrl: string
}

export default async function Home() {
    const supabase = await createClient()
    const { data: stations } = (await supabase
        .from('stations')
        .select('id, stationName, latitude, longitude, streamUrl')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .not('streamUrl', 'is', null)
        .eq('isOnline', true)
        .throwOnError()) as { data: Station[] }

    console.log(`Loading ${stations.length} stations`)

    return (
        <main className="bg-slate-900">
            <AudioPlayerProvider>
                <Globe stations={stations || []} />
            </AudioPlayerProvider>
        </main>
    )
}
