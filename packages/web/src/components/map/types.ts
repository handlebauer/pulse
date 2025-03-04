export type Station = {
    id: string
    stationName: string
    latitude: number
    longitude: number
    streamUrl: string
}

export type MapRefs = {
    map: mapboxgl.Map | null
    popup: mapboxgl.Popup | null
}

export type MapConfig = {
    container: HTMLDivElement
    style: string
    projection: string
    zoom: number
    center: [number, number]
}
