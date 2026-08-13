import { useRef, useState } from 'react';
import { CalendarDays, Camera, ChevronDown, Pencil, Trash2, Upload, X } from 'lucide-react';
import {
  extractPersonalTimetable,
  loadPersonalTimetable,
  savePersonalTimetable,
  TIMETABLE_DAYS,
  type PersonalClass,
  type TimetableDay,
} from '../lib/personalTimetable';

interface Props {
  classes: PersonalClass[];
  onChange: (classes: PersonalClass[]) => void;
}

export default function PersonalTimetable({ classes, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'classes' | 'import' | 'review'>(classes.length ? 'classes' : 'import');
  const [day, setDay] = useState<TimetableDay>(() => {
    const today = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'Asia/Kolkata' }).format(new Date());
    return TIMETABLE_DAYS.includes(today as TimetableDay) ? today as TimetableDay : 'Monday';
  });
  const [draft, setDraft] = useState<PersonalClass[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState('');

  const openPanel = () => {
    setMode(classes.length ? 'classes' : 'import');
    setOpen(true);
    setError('');
  };

  const chooseFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError('');
    setProgress(0);
    try {
      const extracted = await extractPersonalTimetable(file, (value, label) => {
        setProgress(value);
        setProgressLabel(label);
      });
      if (!extracted.length) {
        throw new Error('No complete classes were found. Upload the original full ERP weekly timetable screenshot with the day headings, time labels and class tiles visible.');
      }
      setDraft(extracted);
      setMode('review');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The timetable could not be read.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const updateDraft = (index: number, key: keyof PersonalClass, value: string) => {
    setDraft((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };

  const save = () => {
    const valid = draft.filter((item) => item.courseCode && item.room && item.startTime && item.endTime);
    savePersonalTimetable(valid);
    onChange(loadPersonalTimetable());
    setMode('classes');
  };

  const visible = classes.filter((item) => item.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime));

  return <>
    <button type="button" className={`personal-timetable-launch${classes.length ? ' has-classes' : ''}`} onClick={openPanel}>
      <span className="personal-timetable-launch-icon">{classes.length ? <CalendarDays /> : <Upload />}</span>
      <span><strong>{classes.length ? 'My Classes' : 'Import My Timetable'}</strong><small>{classes.length ? 'See your course, room and time for every day' : 'Upload your ERP weekly timetable screenshot'}</small></span>
      <ChevronDown aria-hidden="true" />
    </button>

    {open && <div className="personal-timetable-layer">
      <button className="personal-timetable-backdrop" aria-label="Close" onClick={() => !busy && setOpen(false)} />
      <section className="personal-timetable-modal" role="dialog" aria-modal="true" aria-labelledby="personal-timetable-title">
        <button className="personal-timetable-close" type="button" onClick={() => !busy && setOpen(false)} aria-label="Close"><X /></button>

        {mode === 'import' && <>
          <p className="personal-timetable-kicker">Stored only on this device</p>
          <h2 id="personal-timetable-title">Import My Timetable</h2>
          <p className="personal-timetable-copy">Upload the original full weekly timetable screenshot from ERP. Five-day and six-day timetables are both supported, including exports without Saturday.</p>
          <button className="personal-timetable-upload" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <><span className="personal-timetable-spinner" /><strong>{progressLabel || 'Preparing image…'}</strong><span>{progress}%</span></> : <><Camera /><strong>Choose timetable screenshot</strong><span>PNG, JPG or WebP · full weekly view</span></>}
          </button>
          {busy && <div className="personal-timetable-progress"><span style={{ width: `${progress}%` }} /></div>}
          {error && <p className="personal-timetable-error">{error}</p>}
          <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseFile(event.target.files?.[0])} />
        </>}

        {mode === 'review' && <>
          <p className="personal-timetable-kicker">Check before saving</p>
          <h2 id="personal-timetable-title">Review {draft.length} detected classes</h2>
          <p className="personal-timetable-copy">Nothing is saved yet. Correct any OCR mistake below, then save your verified timetable.</p>
          <div className="personal-timetable-review">
            {draft.map((item, index) => <article key={`${item.id}-${index}`}>
              <select value={item.day} onChange={(event) => updateDraft(index, 'day', event.target.value)}>{TIMETABLE_DAYS.map((name) => <option key={name}>{name}</option>)}</select>
              <input aria-label="Course code" value={item.courseCode} onChange={(event) => updateDraft(index, 'courseCode', event.target.value.toUpperCase())} />
              <input aria-label="Section" value={item.section} onChange={(event) => updateDraft(index, 'section', event.target.value.toUpperCase())} />
              <input aria-label="Room" value={item.room} onChange={(event) => updateDraft(index, 'room', event.target.value.toUpperCase())} />
              <input aria-label="Start time" type="time" value={item.startTime} onChange={(event) => updateDraft(index, 'startTime', event.target.value)} />
              <input aria-label="End time" type="time" value={item.endTime} onChange={(event) => updateDraft(index, 'endTime', event.target.value)} />
              <button type="button" aria-label="Remove class" onClick={() => setDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button>
            </article>)}
          </div>
          <div className="personal-timetable-actions"><button type="button" onClick={() => setMode('import')}>Try another image</button><button type="button" onClick={save}>Save My Classes</button></div>
        </>}

        {mode === 'classes' && <>
          <p className="personal-timetable-kicker">Your private timetable</p>
          <h2 id="personal-timetable-title">My Classes</h2>
          <select className="personal-timetable-day" value={day} onChange={(event) => setDay(event.target.value as TimetableDay)}>{TIMETABLE_DAYS.map((name) => <option key={name}>{name}</option>)}</select>
          <div className="personal-class-list">{visible.length ? visible.map((item) => <article key={item.id}>
            <time>{item.startTime}<span>to {item.endTime}</span></time>
            <div><strong>{item.courseCode} · {item.section}</strong><span>{item.classType}</span></div>
            <button type="button" onClick={() => { setOpen(false); window.history.pushState({}, '', `/room/${item.room}`); window.dispatchEvent(new PopStateEvent('popstate')); }}><small>ROOM</small>{item.room}</button>
          </article>) : <div className="personal-class-empty">No classes saved for {day}.</div>}</div>
          <button className="personal-timetable-replace" type="button" onClick={() => setMode('import')}><Pencil /> Review or replace timetable</button>
        </>}
      </section>
    </div>}
  </>;
}
