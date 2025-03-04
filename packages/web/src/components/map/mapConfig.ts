import mapboxgl from 'mapbox-gl'
import { MapConfig } from './types'

export const initializeMap = (config: MapConfig): mapboxgl.Map => {
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || ''

    return new mapboxgl.Map({
        container: config.container,
        style: config.style,
        projection: config.projection,
        zoom: config.zoom,
        center: config.center,
    })
}

export const defaultMapConfig: Omit<MapConfig, 'container'> = {
    style: 'mapbox://styles/mapbox/dark-v11',
    projection: 'globe',
    zoom: 2.25,
    center: [0, 20],
}
