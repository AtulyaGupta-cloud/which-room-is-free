import { useMemo, useRef, useState } from 'react';
import { CalendarDays, Camera, ChevronDown, Pencil, Trash2, Upload, X } from 'lucide-react';
import { extractPersonalTimetable, savePersonalTimetable, type PersonalClass } from '../lib/personalTimetable';

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

interface Props {
  classes: PersonalClass[];
  onChange: (classes: PersonalClass[]) => void;
  onOpenRoom: (room: string) => void;
}

export default function PersonalTimetable({ classes, onChange, onOpenRoom }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<'closed' | 'upload' | 'review'>('closed');
  const [draft, setDraft] = useState<PersonalClass[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const availableDays = useMemo(() => WEEK.filter((day) => classes.some((item) => item.day.toLowerCase() === day.toLowerCase())), [classes]);
  const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' }).format(new Date());
  const [selectedDay, setSelectedDay] = useState(today);
  const activeDay = availableDays.includes(selectedDay) ? selectedDay : availableDays[0] ?? today;
  const visibleClasses = classes.filter((item) => item.day.toLowerCase() === activeDay.toLowerCase()).sort((a, b) => a.startTime.localeCompare(b.startTime));

  const chooseImage = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      setDraft(await extractPersonalTimetable(file));
      setModal('review');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The timetable could not be read.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const update = (index: number, key: keyof PersonalClass, value: string) => {
    setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };

  const save = () => {
    const verified = draft.filter((item) => item.day && item.courseCode && item.startTime && item.endTime && item.room);
    savePersonalTimetable(verified);
    onChange(verified);
    setSelectedDay(verified.some((item) => item.day === today) ? today : verified[0]?.day ?? today);
    setExpanded(true);
    setModal('closed');
  };

  return <section className={`my-classes-home${classes.length ? ' has-data' : ''}`}>
    {classes.length === 0 ? <button className="my-classes-import" type="button" onClick={() => { setError(''); setModal('upload'); }}>
      <span><Upload /></span><div><strong>Import My Timetable</strong><small>Upload any timetable image to find your classes and rooms</small></div><ChevronDown />
    </button> : <>
      <header className="my-classes-header">
        <button className="my-classes-toggle" type="button" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
          <CalendarDays /><span><strong>My Classes</strong><small>{classes.length} verified classes saved privately on this device</small></span><ChevronDown className={expanded ? 'is-open' : ''} />
        </button>
        <button className="my-classes-replace" type="button" onClick={() => { setError(''); setModal('upload'); }}><Pencil /> Replace</button>
      </header>
      {expanded && <div className="my-classes-expanded">
        <label className="my-classes-day">View classes for<select value={activeDay} onChange={(event) => setSelectedDay(event.target.value)}>{availableDays.map((day) => <option key={day}>{day}</option>)}</select></label>
        <div className="my-classes-list">{visibleClasses.map((item) => <article key={item.id}>
          <time>{item.startTime}<small>to {item.endTime}</small></time>
          <div><strong>{item.courseCode}{item.section ? ` · ${item.section}` : ''}</strong><span>{item.courseName || item.classType}</span></div>
          <button type="button" onClick={() => onOpenRoom(item.room)}><small>ROOM</small>{item.room}</button>
        </article>)}</div>
      </div>}
    </>}

    {modal !== 'closed' && <div className="timetable-modal-layer"><button className="timetable-modal-backdrop" aria-label="Close" onClick={() => !busy && setModal('closed')} /><section className="timetable-modal" role="dialog" aria-modal="true">
      <button className="timetable-modal-close" type="button" aria-label="Close" onClick={() => !busy && setModal('closed')}><X /></button>
      {modal === 'upload' ? <>
        <p className="timetable-kicker">No login required</p><h2>Import My Timetable</h2>
        <p className="timetable-intro">Upload a clear timetable picture containing any visible days or hours. Secure vision reads every class tile, then you review everything before it is saved.</p>
        <button className="timetable-upload-zone" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? <><span className="timetable-spinner" /><strong>Reading the complete timetable…</strong><small>This can take 10–30 seconds. Keep this screen open.</small></> : <><Camera /><strong>Choose timetable picture</strong><small>PNG, JPG or WebP · maximum 12 MB</small></>}</button>
        <p className="timetable-privacy">The image is processed securely for extraction and is not saved in your account. Verified class data stays in this browser.</p>
        {error && <p className="timetable-error">{error}</p>}
        <input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseImage(event.target.files?.[0])} />
      </> : <>
        <p className="timetable-kicker">Review required</p><h2>Check all {draft.length} detected classes</h2>
        <p className="timetable-intro">Verify the day, course, time and room. Edit anything unclear before saving.</p>
        <div className="timetable-review-list">{draft.map((item, index) => <article key={`${item.id}-${index}`}>
          <select aria-label="Day" value={item.day} onChange={(event) => update(index, 'day', event.target.value)}>{WEEK.map((day) => <option key={day}>{day}</option>)}</select>
          <input aria-label="Course code" value={item.courseCode} onChange={(event) => update(index, 'courseCode', event.target.value.toUpperCase())} />
          <input aria-label="Section" value={item.section} placeholder="Section" onChange={(event) => update(index, 'section', event.target.value.toUpperCase())} />
          <input aria-label="Room" value={item.room} onChange={(event) => update(index, 'room', event.target.value.toUpperCase())} />
          <input aria-label="Start time" type="time" value={item.startTime} onChange={(event) => update(index, 'startTime', event.target.value)} />
          <input aria-label="End time" type="time" value={item.endTime} onChange={(event) => update(index, 'endTime', event.target.value)} />
          <button type="button" aria-label="Remove class" onClick={() => setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button>
        </article>)}</div>
        <div className="timetable-review-actions"><button type="button" onClick={() => setModal('upload')}>Use another image</button><button type="button" onClick={save}>Save My Classes</button></div>
      </>}
    </section></div>}
  </section>;
}
