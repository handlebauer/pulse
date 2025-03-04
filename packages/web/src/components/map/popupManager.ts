import mapboxgl from 'mapbox-gl'
import { Station } from './types'

export const createStationPopup = (
    station: Station,
    coordinates: [number, number],
): mapboxgl.Popup => {
    return new mapboxgl.Popup({
        maxWidth: 'none',
        className: 'station-popup-container',
    })
        .setLngLat(coordinates)
        .setHTML(
            `<div class="text-lg font-medium station-popup">${station.stationName}</div>`,
        )
}

export const removePopup = (popup: mapboxgl.Popup | null) => {
    if (popup) {
        popup.remove()
    }
}
