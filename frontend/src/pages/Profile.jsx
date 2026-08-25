import { useState, useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-toastify';
import { User, Mail, Phone, MapPin, Calendar, Camera, Edit2, Save, X, Info, Dumbbell, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth, MEDIA_BASE_URL, api, resolveMediaUrl } from '../api.jsx' // Correct path to your api.jsx
import { formatLocalDate } from '../utils/date'
import { Button, Card, Badge, Input, Loader } from '../components/ui';

// Shared text-input/textarea look (matches Input.jsx's styling so the two
// compose visually — Input itself doesn't support multiline).
const textareaClass = (hasError) => [
  'w-full px-4 py-2.5 rounded-lg bg-elevated text-foreground',
  'border transition-colors duration-150 outline-none resize-none placeholder-muted-foreground',
  'focus:ring-2 focus:ring-primary/40 focus:border-primary',
  hasError ? 'border-danger' : 'border-input',
].join(' ');

// Label + either the editable control (isEditing) or a static read-only
// value box. Defined at module scope (not inside Profile) so its identity
// stays stable across renders — recreating a component type on every render
// would remount the underlying <input>, dropping focus mid-keystroke.
function ProfileField({ label, icon, isEditing, value, children }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
        {icon}
        <span>{label}</span>
      </label>
      {isEditing ? (
        children
      ) : (
        <div className="min-h-[46px] flex items-center px-4 py-2.5 rounded-lg bg-elevated border border-border">
          <p className="text-sm text-foreground break-words">{value}</p>
        </div>
      )}
    </div>
  );
}

