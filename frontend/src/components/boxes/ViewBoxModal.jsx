import { MapPin, Users, Star, DollarSign, Clock, CheckCircle, XCircle, Calendar } from 'lucide-react';
import { MEDIA_BASE_URL } from '../../api';
import { Modal, Badge, Button } from '../ui';

const ViewBoxModal = ({ isOpen, onClose, box }) => {
  if (!box) return null;

  const getStatusTone = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved': return 'success';
      case 'pending': return 'warning';
      case 'rejected': return 'danger';
      default: return 'neutral';
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved': return <CheckCircle size={14} />;
      case 'pending': return <Clock size={14} />;
      case 'rejected': return <XCircle size={14} />;
      default: return <Clock size={14} />;
    }
  };

  const footer = (
    <Button variant="outline" onClick={onClose}>Close</Button>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={box.name} size="xl" footer={footer}>
      <div className="-mt-2 mb-4">
        <Badge tone={getStatusTone(box.status)} size="md">
          {getStatusIcon(box.status)}
          <span className="capitalize">{box.status}</span>
        </Badge>
      </div>

      <div className="max-h-[65vh] overflow-y-auto pr-1">
        {/* Box Image */}
        {box.image && (
          <div className="mb-6">
            <img
              src={box.image.startsWith('http') ? box.image : `${MEDIA_BASE_URL}${box.image}`}
              alt={box.name}
              className="w-full h-64 object-cover rounded-lg"
              onError={(e) => {
                e.target.src = 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';
              }}
            />
          </div>
        )}

        {/* Basic Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-elevated p-4 rounded-lg">
            <div className="flex items-center mb-2">
              <MapPin size={18} className="text-primary mr-2" />
              <span className="font-medium text-foreground">Location</span>
            </div>
            <p className="text-muted-foreground">{box.location}</p>
          </div>

          <div className="bg-elevated p-4 rounded-lg">
            <div className="flex items-center mb-2">
              <DollarSign size={18} className="text-success mr-2" />
              <span className="font-medium text-foreground">Price</span>
            </div>
            <p className="text-muted-foreground">₹{box.price}/hour</p>
          </div>

          <div className="bg-elevated p-4 rounded-lg">
            <div className="flex items-center mb-2">
              <Users size={18} className="text-turf mr-2" />
              <span className="font-medium text-foreground">Capacity</span>
            </div>
            <p className="text-muted-foreground">{box.capacity} people</p>
          </div>

          {(box.opening_time || box.closing_time) && (
            <div className="bg-elevated p-4 rounded-lg">
              <div className="flex items-center mb-2">
                <Clock size={18} className="text-primary mr-2" />
                <span className="font-medium text-foreground">Hours</span>
              </div>
              <p className="text-muted-foreground">{box.opening_time || '06:00'} - {box.closing_time || '23:00'}</p>
            </div>
          )}

          {box.avg_rating && (
            <div className="bg-elevated p-4 rounded-lg">
              <div className="flex items-center mb-2">
                <Star size={18} className="text-warning mr-2" />
                <span className="font-medium text-foreground">Rating</span>
              </div>
              <p className="text-muted-foreground">{box.avg_rating}/5</p>
            </div>
          )}

          {box.created_at && (
            <div className="bg-elevated p-4 rounded-lg">
              <div className="flex items-center mb-2">
                <Calendar size={18} className="text-primary mr-2" />
                <span className="font-medium text-foreground">Created</span>
              </div>
              <p className="text-muted-foreground">
                {new Date(box.created_at).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>

        {/* Sports */}
        {box.sports && box.sports.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-display font-semibold text-foreground mb-3">Available Sports</h3>
            <div className="flex flex-wrap gap-2">
              {box.sports.map((sport, index) => (
                <Badge key={index} tone="primary" size="md">{sport}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Amenities */}
        {box.amenities && box.amenities.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-display font-semibold text-foreground mb-3">Amenities</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {box.amenities.map((amenity, index) => (
                <div
                  key={index}
                  className="flex items-center p-2 bg-success/15 text-success rounded-lg text-sm"
                >
                  <CheckCircle size={14} className="mr-2" />
                  {amenity}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {box.description && (
          <div className="mb-6">
            <h3 className="text-lg font-display font-semibold text-foreground mb-3">Description</h3>
            <p className="text-muted-foreground leading-relaxed">{box.description}</p>
          </div>
        )}

        {/* Full Description */}
        {box.full_description && (
          <div className="mb-6">
            <h3 className="text-lg font-display font-semibold text-foreground mb-3">Full Description</h3>
            <p className="text-muted-foreground leading-relaxed">{box.full_description}</p>
          </div>
        )}

        {/* Rules */}
        {box.rules && (
          <div className="mb-6">
            <h3 className="text-lg font-display font-semibold text-foreground mb-3">Rules</h3>
            <p className="text-muted-foreground leading-relaxed">{box.rules}</p>
          </div>
        )}

        {/* Contact Info */}
        {box.contact_info && (
          <div className="mb-6">
            <h3 className="text-lg font-display font-semibold text-foreground mb-3">Contact Information</h3>
            <p className="text-muted-foreground">{box.contact_info}</p>
          </div>
        )}

        {/* Coordinates */}
        {(box.latitude || box.longitude) && (
          <div className="bg-elevated p-4 rounded-lg">
            <h3 className="text-lg font-display font-semibold text-foreground mb-3">Coordinates</h3>
            <div className="grid grid-cols-2 gap-4">
              {box.latitude && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Latitude:</span>
                  <p className="text-foreground">{box.latitude}</p>
                </div>
              )}
              {box.longitude && (
                <div>
                  <span className="text-sm font-medium text-muted-foreground">Longitude:</span>
                  <p className="text-foreground">{box.longitude}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ViewBoxModal;
