import { Search } from 'lucide-react';

export const MARKER_COLORS = {
    box: '#D1FB00', // primary — box markers, matches the app accent
    userLocation: '#F2AB19', // warning — "you are here" marker
};

// The legend + search-radius slider shown top-right on both map modals.
// Legend swatches read their colors from MARKER_COLORS so they always
// match the actual marker pins.
const MapControlsPanel = ({ searchRadius, onSearchRadiusChange }) => (
    <div className="absolute top-4 right-4 bg-card border border-border rounded-2xl shadow-lift p-4 z-[1000] flex flex-col gap-3">
        <h4 className="font-display font-semibold text-foreground border-b border-border pb-2 mb-2">Map Controls</h4>
        <div className="space-y-2 text-sm">
            <p className="font-medium text-foreground">Legend:</p>
            <div className="flex items-center">
                <div
                    className="w-4 h-4 rounded-full mr-2 shadow-sm"
                    style={{ backgroundColor: MARKER_COLORS.userLocation }}
                />
                <span className="text-foreground">Your Location</span>
            </div>
            <div className="flex items-center">
                <div
                    className="w-4 h-4 rounded-full mr-2 shadow-sm"
                    style={{ backgroundColor: MARKER_COLORS.box }}
                />
                <span className="text-foreground">Sports Boxes</span>
            </div>
        </div>
        <div className="border-t border-border pt-3 mt-3">
            <label htmlFor="search-radius" className="font-medium text-foreground flex items-center gap-1 mb-2">
                <Search size={16} /> Search Radius: <span className="font-semibold text-primary">{searchRadius} km</span>
            </label>
            <input
                id="search-radius"
                type="range"
                min="5"
                max="100"
                step="5"
                value={searchRadius}
                onChange={(e) => onSearchRadiusChange(Number(e.target.value))}
                className="w-full h-2 bg-elevated rounded-lg appearance-none cursor-pointer accent-primary"
            />
        </div>
    </div>
);

export default MapControlsPanel;
