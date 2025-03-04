import { createClient } from '@/lib/db/clients/server'
import { Globe } from '@/components/Globe'

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

    return (
        <main className="bg-black">
            <h1 className="text-2xl font-bold text-white mb-6 absolute top-4 left-4 z-10">
                Radio Stations Around the World
            </h1>
            <Globe stations={stations || []} />
        </main>
    )
}
