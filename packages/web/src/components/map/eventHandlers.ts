import mapboxgl from 'mapbox-gl'
import { Station, MapRefs } from './types'
import { createStationPopup, removePopup } from './popupManager'

export const setupMapEventHandlers = (
    map: mapboxgl.Map,
    stations: Station[],
    refs: MapRefs,
    onStationSelect: (station: Station) => void,
) => {
    // Cursor interactions for unclustered points
    map.on('mouseenter', 'unclustered-point-hit-area', () => {
        if (map) {
            map.getCanvas().style.cursor = 'pointer'
        }
    })

    map.on('mouseleave', 'unclustered-point-hit-area', () => {
        if (map) {
            map.getCanvas().style.cursor = ''
        }
    })

    // Click handling for unclustered points
    map.on('click', 'unclustered-point-hit-area', (e) => {
        if (!map || !e.features?.[0]) return

        const feature = e.features[0]
        if (feature.geometry.type !== 'Point') return

        const coordinates = feature.geometry.coordinates.slice() as [
            number,
            number,
        ]

        // Find the clicked station
        const stationId = feature.properties?.id
        const clickedStation = stations.find(
            (station) => station.id === stationId,
        )
        if (!clickedStation) return

        // Update selected station
        onStationSelect(clickedStation)

        // Handle popup
        removePopup(refs.popup)
        refs.popup = createStationPopup(clickedStation, coordinates).addTo(map)
    })
}
