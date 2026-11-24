import { useState } from 'react';
import type { Task, Staff } from '../../types/models';
import { Field } from '../../ui/Field';
import { Modal } from '../../ui/Modal';

export function TaskCompletionModal({ task, onClose, onComplete, flash }: { task: Task; onClose: () => void; onComplete: (photo: File, video: File) => Promise<void>; flash: (message: string) => void }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  function valid(file: File, kind: 'photo'|'video') {
    const allowed = kind === 'photo' ? ['image/jpeg','image/png','image/webp'] : ['video/mp4','video/webm','video/quicktime'];
    const limit = kind === 'photo' ? 2 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!allowed.includes(file.type)) { flash(kind === 'photo' ? 'Choose a JPG, PNG or WEBP photo.' : 'Choose an MP4, WEBM or MOV video.'); return false; }
    if (file.size > limit) { flash(kind === 'photo' ? 'Photo must be 2 MB or smaller.' : 'Video must be 8 MB or smaller.'); return false; }
    return true;
  }
  return <Modal title="Complete task with evidence" subtitle={task.title} onClose={onClose}>
    <form className="form-grid" onSubmit={async event => { event.preventDefault(); if (!photo || !video) { flash('Both a task photo and a task video are required.'); return; } setBusy(true); await onComplete(photo, video); setBusy(false); }}>
      <p className="form-hint">Both a photo and a video are required. The task remains open until both files upload successfully.</p>
      <Field label="Task photo (required)" wide><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={event => { const file=event.target.files?.[0]||null; setPhoto(file&&valid(file,'photo')?file:null); }}/>{photo&&<small>{photo.name} · {(photo.size/1024).toFixed(0)} KB</small>}</Field>
      <Field label="Task video (required)" wide><input type="file" accept="video/mp4,video/webm,video/quicktime" capture="environment" onChange={event => { const file=event.target.files?.[0]||null; setVideo(file&&valid(file,'video')?file:null); }}/>{video&&<small>{video.name} · {(video.size/1024/1024).toFixed(1)} MB</small>}</Field>
      <div className="form-actions"><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy||!photo||!video}>{busy?'Uploading evidence…':'Upload and complete task'}</button></div>
    </form>
  </Modal>;
}
