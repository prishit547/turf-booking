import { useState } from 'react';
import { Star, Trash2, ArrowLeft, ArrowRight, UploadCloud } from 'lucide-react';
import { toast } from 'react-toastify';
import { api, MEDIA_BASE_URL, resolveMediaUrl } from '../../api';

const FALLBACK = 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80';

const srcFor = (path) => resolveMediaUrl(path) || FALLBACK;

// The API hands back absolute media URLs but stores relative paths; compare
// on the trailing storage path so "is this the cover?" works either way.
const storagePath = (value) => (value || '').split('/media/').pop().replace(/^\/+/, '');

/**
 * Per-image gallery management for an already-saved box — add, delete,
 * reorder, and pick a cover photo individually, instead of the wizard's
 * all-or-nothing "upload new images to replace the current image".
 * Each action hits its own endpoint and applies immediately, so this is
 * only rendered in edit mode where a box id exists.
 */
export default function BoxImageManager({ boxId, images = [], coverPath, onChange }) {
    const [busy, setBusy] = useState(false);

    const run = async (fn, errorMessage) => {
        setBusy(true);
        try {
            const { data } = await fn();
            onChange?.(data);
        } catch (err) {
            toast.error(err.response?.data?.detail || errorMessage);
        } finally {
            setBusy(false);
        }
    };

    const handleUpload = (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const body = new FormData();
        files.forEach((f) => body.append('images', f));
        run(
            () => api.post(`/boxes/owner/${boxId}/add_images/`, body),
            'Could not upload those images.'
        );
        e.target.value = '';
    };

    const move = (index, delta) => {
        const next = [...images];
        const target = index + delta;
        if (target < 0 || target >= next.length) return;
        [next[index], next[target]] = [next[target], next[index]];
        run(
            () => api.post(`/boxes/owner/${boxId}/images/reorder/`, { images: next }),
            'Could not reorder images.'
        );
    };

    return (
        <div className="space-y-3">
            {images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {images.map((path, i) => {
                        const isCover = storagePath(path) === storagePath(coverPath);
                        return (
                            <div
                                key={path}
                                className={`relative overflow-hidden rounded-lg border-2 ${isCover ? 'border-primary' : 'border-border'}`}
                            >
                                <img
                                    src={srcFor(path)}
                                    alt=""
                                    className="h-28 w-full object-cover"
                                    onError={(e) => { e.target.src = FALLBACK; }}
                                />
                                {isCover && (
                                    <span className="absolute left-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground">
                                        Cover
                                    </span>
                                )}
                                <div className="flex items-center justify-between gap-1 bg-background/90 px-1.5 py-1">
                                    <div className="flex gap-0.5">
                                        <button
                                            type="button" disabled={busy || i === 0} onClick={() => move(i, -1)}
                                            aria-label="Move image earlier"
                                            className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                        >
                                            <ArrowLeft size={13} />
                                        </button>
                                        <button
                                            type="button" disabled={busy || i === images.length - 1} onClick={() => move(i, 1)}
                                            aria-label="Move image later"
                                            className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                                        >
                                            <ArrowRight size={13} />
                                        </button>
                                    </div>
                                    <div className="flex gap-0.5">
                                        <button
                                            type="button" disabled={busy || isCover}
                                            onClick={() => run(
                                                () => api.post(`/boxes/owner/${boxId}/images/set-cover/`, { path }),
                                                'Could not set the cover photo.'
                                            )}
                                            aria-label="Make cover photo"
                                            className="rounded p-1 text-muted-foreground hover:text-primary disabled:opacity-30"
                                        >
                                            <Star size={13} className={isCover ? 'fill-primary text-primary' : ''} />
                                        </button>
                                        <button
                                            type="button" disabled={busy || images.length <= 1}
                                            onClick={() => run(
                                                () => api.post(`/boxes/owner/${boxId}/images/remove/`, { path }),
                                                'Could not delete that image.'
                                            )}
                                            aria-label="Delete image"
                                            className="rounded p-1 text-muted-foreground hover:text-danger disabled:opacity-30"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="flex justify-center rounded-md border-2 border-dashed border-input px-6 py-4">
                <label className="cursor-pointer text-center text-sm font-medium text-primary hover:text-primary/80">
                    <UploadCloud className="mx-auto mb-1 h-8 w-8 text-muted-foreground" />
                    <span>{busy ? 'Working...' : 'Add more photos'}</span>
                    <input type="file" className="sr-only" multiple accept="image/*" onChange={handleUpload} disabled={busy} />
                </label>
            </div>
        </div>
    );
}
