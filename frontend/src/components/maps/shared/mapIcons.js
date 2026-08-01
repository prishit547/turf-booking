import L from 'leaflet';

// Fix for default markers in react-leaflet — must run once before any
// <Marker> renders, so this module's side effect runs on first import.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

export const createCustomIcon = (color = 'blue', isSelected = false) => {
    return L.divIcon({
        className: `custom-marker ${isSelected ? 'selected-marker' : ''}`,
        html: `
            <div style="
                background-color: ${color};
                width: ${isSelected ? '30px' : '20px'};
                height: ${isSelected ? '30px' : '20px'};
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 8px rgba(0,0,0,0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease-in-out;
            ">
                ${isSelected ? '<span style="color: white; font-size: 16px;">📍</span>' : ''}
            </div>
        `,
        iconSize: isSelected ? [30, 30] : [20, 20],
        iconAnchor: isSelected ? [15, 15] : [10, 10]
    });
};
