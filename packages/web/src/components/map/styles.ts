export const popupStyles = `.mapboxgl-popup-close-button { font-size: 16px !important; padding: 0 4px !important; line-height: 1 !important; color: #666 !important; background: transparent !important; cursor: pointer !important; border: none !important; transition: color 0.2s ease !important; } .mapboxgl-popup-close-button:hover { color: #000 !important; background: #fff !important; } .mapboxgl-popup-content { white-space: nowrap !important; max-width: none !important; width: auto !important; padding: 10px !important; } .station-popup { white-space: nowrap !important; } .station-popup-container { max-width: none !important; }`

export const stationLayerStyle = {
    id: 'stations',
    type: 'circle' as const,
    source: 'stations',
    paint: {
        'circle-radius': 6,
        'circle-color': '#fff',
        'circle-opacity': 0.8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#fff',
        'circle-stroke-opacity': 0.3,
    },
}

export const stationHitAreaStyle = {
    id: 'stations-hit-area',
    type: 'circle' as const,
    source: 'stations',
    paint: {
        'circle-radius': 15,
        'circle-color': '#fff',
        'circle-opacity': 0,
    },
}
