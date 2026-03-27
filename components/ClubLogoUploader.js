/**
 * components/ClubLogoUploader.js
 *
 * Reusable club logo upload component.
 * Mirrors the ImageUploader pattern from badge-beheer.js.
 * Storage path: club-logos/{clubId}_{timestamp}_{filename}
 *
 * Props:
 *   clubId     : string
 *   currentUrl : string | null
 *   onUploaded : (url: string) => void
 */

import { useState, useRef } from 'react';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Building2, Upload, X } from 'lucide-react';

export default function ClubLogoUploader({ clubId, currentUrl, onUploaded }) {
  const fileRef                   = useRef();
  const [uploading, setUploading] = useState(false);
  const [preview,   setPreview]   = useState(currentUrl || '');
  const [error,     setError]     = useState('');

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Alleen afbeeldingen zijn toegestaan.'); return; }
    if (file.size > 2 * 1024 * 1024)    { setError('Afbeelding mag maximaal 2 MB zijn.');   return; }
    setError('');
    setUploading(true);
    try {
      const storage  = getStorage();
      const filename = `${clubId}_${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const sRef     = storageRef(storage, `club-logos/${filename}`);
      await uploadBytes(sRef, file);
      const url = await getDownloadURL(sRef);
      setPreview(url);
      onUploaded(url);
    } catch (err) {
      console.error('[ClubLogoUploader]', err);
      setError('Upload mislukt. Probeer opnieuw.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          width: '72px', height: '72px', borderRadius: '14px',
          backgroundColor: '#0f172a', border: '2px dashed #334155',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', flexShrink: 0,
        }}>
          {preview
            ? <img src={preview} alt="Club logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Building2 size={28} color="#475569" />
          }
        </div>

        <div style={{ flex: 1 }}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '8px',
              backgroundColor: 'transparent', border: '1px solid #334155',
              color: '#94a3b8', fontSize: '13px', fontWeight: '600',
              cursor: uploading ? 'default' : 'pointer',
              opacity: uploading ? 0.65 : 1, fontFamily: 'inherit',
            }}
          >
            <Upload size={13} />
            {uploading ? 'Uploaden…' : preview ? 'Logo vervangen' : 'Logo uploaden'}
          </button>

          {preview && (
            <button
              type="button"
              onClick={() => { setPreview(''); onUploaded(''); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                marginLeft: '8px', padding: '8px 12px', borderRadius: '8px',
                backgroundColor: 'transparent', border: '1px solid #334155',
                color: '#ef4444', fontSize: '13px', fontWeight: '600',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <X size={12} /> Wis
            </button>
          )}
          <p style={{ fontSize: '10px', color: '#475569', margin: '6px 0 0' }}>PNG / JPG · max 2 MB</p>
        </div>
      </div>

      {error && (
        <div style={{
          marginTop: '8px', fontSize: '12px', color: '#ef4444',
          backgroundColor: '#ef444411', borderRadius: '6px',
          padding: '6px 10px', border: '1px solid #ef444433',
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
