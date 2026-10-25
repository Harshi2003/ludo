'use client';
import { useRef, useState } from 'react';
import { ANIMAL_ICONS, MAX_PHOTO_LENGTH, type PlayerProfile } from '@ludo/net';
export function ProfileAvatar({ profile, name, size = 40 }: { profile: PlayerProfile; name: string; size?: number }) {
  const style = { width: size, height: size };
  if (profile.kind === 'photo') return <img src={profile.dataUrl} alt={`${name}'s profile`} width={size} height={size} className="shrink-0 rounded-full object-cover ring-1 ring-white/20" />;
  const animal = ANIMAL_ICONS.find(a => a.id === profile.animal) ?? ANIMAL_ICONS[0];
  return <span role="img" aria-label={`${name}'s ${animal.name} profile`} style={style} className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary/20 text-2xl ring-1 ring-white/20">{animal.emoji}</span>;
}
export function ProfilePicker({ value, onChange, onBusy }: { value: PlayerProfile; onChange: (p: PlayerProfile) => void; onBusy: (busy: boolean) => void }) {
  const [error, setError] = useState(''), [uploading, setUploading] = useState(false);
  const request = useRef(0);
  async function upload(file: File) {
    const version = ++request.current;
    setError(''); setUploading(true); onBusy(true);
    let url: string | null = null;
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG, or WebP image up to 5 MB.');
      url = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('This image could not be opened.')); img.src = url!; });
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 160;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Photo processing is unavailable. Choose an animal icon instead.');
      ctx.fillStyle = '#171236'; ctx.fillRect(0, 0, 160, 160);
      const edge = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, (img.naturalWidth - edge) / 2, (img.naturalHeight - edge) / 2, edge, edge, 0, 0, 160, 160);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      if (dataUrl.length > MAX_PHOTO_LENGTH) throw new Error('This photo is too large. Please choose another image.');
      if (version === request.current) onChange({ kind: 'photo', dataUrl });
    } catch (e) { if (version === request.current) setError(e instanceof Error ? e.message : 'Photo upload failed.'); }
    finally { if (url) URL.revokeObjectURL(url); if (version === request.current) { setUploading(false); onBusy(false); } }
  }
  return <fieldset className="rounded-2xl border border-white/10 p-4">
    <legend className="px-2 font-display text-lg text-gold">Your profile</legend>
    <div className="mb-4 flex items-center gap-3"><ProfileAvatar profile={value} name="Your" size={56} /><p className="text-sm text-muted">Choose an animal or upload your own photo. Your profile is visible to everyone in the room.</p></div>
    <div className="grid grid-cols-5 gap-2" role="group" aria-label="Animal profile icons">{ANIMAL_ICONS.map(animal => {
      const selected = value.kind === 'animal' && value.animal === animal.id;
      return <button type="button" key={animal.id} aria-label={animal.name} aria-pressed={selected} onClick={() => { request.current++; setUploading(false); onBusy(false); setError(''); onChange({ kind: 'animal', animal: animal.id }); }} className={`relative rounded-xl border p-2 text-center ${selected ? 'border-accent bg-primary/30 ring-2 ring-accent/50' : 'border-white/10 bg-white/5'}`}><span aria-hidden="true" className="text-2xl">{animal.emoji}</span>{selected && <span aria-hidden="true" className="absolute right-1 top-0.5 text-xs font-bold text-accent">✓</span>}</button>;
    })}</div>
    <label className="mt-4 block text-sm">Upload a photo<input type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm text-muted" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file); }} /></label>
    <p className="mt-2 text-xs text-muted">JPG, PNG, or WebP · Up to 5 MB · Center-cropped to a square</p>
    {value.kind === 'photo' && <p className="mt-2 text-sm text-accent">Photo selected. Choose an animal to replace it.</p>}
    {uploading && <p role="status" className="mt-2 text-sm text-accent">Preparing your photo…</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
  </fieldset>;
}
