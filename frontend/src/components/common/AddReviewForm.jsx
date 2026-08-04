import { useState } from 'react';
import { Star, Send } from 'lucide-react';
import { api } from '../../api.jsx';
import { toast } from 'react-toastify';
import { Modal, Button } from '../ui';

const RATING_LABELS = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very Good', 5: 'Excellent' };

const AddReviewForm = ({ isOpen, onClose, boxId, onReviewAdded }) => {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (rating === 0) {
      setError('Please select a rating');
      return;
    }

    if (!comment.trim()) {
      setError('Please write a comment');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await api.post(`/boxes/public/${boxId}/add_review/`, {
        rating: rating,
        comment: comment.trim()
      });

      toast.success('Review added successfully!');
      onReviewAdded?.(response.data);
      onClose();

      // Reset form
      setRating(0);
      setComment('');
    } catch (err) {
      console.error('Error adding review:', err);
      const errorMessage = err.response?.data?.detail ||
                          err.response?.data?.error ||
                          'Failed to add review. Please try again.';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setRating(0);
    setHoverRating(0);
    setComment('');
    setError('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Add Your Review" size="sm">
      <form onSubmit={handleSubmit}>
        {/* Rating */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-3">
            Rating *
          </label>
          <div className="flex items-center space-x-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className="p-1 transition-transform hover:scale-110"
              >
                <Star
                  size={32}
                  className={`transition-colors ${
                    star <= (hoverRating || rating)
                      ? 'text-warning fill-warning'
                      : 'text-muted-foreground'
                  }`}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-sm text-muted-foreground mt-2">{RATING_LABELS[rating]}</p>
          )}
        </div>

        {/* Comment */}
        <div className="mb-6">
          <label htmlFor="review-comment" className="block text-sm font-medium text-foreground mb-2">
            Your Review *
          </label>
          <textarea
            id="review-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your experience with this sports box..."
            rows={4}
            maxLength={500}
            className="w-full px-4 py-2.5 rounded-lg bg-elevated text-foreground border border-input transition-colors duration-150 outline-none placeholder-muted-foreground focus:ring-2 focus:ring-primary/40 focus:border-primary resize-none"
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-muted-foreground">
              {comment.length}/500 characters
            </span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg">
            <p className="text-danger text-sm">{error}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex space-x-3">
          <Button
            type="button"
            onClick={handleClose}
            variant="outline"
            size="md"
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            className="flex-1"
            loading={isSubmitting}
            disabled={isSubmitting || rating === 0 || !comment.trim()}
            icon={<Send size={16} />}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Review'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AddReviewForm;
