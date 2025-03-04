import mapboxgl from 'mapbox-gl'
import { Station } from './types'
import { stationLayerStyle, stationHitAreaStyle } from './styles'

export const addStationLayers = (map: mapboxgl.Map, stations: Station[]) => {
    // Add stations source
    map.addSource('stations', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: stations.map((station) => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [station.longitude, station.latitude],
                },
                properties: {
                    id: station.id,
                    name: station.stationName,
                    streamUrl: station.streamUrl,
                },
            })),
        },
    })

    // Add hit area layer
    map.addLayer(stationHitAreaStyle)

    // Add visible station layer
    map.addLayer(stationLayerStyle)
}
