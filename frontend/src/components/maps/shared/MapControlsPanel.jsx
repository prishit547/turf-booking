import { Search } from 'lucide-react';

// The legend + search-radius slider shown top-right on both map modals.
const MapControlsPanel = ({ searchRadius, onSearchRadiusChange }) => (
    <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 z-[1000] flex flex-col gap-3">
        <h4 className="font-bold text-gray-900 border-b pb-2 mb-2">Map Controls</h4>
        <div className="space-y-2 text-sm">
            <p className="font-medium text-gray-800">Legend:</p>
            <div className="flex items-center">
                <div className="w-4 h-4 bg-red-500 rounded-full mr-2 shadow-sm"></div>
                <span>Your Location</span>
            </div>
            <div className="flex items-center">
                <div className="w-4 h-4 bg-green-500 rounded-full mr-2 shadow-sm"></div>
                <span>Sports Boxes</span>
            </div>
        </div>
        <div className="border-t pt-3 mt-3">
            <label htmlFor="search-radius" className="font-medium text-gray-800 flex items-center gap-1 mb-2">
                <Search size={16} /> Search Radius: <span className="font-semibold text-primary-600">{searchRadius} km</span>
            </label>
            <input
                id="search-radius"
                type="range"
                min="5"
                max="100"
                step="5"
                value={searchRadius}
                onChange={(e) => onSearchRadiusChange(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg accent-primary-600"
            />
        </div>
    </div>
);

export default MapControlsPanel;
