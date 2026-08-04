import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, Grid, List, Star, MapPin, Users, Map, X, ArrowRight, Sparkles, Target, Clock, LayoutGrid } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBox } from '../context/BoxContext';
import { useDebounce } from '../hooks/useDebounce';
import { Loader, Card, Button, Input, Select } from '../components/ui';
import { BoxCard } from '../components/boxes/BoxCard';
import Chatbot from '../components/common/Chatbot';
import BoxListingsMap from '../components/maps/BoxListingsMap';
import { animations } from '../utils/animations';
import { CricketIcon, FootballIcon, BadmintonIcon, BasketballIcon } from '../components/icons/SportIcons';

const SPORT_PILLS = [
    { name: '', label: 'All sports', Icon: LayoutGrid },
    { name: 'Cricket', label: 'Cricket', Icon: CricketIcon },
    { name: 'Football', label: 'Football', Icon: FootballIcon },
    { name: 'Badminton', label: 'Badminton', Icon: BadmintonIcon },
    { name: 'Basketball', label: 'Basketball', Icon: BasketballIcon },
];

const BoxListCard = ({ box }) => (
    <motion.div variants={animations.staggerItem}>
        <Card interactive padding="none" className="overflow-hidden group">
            <div className="flex flex-col sm:flex-row">
                <div className="relative sm:w-80 sm:flex-shrink-0 overflow-hidden">
                    <img
                        src={box.image}
                        alt={box.name}
                        className="w-full h-48 sm:h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                    <div className="absolute top-3 right-3 bg-primary text-primary-foreground rounded-md px-2.5 py-1.5 text-right leading-none shadow-glow">
                        <div className="text-[10px] uppercase tracking-wide opacity-80">From</div>
                        <div className="font-display text-base leading-none mt-0.5">₹{box.price}</div>
                    </div>
                    <div className="absolute top-3 left-3 bg-card/90 backdrop-blur px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-wide text-foreground">
                        {box.sport || 'Multi-sport'}
                    </div>
                </div>

                <div className="flex-1 p-6 flex flex-col justify-between">
                    <div>
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex-1">
                                <h3 className="text-xl font-display font-semibold text-foreground mb-1.5">
                                    {box.name}
                                </h3>
                                <p className="text-muted-foreground text-sm line-clamp-2">
                                    Experience premium sports facilities with state-of-the-art equipment and professional maintenance.
                                </p>
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-1 text-foreground font-medium">
                                <Star size={16} className="text-warning fill-warning" />
                                {box.rating}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-6 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2"><MapPin size={16} />{box.location}</div>
                            <div className="flex items-center gap-2"><Users size={16} />Up to {box.capacity} players</div>
                            <div className="flex items-center gap-2"><Clock size={16} />Available today</div>
                            <div className="flex items-center gap-2"><Target size={16} />{box.sport || 'Multi-sport'}</div>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <Button as={Link} to={`/boxes/${box.id}`} variant="outline" className="flex-1" icon={<ArrowRight size={16} />}>
                            View Details
                        </Button>
                        <Button as={Link} to={`/boxes/${box.id}`} className="flex-1">
                            Book Now
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    </motion.div>
);