const Profile = () => {
  const { user, fetchUserProfile, updateProfile, generalError, logout } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    location: '',
    dateOfBirth: '',
    bio: '',
    preferredSports: [],
    emergencyContact: '',
    address: ''
  });

  const [isEditing, setIsEditing] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [globalProfileError, setGlobalProfileError] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef(null);

  // Change-password — deliberately independent of the profile-edit form
  // above (its own inputs, its own submit), since it hits a different
  // endpoint and, on success, has a much bigger consequence: the backend
  // now blacklists every outstanding refresh token for this user on a
  // successful change (see user/serializers.py::PasswordChangeSerializer),
  // so this session's own tokens stop working the instant the request
  // succeeds. There's no attempt to keep the current session alive —
  // logout() + redirect to /login is the deliberate, simpler behavior.
  const [passwordForm, setPasswordForm] = useState({ current_password: '', new_password: '', confirm_new_password: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPasswordFields, setShowPasswordFields] = useState(false);
  const [revealPasswords, setRevealPasswords] = useState(false);

  const sports = ['Cricket', 'Football', 'Tennis', 'Badminton', 'Basketball', 'Pickleball', 'Volleyball', 'Table Tennis'];

  // Effect 1: Sync formData when the `user` object from context changes. This is correct.
  useEffect(() => {
    if (user) {
      setFormData({
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email || '',
        phone: user.phone || '',
        location: user.location || '',
        dateOfBirth: user.date_of_birth ? formatLocalDate(new Date(user.date_of_birth)) : '',
        bio: user.bio || '',
        preferredSports: user.preferred_sports || [],
        emergencyContact: user.emergency_contact || '',
        address: user.address || ''
      });
      setProfileLoading(false);
      setGlobalProfileError(null);
      setFormErrors({});
      setSaveSuccess(false);
    } else {
      setFormData({
        firstName: '', lastName: '', email: '', phone: '', location: '', dateOfBirth: '', bio: '',
        preferredSports: [], emergencyContact: '', address: ''
      });
      setProfileLoading(false);
    }
  }, [user]);

  // Effect 2: Fetch user profile data on initial component mount if needed.
  useEffect(() => {
    const initialLoad = async () => {
      if (!user) {
        setProfileLoading(true);
        setGlobalProfileError(null);
        await fetchUserProfile();
        setProfileLoading(false);
      } else {
        setProfileLoading(false);
      }
    };
    initialLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setSaveSuccess(false);
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSportToggle = (sport) => {
    setFormData(prev => {
      const updatedSports = prev.preferredSports.includes(sport)
        ? prev.preferredSports.filter(s => s !== sport)
        : [...prev.preferredSports, sport];
      return { ...prev, preferredSports: updatedSports };
    });
    setSaveSuccess(false);
    if (formErrors.preferredSports) {
      setFormErrors(prev => ({ ...prev, preferredSports: undefined }));
    }
  };

  // Uploaded independently of the rest of the form (its own multipart
  // request) so picking a photo doesn't require also being mid-edit-and-save
  // on every other field — updateProfile() already accepts a FormData body
  // as-is, axios sets the multipart Content-Type automatically.
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarUploading(true);
    const body = new FormData();
    body.append('avatar', file);
    const result = await updateProfile(body);
    setAvatarUploading(false);
    if (result.success) {
      toast.success('Profile photo updated!');
    } else {
      toast.error(result.error || 'Failed to update your photo.');
    }
  };

  const handlePasswordFieldChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm(prev => ({ ...prev, [name]: value }));
    if (passwordErrors[name]) setPasswordErrors(prev => ({ ...prev, [name]: undefined }));
    if (passwordErrors.general) setPasswordErrors(prev => ({ ...prev, general: undefined }));
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.new_password.length < 6) {
      setPasswordErrors({ new_password: 'Password must be at least 6 characters' });
      return;
    }
    if (passwordForm.new_password !== passwordForm.confirm_new_password) {
      setPasswordErrors({ confirm_new_password: 'Passwords do not match' });
      return;
    }

    setPasswordLoading(true);
    setPasswordErrors({});
    try {
      await api.post('/user/change-password/', passwordForm);
      // The backend just blacklisted every refresh token issued to this
      // user, including the one backing this very session — there is
      // nothing left to keep alive here. Clear local auth state and send
      // the user back to /login to sign in fresh.
      logout();
      toast.success('Your password was changed. Please sign in again.');
      navigate('/login');
    } catch (error) {
      const data = error.response?.data;
      if (error.response?.status === 429) {
        setPasswordErrors({ general: 'Too many attempts. Please wait a moment and try again.' });
      } else if (data?.errors) {
        const flattened = Object.fromEntries(
          Object.entries(data.errors).map(([field, msgs]) => [field, Array.isArray(msgs) ? msgs.join(' ') : String(msgs)])
        );
        setPasswordErrors(flattened);
      } else {
        setPasswordErrors({ general: 'Failed to change password. Please try again.' });
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleSave = async () => {
    setSaveLoading(true);
    setGlobalProfileError(null);
    setFormErrors({});
    setSaveSuccess(false);

    const dataToSave = {
      first_name: formData.firstName,
      last_name: formData.lastName,
      phone: formData.phone,
      location: formData.location,
      date_of_birth: formData.dateOfBirth,
      bio: formData.bio,
      preferred_sports: formData.preferredSports,
      emergency_contact: formData.emergencyContact,
      address: formData.address
    };

    const result = await updateProfile(dataToSave);

    if (result.success) {
      // The fetchUserProfile() call is removed from here.
      // The context update from updateProfile() is enough to trigger the useEffect hook,
      // which handles syncing the form data.
      setIsEditing(false);
      setSaveSuccess(true);
    } else {
      console.error('Failed to save profile:', result.error || result.errors);
      if (result.errors) {
        const mappedErrors = {};
        for (const key in result.errors) {
          const frontendKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
          mappedErrors[frontendKey] = result.errors[key];
        }
        setFormErrors(mappedErrors);
        setGlobalProfileError('Please correct the errors in the form.');
      } else {
        setGlobalProfileError(result.error || 'An unexpected error occurred during save.');
      }
    }
    setSaveLoading(false);
  };

  const handleCancelEdit = () => {
    // This is correct: it resets the form using the source of truth (the 'user' object from context)
    if (user) {
      setFormData({
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email || '',
        phone: user.phone || '',
        location: user.location || '',
        dateOfBirth: user.date_of_birth ? formatLocalDate(new Date(user.date_of_birth)) : '',
        bio: user.bio || '',
        preferredSports: user.preferred_sports || [],
        emergencyContact: user.emergency_contact || '',
        address: user.address || ''
      });
    }
    setIsEditing(false);
    setGlobalProfileError(null);
    setFormErrors({});
    setSaveSuccess(false);
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader size="lg" text="Loading profile..." />
      </div>
    );
  }

  if (!user && !profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-lg text-muted-foreground">Please log in to view your profile.</p>
      </div>
    );
  }

  const displayName = `${formData.firstName || ''} ${formData.lastName || ''}`.trim() || user?.email || '';
  const avatarLetter = displayName.charAt(0).toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-background py-8">
      <Helmet>
        <title>My Profile | BoxNplay</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header panel */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-2xl bg-card border border-border text-foreground p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <User size={28} className="text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold">Profile Settings</h1>
              <p className="mt-1.5 text-muted-foreground text-sm sm:text-base">
                Manage your personal information and preferences
              </p>
            </div>
          </div>
          {!isEditing && (
            <Button onClick={() => setIsEditing(true)} icon={<Edit2 size={18} />} className="w-full sm:w-auto shrink-0">
              Edit Profile
            </Button>
          )}
        </motion.div>

        {/* Error / success messages */}
        {(globalProfileError || generalError) && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-3 mt-6 px-6 py-4 rounded-lg border border-danger/30 bg-danger/10"
          >
            <Info size={20} className="shrink-0 text-danger" />
            <p className="text-sm font-medium text-danger">{globalProfileError || generalError}</p>
          </motion.div>
        )}

        {saveSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-3 mt-6 px-6 py-4 rounded-lg border border-success/30 bg-success/10"
          >
            <Info size={20} className="shrink-0 text-success" />
            <p className="text-sm font-medium text-success">Profile updated successfully!</p>
          </motion.div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8 mt-8">
          {/* Profile picture & basic info */}
          <div className="xl:col-span-1 space-y-6">
            <Card padding="lg">
              <div className="flex flex-col items-center text-center gap-4 mb-6">
                <div className="relative">
                  {user?.avatar ? (
                    <img
                      src={resolveMediaUrl(user.avatar)}
                      alt=""
                      className="w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl sm:text-3xl font-display">
                      {avatarLetter}
                    </div>
                  )}
                  {isEditing && (
                    <button
                      type="button"
                      aria-label="Change profile photo"
                      disabled={avatarUploading}
                      onClick={() => avatarInputRef.current?.click()}
                      className="absolute -bottom-1 -right-1 p-2 rounded-full bg-elevated border-2 border-background shadow-md text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                    >
                      <Camera size={14} />
                    </button>
                  )}
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                </div>

                <div>
                  <h2 className="font-display text-xl sm:text-2xl text-foreground">{displayName}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{formData.email}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <Phone size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium text-foreground truncate">{formData.phone || 'Not provided'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-lg bg-success/15 text-success flex items-center justify-center shrink-0">
                    <MapPin size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Location</p>
                    <p className="text-sm font-medium text-foreground truncate">{formData.location || 'Not provided'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3">
                  <div className="w-9 h-9 rounded-lg bg-turf/15 text-turf flex items-center justify-center shrink-0">
                    <Calendar size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Birthday</p>
                    <p className="text-sm font-medium text-foreground">
                      {formData.dateOfBirth ? new Date(formData.dateOfBirth).toLocaleDateString() : 'Not provided'}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Preferred sports — display mode only */}
            {!isEditing && (
              <Card padding="md">
                <h3 className="font-display text-lg text-foreground mb-4 flex items-center gap-2">
                  <Dumbbell size={18} className="text-turf" />
                  <span>Preferred Sports</span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {formData.preferredSports.length > 0 ? (
                    formData.preferredSports.map((sport) => (
                      <Badge key={sport} tone="secondary" size="md">{sport}</Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No preferred sports selected.</p>
                  )}
                </div>
              </Card>
            )}
          </div>

          {/* Detailed information */}
          <div className="xl:col-span-2">
            <Card padding="lg">
              <h3 className="font-display text-xl sm:text-2xl text-foreground mb-6 sm:mb-8 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                  <User size={20} />
                </div>
                <span>Personal Information</span>
              </h3>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                <ProfileField label="First Name" isEditing={isEditing} value={formData.firstName || 'N/A'}>
                  <Input
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleChange}
                    placeholder="Enter your first name"
                    error={formErrors.firstName?.[0]}
                  />
                </ProfileField>

                <ProfileField label="Last Name" isEditing={isEditing} value={formData.lastName || 'N/A'}>
                  <Input
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleChange}
                    placeholder="Enter your last name"
                    error={formErrors.lastName?.[0]}
                  />
                </ProfileField>

                {/* Email is always read-only */}
                <div className="lg:col-span-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
                    <Mail size={16} className="text-primary" />
                    <span>Email Address</span>
                  </label>
                  <div className="px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/30">
                    <p className="text-sm text-primary font-medium break-all">{formData.email || 'N/A'}</p>
                  </div>
                </div>

                <ProfileField
                  label="Phone Number"
                  icon={<Phone size={16} className="text-success" />}
                  isEditing={isEditing}
                  value={formData.phone || 'N/A'}
                >
                  <Input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="Enter your phone number"
                    error={formErrors.phone?.[0]}
                  />
                </ProfileField>

                <ProfileField
                  label="Date of Birth"
                  icon={<Calendar size={16} className="text-turf" />}
                  isEditing={isEditing}
                  value={formData.dateOfBirth ? new Date(formData.dateOfBirth).toLocaleDateString() : 'N/A'}
                >
                  <Input
                    type="date"
                    name="dateOfBirth"
                    value={formData.dateOfBirth}
                    onChange={handleChange}
                    error={formErrors.dateOfBirth?.[0]}
                  />
                </ProfileField>
              </div>

              <div className="grid grid-cols-1 gap-6 mt-6">
                <ProfileField label="Location" isEditing={isEditing} value={formData.location || 'N/A'}>
                  <Input
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    error={formErrors.location?.[0]}
                  />
                </ProfileField>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Address</label>
                  {isEditing ? (
                    <>
                      <textarea
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        rows={2}
                        className={textareaClass(!!formErrors.address)}
                      />
                      {formErrors.address && <p className="text-sm text-danger mt-1.5">{formErrors.address[0]}</p>}
                    </>
                  ) : (
                    <div className="min-h-[46px] flex items-center px-4 py-2.5 rounded-lg bg-elevated border border-border">
                      <p className="text-sm text-foreground break-words">{formData.address || 'N/A'}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Bio</label>
                  {isEditing ? (
                    <>
                      <textarea
                        name="bio"
                        value={formData.bio}
                        onChange={handleChange}
                        rows={3}
                        className={textareaClass(!!formErrors.bio)}
                        placeholder="Tell us about yourself..."
                      />
                      {formErrors.bio && <p className="text-sm text-danger mt-1.5">{formErrors.bio[0]}</p>}
                    </>
                  ) : (
                    <div className="min-h-[46px] flex items-center px-4 py-2.5 rounded-lg bg-elevated border border-border">
                      <p className="text-sm text-foreground break-words">{formData.bio || 'N/A'}</p>
                    </div>
                  )}
                </div>

                <ProfileField label="Emergency Contact" isEditing={isEditing} value={formData.emergencyContact || 'N/A'}>
                  <Input
                    type="tel"
                    name="emergencyContact"
                    value={formData.emergencyContact}
                    onChange={handleChange}
                    error={formErrors.emergencyContact?.[0]}
                  />
                </ProfileField>
              </div>

              {/* Sports preferences — edit mode */}
              {isEditing && (
                <div className="mt-6 pt-6 border-t border-border">
                  <label className="block text-sm font-medium text-foreground mb-3">Preferred Sports</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                    {sports.map((sport) => (
                      <label key={sport} className="flex items-center gap-2 cursor-pointer p-1">
                        <input
                          type="checkbox"
                          checked={formData.preferredSports.includes(sport)}
                          onChange={() => handleSportToggle(sport)}
                          className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-foreground truncate">{sport}</span>
                      </label>
                    ))}
                  </div>
                  {formErrors.preferredSports && <p className="text-sm text-danger mt-1.5">{formErrors.preferredSports[0]}</p>}
                </div>
              )}

              {/* Action buttons — edit mode */}
              {isEditing && (
                <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 mt-8 pt-6 border-t border-border">
                  <Button
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={saveLoading}
                    icon={<X size={18} />}
                    className="w-full sm:w-auto justify-center"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    loading={saveLoading}
                    icon={<Save size={18} />}
                    className="w-full sm:w-auto justify-center"
                  >
                    {saveLoading ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              )}
            </Card>

            {/* Change password — independent of the edit-profile form above,
                see handleChangePassword's comment for why a success here
                ends the session. */}
            <Card padding="lg" className="mt-6">
              <button
                type="button"
                onClick={() => setShowPasswordFields(prev => !prev)}
                className="w-full flex items-center justify-between gap-3 text-left"
              >
                <span className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                    <ShieldCheck size={20} />
                  </span>
                  <span>
                    <h3 className="font-display text-xl sm:text-2xl text-foreground">Change Password</h3>
                    <p className="text-sm text-muted-foreground mt-1">Update the password used to sign in</p>
                  </span>
                </span>
                <span className="text-sm font-medium text-primary shrink-0">
                  {showPasswordFields ? 'Cancel' : 'Change'}
                </span>
              </button>

              {showPasswordFields && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  onSubmit={handleChangePassword}
                  className="mt-6 pt-6 border-t border-border space-y-5"
                >
                  {passwordErrors.general && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-danger/30 bg-danger/10">
                      <Info size={18} className="shrink-0 text-danger" />
                      <p className="text-sm font-medium text-danger">{passwordErrors.general}</p>
                    </div>
                  )}

                  <Input
                    label="Current password"
                    name="current_password"
                    type={revealPasswords ? 'text' : 'password'}
                    value={passwordForm.current_password}
                    onChange={handlePasswordFieldChange}
                    leadingIcon={<Lock size={18} />}
                    error={passwordErrors.current_password?.[0] || passwordErrors.current_password}
                    disabled={passwordLoading}
                    autoComplete="current-password"
                  />

                  <Input
                    label="New password"
                    name="new_password"
                    type={revealPasswords ? 'text' : 'password'}
                    value={passwordForm.new_password}
                    onChange={handlePasswordFieldChange}
                    leadingIcon={<Lock size={18} />}
                    trailingIcon={
                      <button
                        type="button"
                        onClick={() => setRevealPasswords(prev => !prev)}
                        disabled={passwordLoading}
                        className="pointer-events-auto text-muted-foreground hover:text-foreground"
                      >
                        {revealPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    }
                    error={passwordErrors.new_password?.[0] || passwordErrors.new_password}
                    placeholder="At least 6 characters"
                    disabled={passwordLoading}
                    autoComplete="new-password"
                  />

                  <Input
                    label="Confirm new password"
                    name="confirm_new_password"
                    type={revealPasswords ? 'text' : 'password'}
                    value={passwordForm.confirm_new_password}
                    onChange={handlePasswordFieldChange}
                    leadingIcon={<Lock size={18} />}
                    error={passwordErrors.confirm_new_password?.[0] || passwordErrors.confirm_new_password}
                    disabled={passwordLoading}
                    autoComplete="new-password"
                  />

                  <p className="text-sm text-muted-foreground">
                    Changing your password will sign you out of all devices — you&apos;ll need to sign in again.
                  </p>

                  <div className="flex justify-end">
                    <Button type="submit" loading={passwordLoading} icon={<ShieldCheck size={18} />}>
                      {passwordLoading ? 'Updating…' : 'Update Password'}
                    </Button>
                  </div>
                </motion.form>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
