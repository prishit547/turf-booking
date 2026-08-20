import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, DollarSign, FileText, Check, UploadCloud } from 'lucide-react';
import { useBox } from '../../context/BoxContext';
import { MEDIA_BASE_URL } from '../../api';
import { Modal, Button, Input } from '../ui';
import LocationPickerMap from '../maps/LocationPickerMap';

const AddBoxForm = ({ isOpen, onClose, onSuccess, editMode = false, boxData = null }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    sports: [],
    location: '',
    price: '',
    capacity: '',
    opening_time: '06:00',
    closing_time: '23:00',
    description: '',
    amenities: [],
    images: [], // This will hold File objects for upload
    rules: '',
    contactInfo: '',
    full_description: '',
    latitude: '',
    longitude: '',
    google_maps_url: ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { addBox, updateBox } = useBox();

  // Populate form data when in edit mode
  useEffect(() => {
    if (editMode && boxData) {
      setFormData({
        name: boxData.name || '',
        sports: boxData.sports || [],
        location: boxData.location || '',
        price: boxData.price || '',
        capacity: boxData.capacity || '',
        opening_time: boxData.opening_time || '06:00',
        closing_time: boxData.closing_time || '23:00',
        description: boxData.description || '',
        amenities: boxData.amenities || [],
        images: [], // Don't populate existing images as they're already uploaded
        rules: boxData.rules || '',
        contactInfo: boxData.contact_info || '',
        full_description: boxData.full_description || '',
        latitude: boxData.latitude || '',
        longitude: boxData.longitude || '',
        google_maps_url: boxData.google_maps_url || ''
      });
    } else if (!editMode) {
      // Reset form for add mode
      setFormData({
        name: '',
        sports: [],
        location: '',
        price: '',
        capacity: '',
        opening_time: '06:00',
        closing_time: '23:00',
        description: '',
        amenities: [],
        images: [],
        rules: '',
        contactInfo: '',
        full_description: '',
        latitude: '',
        longitude: '',
        google_maps_url: ''
      });
    }
  }, [editMode, boxData, isOpen]);

  const availableSports = [
    'Cricket', 'Football', 'Tennis', 'Badminton', 'Basketball',
    'Pickleball', 'Volleyball', 'Table Tennis', 'Squash', 'Baseball'
  ];
  const availableAmenities = [
    'Changing Room', 'Parking', 'Equipment Rental', 'Coaching',
    'Floodlights', 'AC/Heating', 'Refreshments', 'WiFi',
    'Security', 'First Aid', 'Lockers', 'Shower'
  ];
  const steps = [
    { id: 1, title: 'Basic Info', icon: FileText },
    { id: 2, title: 'Sports & Pricing', icon: DollarSign },
    { id: 3, title: 'Details & Images', icon: MapPin },
    { id: 4, title: 'Review & Submit', icon: Check }
  ];

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSportToggle = (sport) => {
    setFormData(prev => ({ ...prev, sports: prev.sports.includes(sport) ? prev.sports.filter(s => s !== sport) : [...prev.sports, sport] }));
  };

  const handleAmenityToggle = (amenity) => {
    setFormData(prev => ({ ...prev, amenities: prev.amenities.includes(amenity) ? prev.amenities.filter(a => a !== amenity) : [...prev.amenities, amenity] }));
  };

  const handleImageChange = (e) => {
    if (e.target.files) {
      setFormData(prev => ({ ...prev, images: Array.from(e.target.files) }));
      if (errors.images) {
        setErrors(prev => ({ ...prev, images: '' }));
      }
    }
  };

  const validateStep = (step) => {
    const newErrors = {};
    switch (step) {
      case 1:
        if (!formData.name.trim()) newErrors.name = 'Box name is required';
        if (!formData.description.trim()) newErrors.description = 'Description is required';
        break;
      case 2:
        if (formData.sports.length === 0) newErrors.sports = 'Select at least one sport';
        if (!formData.price || formData.price <= 0) newErrors.price = 'A valid price is required';
        if (!formData.capacity || formData.capacity <= 0) newErrors.capacity = 'A valid capacity is required';
        if (!formData.opening_time) newErrors.opening_time = 'Opening time is required';
        if (!formData.closing_time) newErrors.closing_time = 'Closing time is required';
        if (formData.opening_time && formData.closing_time && formData.opening_time >= formData.closing_time) {
          newErrors.closing_time = 'Closing time must be after opening time';
        }
        break;
      case 3:
        if (!formData.location.trim()) newErrors.location = 'Location is required';
        if (formData.amenities.length === 0) newErrors.amenities = 'Select at least one amenity';
        // Only require images if not in edit mode or if there's no existing image
        if (!editMode && formData.images.length === 0) {
          newErrors.images = 'Please upload at least one image for your facility.';
        } else if (editMode && !boxData?.image && formData.images.length === 0) {
          newErrors.images = 'Please upload at least one image for your facility.';
        }
        break;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleSubmit = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      setErrors(prev => ({ ...prev, submit: 'Please fix the errors in all steps before submitting.' }));
      setCurrentStep(1);
      return;
    }

    setIsSubmitting(true);
    setErrors({});
    try {
      let result;
      if (editMode && boxData?.id) {
        result = await updateBox(boxData.id, formData);
      } else {
        result = await addBox(formData);
      }

      if (result.success) {
        setSubmitted(true);
        setTimeout(() => {
          onSuccess?.();
          onClose();
          setFormData({ name: '', sports: [], location: '', price: '', capacity: '', opening_time: '06:00', closing_time: '23:00', description: '', amenities: [], images: [], rules: '', contactInfo: '', full_description: '', latitude: '', longitude: '', google_maps_url: '' });
          setCurrentStep(1);
          setSubmitted(false);
        }, 2000);
      } else {
        setErrors({ submit: result.error });
      }
    } catch {
      setErrors({ submit: 'A client-side error occurred. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={editMode ? 'Box Updated' : 'Box Submitted'} size="sm">
        <div className="text-center py-2">
          <div className="w-16 h-16 bg-success/15 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-success" />
          </div>
          <h3 className="text-xl font-display font-semibold text-foreground mb-2">
            {editMode ? 'Box Updated Successfully!' : 'Box Submitted Successfully!'}
          </h3>
          <p className="text-muted-foreground">
            {editMode
              ? 'Your sports box has been updated successfully.'
              : "Your sports box has been submitted and is now pending admin approval. You'll be notified once it's reviewed and approved."
            }
          </p>
        </div>
      </Modal>
    );
  }

  const footer = (
    <div className="flex items-center justify-between w-full">
      <div>
        {currentStep > 1 && (
          <Button variant="outline" onClick={handlePrevious}>Previous</Button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        {currentStep < 4 ? (
          <Button onClick={handleNext}>Next</Button>
        ) : (
          <Button onClick={handleSubmit} loading={isSubmitting}>
            {isSubmitting ? (editMode ? 'Updating...' : 'Submitting...') : (editMode ? 'Update Box' : 'Submit for Approval')}
          </Button>
        )}
      </div>
    </div>
  );

  const textareaClass = (hasError) => [
    'w-full px-4 py-2.5 rounded-lg bg-elevated text-foreground',
    'border transition-colors duration-150 outline-none placeholder-muted-foreground resize-none',
    'focus:ring-2 focus:ring-primary/40 focus:border-primary',
    hasError ? 'border-danger' : 'border-input',
  ].join(' ');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editMode ? 'Edit Sports Box' : 'Add New Sports Box'}
      size="xl"
      footer={footer}
    >
      {/* Progress Steps */}
      <div className="flex items-center mb-6">
        {steps.map((step, idx) => (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div
                className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                  currentStep >= step.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {currentStep > step.id ? <Check size={16} /> : <step.icon size={16} />}
              </div>
              <span
                className={`text-sm font-medium hidden sm:inline whitespace-nowrap ${
                  currentStep === step.id ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {step.title}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-3 ${currentStep > step.id ? 'bg-primary' : 'bg-secondary'}`} />
            )}
          </div>
        ))}
      </div>

      {/* Form Content */}
      <div className="max-h-[60vh] overflow-y-auto pr-1">
        {currentStep === 1 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <Input
              label="Box Name *"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              error={errors.name}
              placeholder="e.g., Elite Sports Arena"
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Short Description *</label>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                className={textareaClass(!!errors.description)}
                rows="2"
                placeholder="Short description..."
              />
              {errors.description && <p className="text-sm text-danger">{errors.description}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Full Description</label>
              <textarea
                value={formData.full_description}
                onChange={(e) => handleChange('full_description', e.target.value)}
                className={textareaClass(false)}
                rows="3"
                placeholder="Full details about your facility..."
              />
            </div>
          </motion.div>
        )}

        {currentStep === 2 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">Available Sports *</label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {availableSports.map(sport => (
                  <label
                    key={sport}
                    className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                      formData.sports.includes(sport)
                        ? 'border-primary bg-primary/15'
                        : 'border-input'
                    }`}
                  >
                    <input type="checkbox" checked={formData.sports.includes(sport)} onChange={() => handleSportToggle(sport)} className="sr-only" />
                    <span className="text-sm font-medium text-foreground">{sport}</span>
                  </label>
                ))}
              </div>
              {errors.sports && <p className="text-sm text-danger mt-1">{errors.sports}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Price (₹) *"
                type="number"
                value={formData.price}
                onChange={(e) => handleChange('price', e.target.value)}
                error={errors.price}
                placeholder="e.g., 500"
              />
              <Input
                label="Capacity *"
                type="number"
                value={formData.capacity}
                onChange={(e) => handleChange('capacity', e.target.value)}
                error={errors.capacity}
                placeholder="e.g., 20"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Opening Time *"
                type="time"
                value={formData.opening_time}
                onChange={(e) => handleChange('opening_time', e.target.value)}
                error={errors.opening_time}
                hint="When customers can start booking each day"
              />
              <Input
                label="Closing Time *"
                type="time"
                value={formData.closing_time}
                onChange={(e) => handleChange('closing_time', e.target.value)}
                error={errors.closing_time}
                hint="Last bookable slot ends by this time"
              />
            </div>
          </motion.div>
        )}

        {currentStep === 3 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Location *</label>
              <LocationPickerMap
                value={{ location: formData.location, latitude: formData.latitude, longitude: formData.longitude }}
                onChange={(next) => setFormData(prev => ({ ...prev, ...next }))}
              />
              {errors.location && <p className="text-sm text-danger">{errors.location}</p>}
            </div>
            <Input
              label="Google Maps link (optional)"
              type="url"
              placeholder="https://maps.app.goo.gl/..."
              value={formData.google_maps_url}
              onChange={(e) => handleChange('google_maps_url', e.target.value)}
              hint="Paste a link from Google Maps for this exact spot. Leave blank and we'll build one from the location you picked above."
            />
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">Amenities *</label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {availableAmenities.map(amenity => (
                  <label
                    key={amenity}
                    className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                      formData.amenities.includes(amenity)
                        ? 'border-primary bg-primary/15'
                        : 'border-input'
                    }`}
                  >
                    <input type="checkbox" checked={formData.amenities.includes(amenity)} onChange={() => handleAmenityToggle(amenity)} className="sr-only" />
                    <span className="text-sm font-medium text-foreground">{amenity}</span>
                  </label>
                ))}
              </div>
              {errors.amenities && <p className="text-sm text-danger mt-1">{errors.amenities}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Facility Images *</label>

              {/* Show existing image in edit mode */}
              {editMode && boxData?.image && (
                <div className="mb-4">
                  <p className="text-sm text-muted-foreground mb-2">Current Image:</p>
                  <img
                    src={boxData.image.startsWith('http') ? boxData.image : `${MEDIA_BASE_URL}${boxData.image}`}
                    alt="Current box image"
                    className="h-32 w-full object-cover rounded-md"
                    onError={(e) => {
                      e.target.src = 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';
                    }}
                  />
                  <p className="text-sm text-muted-foreground mt-1">Upload new images to replace the current image</p>
                </div>
              )}

              <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 ${errors.images ? 'border-danger' : 'border-input'} border-dashed rounded-md`}>
                <div className="space-y-1 text-center">
                  <UploadCloud className="mx-auto h-12 w-12 text-muted-foreground" />
                  <label htmlFor="file-upload" className="relative cursor-pointer bg-transparent rounded-md font-medium text-primary hover:text-primary/80">
                    <span>{editMode ? 'Upload new files' : 'Upload files'}</span>
                    <input id="file-upload" type="file" className="sr-only" multiple onChange={handleImageChange} accept="image/*" />
                  </label>
                </div>
              </div>
              {errors.images && <p className="text-sm text-danger mt-1">{errors.images}</p>}
              {formData.images.length > 0 && (
                <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-4">
                  {formData.images.map((file, i) => (
                    <div key={i} className="relative">
                      <img src={URL.createObjectURL(file)} alt="preview" className="h-24 w-full object-cover rounded-md" />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">Rules</label>
              <textarea
                value={formData.rules}
                onChange={(e) => handleChange('rules', e.target.value)}
                className={textareaClass(false)}
                rows="2"
                placeholder="Any rules for your facility?"
              />
            </div>
            <Input
              label="Contact Info"
              value={formData.contactInfo}
              onChange={(e) => handleChange('contactInfo', e.target.value)}
              placeholder="Phone, email, etc."
            />
          </motion.div>
        )}

        {currentStep === 4 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <h3 className="text-lg font-display font-semibold text-foreground">Review Your Submission</h3>
            <div className="bg-elevated rounded-lg p-6 space-y-4 text-foreground">
              <div><strong>Box Name:</strong> {formData.name}</div>
              <div><strong>Short Description:</strong> {formData.description}</div>
              <div><strong>Full Description:</strong> {formData.full_description}</div>
              <div><strong>Sports:</strong> {formData.sports.join(', ')}</div>
              <div><strong>Price:</strong> ₹{formData.price}</div>
              <div><strong>Capacity:</strong> {formData.capacity}</div>
              <div><strong>Hours:</strong> {formData.opening_time} - {formData.closing_time}</div>
              <div><strong>Location:</strong> {formData.location}</div>
              <div><strong>Latitude:</strong> {formData.latitude}</div>
              <div><strong>Longitude:</strong> {formData.longitude}</div>
              <div><strong>Google Maps link:</strong> {formData.google_maps_url || '(auto-generated from location)'}</div>
              <div><strong>Amenities:</strong> {formData.amenities.join(', ')}</div>
              <div><strong>Rules:</strong> {formData.rules}</div>
              <div><strong>Contact Info:</strong> {formData.contactInfo}</div>
              <div><strong>Images:</strong> {formData.images.length} file(s) selected</div>
              {formData.images.length > 0 && (
                <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {formData.images.map((file, i) => (
                    <img key={i} src={URL.createObjectURL(file)} alt="preview" className="h-16 w-full object-cover rounded-md" />
                  ))}
                </div>
              )}
            </div>
            {errors.submit && (
              <div className="bg-danger/10 p-3 rounded-lg">
                <p className="text-danger text-sm">{errors.submit}</p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </Modal>
  );
};

export default AddBoxForm;