const BoxListings = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('grid');
    const [sortBy, setSortBy] = useState('rating');
    const [showFilters, setShowFilters] = useState(false);
    const [showMap, setShowMap] = useState(false);

    const [localFilters, setLocalFilters] = useState({
        sport: '',
        location: '',
        priceRange: [0, 5000],
        rating: 0
    });

    const { boxes, loadingMap, errorMap, setFilters, clearFiltersAndRefresh } = useBox();
    const loading = loadingMap.boxes;
    const error = errorMap.boxes;
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    useEffect(() => {
        setFilters({
            search: debouncedSearchTerm,
            sport: localFilters.sport,
            location: localFilters.location,
            min_price: localFilters.priceRange[0],
            max_price: localFilters.priceRange[1],
            min_rating: localFilters.rating
        });
    }, [debouncedSearchTerm, localFilters, setFilters]);

    const clearAllFilters = useCallback(() => {
        setSearchTerm('');
        setLocalFilters({ sport: '', location: '', priceRange: [0, 5000], rating: 0 });
        clearFiltersAndRefresh();
    }, [clearFiltersAndRefresh]);

    const handleFilterChange = useCallback((key, value) => {
        setLocalFilters(prev => ({ ...prev, [key]: value }));
    }, []);

    const sortedBoxes = [...boxes].sort((a, b) => {
        switch (sortBy) {
            case 'price-low': return (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0);
            case 'price-high': return (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0);
            case 'rating': return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
            case 'name': return a.name.localeCompare(b.name);
            default: return 0;
        }
    });

    const sports = ['Cricket', 'Football', 'Badminton', 'Padel', 'Squash', 'Basketball', 'Multisport', 'Skating', 'Cycling', 'Futsal', 'Watersports', 'Yoga', 'Archery'];
    const locations = ['Ahmedabad', 'Kolkata', 'Goa', 'Jaipur', 'Lucknow', 'Bhopal', 'Indore', 'Chandigarh', 'Hyderabad', 'Chennai', 'Bengaluru', 'Pune', 'Delhi', 'Mumbai'];

    return (
        <div className="min-h-screen">
            <section className="pt-28 pb-14 px-4 sm:px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-10">
                        <h1 className="font-display font-black uppercase tracking-tight text-4xl lg:text-5xl text-foreground mb-4">
                            Discover sports boxes
                        </h1>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                            Find and book the perfect sports facility for your game from our curated collection of venues.
                        </p>
                    </div>

                    <div className="max-w-4xl mx-auto">
                        <Card>
                            <div className="flex flex-col lg:flex-row gap-4 items-center">
                                <div className="flex-1 w-full">
                                    <Input
                                        leadingIcon={<Search size={18} />}
                                        placeholder="Search by name, sport, or location..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>

                                <div className="flex gap-3 w-full lg:w-auto">
                                    <Button
                                        variant={showFilters ? 'primary' : 'outline'}
                                        onClick={() => setShowFilters(!showFilters)}
                                        icon={<Filter size={16} />}
                                        className="flex-1 lg:flex-none"
                                    >
                                        Filters
                                    </Button>
                                    <Button
                                        variant={showMap ? 'primary' : 'outline'}
                                        onClick={() => setShowMap(!showMap)}
                                        icon={<Map size={16} />}
                                        className="flex-1 lg:flex-none"
                                    >
                                        {showMap ? 'Close map' : 'View map'}
                                    </Button>
                                    <div className="flex bg-elevated rounded-full p-1">
                                        <button
                                            className={`p-2 rounded-full transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                            onClick={() => setViewMode('grid')}
                                            aria-label="Grid view"
                                        >
                                            <Grid size={18} />
                                        </button>
                                        <button
                                            className={`p-2 rounded-full transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                            onClick={() => setViewMode('list')}
                                            aria-label="List view"
                                        >
                                            <List size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>

                    <div className="flex flex-wrap justify-center gap-3 mt-6">
                        {SPORT_PILLS.map(({ name, label, Icon }) => {
                            const active = localFilters.sport === name;
                            return (
                                <button
                                    key={label}
                                    onClick={() => handleFilterChange('sport', name)}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full border font-medium text-sm transition-colors ${
                                        active
                                            ? 'bg-primary border-primary text-primary-foreground'
                                            : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
                                    }`}
                                >
                                    <Icon size={17} />
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </section>

            {showFilters && (
                <motion.section
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-4 sm:px-6 lg:px-8 pb-8"
                >
                    <div className="max-w-7xl mx-auto">
                        <Card>
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-display font-semibold text-foreground">
                                    Filter results
                                </h3>
                                <div className="flex items-center gap-3">
                                    <Button variant="ghost" size="sm" onClick={clearAllFilters}>Clear all</Button>
                                    <button onClick={() => setShowFilters(false)} className="text-muted-foreground hover:text-foreground">
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                                <Select label="Sport" value={localFilters.sport} onChange={(e) => handleFilterChange('sport', e.target.value)}>
                                    <option value="">All sports</option>
                                    {sports.map(sport => <option key={sport} value={sport}>{sport}</option>)}
                                </Select>
                                <Select label="Location" value={localFilters.location} onChange={(e) => handleFilterChange('location', e.target.value)}>
                                    <option value="">All locations</option>
                                    {locations.map(location => <option key={location} value={location}>{location}</option>)}
                                </Select>
                                <Select label="Minimum rating" value={localFilters.rating} onChange={(e) => handleFilterChange('rating', Number(e.target.value))}>
                                    <option value={0}>Any rating</option>
                                    <option value={4}>4+ stars</option>
                                    <option value={4.5}>4.5+ stars</option>
                                </Select>
                                <Select label="Sort by" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                                    <option value="rating">Highest rated</option>
                                    <option value="price-low">Price: low to high</option>
                                    <option value="price-high">Price: high to low</option>
                                    <option value="name">Name A-Z</option>
                                </Select>
                            </div>
                        </Card>
                    </div>
                </motion.section>
            )}

            <BoxListingsMap isOpen={showMap} onClose={() => setShowMap(false)} boxes={sortedBoxes} />

            <section className="px-4 sm:px-6 lg:px-8 pb-20">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-display font-extrabold uppercase tracking-tight text-foreground">
                                {sortedBoxes.length} sports boxes found
                            </h2>
                            {searchTerm && <p className="text-muted-foreground mt-1">Results for &ldquo;{searchTerm}&rdquo;</p>}
                        </div>
                        {(searchTerm || localFilters.sport || localFilters.location || localFilters.rating > 0) && (
                            <Button variant="ghost" onClick={clearAllFilters} icon={<X size={16} />}>
                                Clear filters
                            </Button>
                        )}
                    </div>

                    {loading && (
                        <div className="flex justify-center py-16">
                            <Loader text="Finding perfect sports boxes..." />
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-16">
                            <Card className="max-w-md mx-auto text-center">
                                <X size={40} className="mx-auto text-danger mb-4" />
                                <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                                    Something went wrong
                                </h3>
                                <p className="text-muted-foreground mb-6">{error}</p>
                                <Button onClick={() => window.location.reload()}>Try again</Button>
                            </Card>
                        </div>
                    )}

                    {!loading && !error && (
                        sortedBoxes.length === 0 ? (
                            <div className="text-center py-16">
                                <Card className="max-w-md mx-auto text-center">
                                    <Sparkles size={40} className="mx-auto text-muted-foreground mb-4" />
                                    <h3 className="text-xl font-display font-semibold text-foreground mb-2">
                                        No boxes found
                                    </h3>
                                    <p className="text-muted-foreground mb-6">Try adjusting your search criteria or clear the filters.</p>
                                    <Button onClick={clearAllFilters}>Clear all filters</Button>
                                </Card>
                            </div>
                        ) : (
                            <motion.div
                                className={`grid gap-6 ${viewMode === 'grid' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}
                                variants={animations.staggerContainer}
                                initial="initial"
                                animate="animate"
                            >
                                {sortedBoxes.map((box) =>
                                    viewMode === 'grid' ? (
                                        <motion.div key={box.id} variants={animations.staggerItem}>
                                            <BoxCard box={box} />
                                        </motion.div>
                                    ) : (
                                        <BoxListCard key={box.id} box={box} />
                                    )
                                )}
                            </motion.div>
                        )
                    )}
                </div>
            </section>

            <Chatbot />
        </div>
    );
};

export default BoxListings;
