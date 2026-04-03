/**
 * components/RichTextEditor.js
 *
 * Lichtgewicht rich text editor op basis van contentEditable + execCommand.
 * Geen externe dependencies — werkt volledig met inline CSS (CLAUDE.md §9).
 *
 * Ondersteunde opmaak:
 *   Bold · Italic · Underline · Ordered list · Unordered list · Hyperlink · E-mailadres (mailto:)
 *
 * Props:
 *   value      : string  — HTML string (geserialiseerde inhoud)
 *   onChange   : (html: string) => void
 *   placeholder: string  — getoond als editor leeg is
 *   minHeight  : string  — CSS min-height van het bewerkbare gebied (default '120px')
 *   disabled   : boolean
 *
 * Gebruik:
 *   import RichTextEditor from '../components/RichTextEditor';
 *
 *   <RichTextEditor
 *     value={clubInfo.accidentText}
 *     onChange={html => setClubInfo(prev => ({ ...prev, accidentText: html }))}
 *     placeholder="Stap 1: Blijf kalm…"
 *   />
 *
 * Om de opgeslagen HTML te tonen aan leden, gebruik RichTextViewer (zie export onderaan).
 */

import { useRef, useEffect, useState, useCallback } from 'react';

// ─── Toolbar button ───────────────────────────────────────────────────────────
function ToolbarBtn({ title, active, onClick, children }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => {
        e.preventDefault(); // Voorkom dat de editor focus verliest
        onClick();
      }}
      style={{
        width: '30px', height: '30px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '6px', border: 'none', cursor: 'pointer',
        backgroundColor: active ? '#3b82f633' : 'transparent',
        color: active ? '#60a5fa' : '#94a3b8',
        fontSize: '13px', fontWeight: '700',
        transition: 'background-color 0.12s, color 0.12s',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ─── Toolbar divider ──────────────────────────────────────────────────────────
function ToolbarDivider() {
  return <div style={{ width: '1px', height: '20px', backgroundColor: '#334155', flexShrink: 0, margin: '0 2px' }} />;
}

// ─── Link modal ───────────────────────────────────────────────────────────────
function LinkModal({ onConfirm, onClose }) {
  const [tab,   setTab]   = useState('url');   // 'url' | 'email'
  const [url,   setUrl]   = useState('');
  const [email, setEmail] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Wanneer van tab gewisseld wordt, focus het nieuwe input
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [tab]);

  const handleConfirm = () => {
    if (tab === 'url') {
      const trimmed = url.trim();
      if (!trimmed) return;
      const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      onConfirm(href, '_blank');
    } else {
      const trimmed = email.trim();
      if (!trimmed) return;
      // Verwijder eventueel al ingeplakt mailto: prefix
      const address = trimmed.replace(/^mailto:/i, '');
      onConfirm(`mailto:${address}`, null);
    }
  };

  const isValid = tab === 'url' ? url.trim().length > 0 : email.trim().length > 0;

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600, padding: '16px' }}
      onMouseDown={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #334155', padding: '20px', width: '100%', maxWidth: '380px' }}>

        {/* Tab switcher */}
        <div style={{ display: 'flex', backgroundColor: '#0f172a', borderRadius: '8px', padding: '3px', border: '1px solid #334155', marginBottom: '16px' }}>
          {[
            { key: 'url',   label: '🔗 Weblink' },
            { key: 'email', label: '✉️ E-mailadres' },
          ].map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '7px 10px', borderRadius: '5px', border: 'none',
                backgroundColor: tab === t.key ? '#1e293b' : 'transparent',
                color: tab === t.key ? '#f1f5f9' : '#64748b',
                fontSize: '12px', fontWeight: tab === t.key ? '700' : '500',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'url' && (
          <>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              URL
            </label>
            <input
              ref={inputRef}
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); } if (e.key === 'Escape') onClose(); }}
              placeholder="https://www.voorbeeld.be"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '14px' }}
            />
          </>
        )}

        {tab === 'email' && (
          <>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' }}>
              E-mailadres
            </label>
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleConfirm(); } if (e.key === 'Escape') onClose(); }}
              placeholder="coach@mijnclub.be"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '14px', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '6px' }}
            />
            <div style={{ fontSize: '11px', color: '#475569', marginBottom: '14px' }}>
              Opent het e-mailprogramma van de gebruiker bij klikken.
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid}
            style={{ flex: 1, padding: '9px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '700', fontSize: '13px', cursor: isValid ? 'pointer' : 'default', fontFamily: 'inherit', opacity: isValid ? 1 : 0.45 }}
          >
            Invoegen
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '9px 14px', backgroundColor: 'transparent', border: '1px solid #334155', borderRadius: '8px', color: '#94a3b8', fontWeight: '600', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Annuleren
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────
export default function RichTextEditor({
  value = '',
  onChange,
  placeholder = 'Typ hier…',
  minHeight = '120px',
  disabled = false,
}) {
  const editorRef    = useRef(null);
  const isInternalChange = useRef(false);
  const savedRange   = useRef(null);
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false, orderedList: false, unorderedList: false });
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // ── Initieel vullen ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value) {
      isInternalChange.current = true;
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  // ── Actieve formats bijhouden ──────────────────────────────────────────────
  const updateFormats = useCallback(() => {
    setActiveFormats({
      bold:          document.queryCommandState('bold'),
      italic:        document.queryCommandState('italic'),
      underline:     document.queryCommandState('underline'),
      orderedList:   document.queryCommandState('insertOrderedList'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
    });
  }, []);

  // ── Selectie opslaan vóór link-modal opent ─────────────────────────────────
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    if (!savedRange.current) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange.current);
  };

  // ── execCommand wrapper ────────────────────────────────────────────────────
  const exec = (command, value = null) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    updateFormats();
    notifyChange();
  };

  // ── onChange doorsturen ────────────────────────────────────────────────────
  const notifyChange = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    // Lege editor — stuur lege string
    const isEmpty = html === '' || html === '<br>' || html === '<div><br></div>';
    onChange?.(isEmpty ? '' : html);
  };

  // ── Link invoegen ──────────────────────────────────────────────────────────
  const handleLinkClick = () => {
    saveSelection();
    setShowLinkModal(true);
  };

  const handleLinkConfirm = (href, target) => {
    setShowLinkModal(false);
    restoreSelection();
    editorRef.current?.focus();

    const isMailto = href.startsWith('mailto:');
    const targetAttr = target ? `target="${target}" rel="noopener noreferrer"` : '';
    // Leesbare weergavetekst: voor mailto toon het adres, voor URL toon de URL
    const displayText = isMailto ? href.replace('mailto:', '') : href;

    const sel = window.getSelection();
    if (sel && sel.toString().trim() === '') {
      // Geen selectie — voeg link in met weergavetekst
      document.execCommand('insertHTML', false,
        `<a href="${href}" ${targetAttr} style="color:#60a5fa;text-decoration:underline">${displayText}</a>`
      );
    } else {
      // Selectie aanwezig — wrap de selectie in een link
      document.execCommand('createLink', false, href);
      const links = editorRef.current?.querySelectorAll('a');
      links?.forEach(a => {
        const ah = a.getAttribute('href');
        if (ah === href) {
          a.style.color = '#60a5fa';
          a.style.textDecoration = 'underline';
          if (target) { a.target = target; a.rel = 'noopener noreferrer'; }
        }
      });
    }
    notifyChange();
  };

  // ── Placeholder ────────────────────────────────────────────────────────────
  const isEmpty = !value || value === '' || value === '<br>';

  return (
    <>
      <div style={{
        borderRadius: '10px',
        border: `1px solid ${isFocused ? '#3b82f6' : '#334155'}`,
        backgroundColor: '#0f172a',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
        opacity: disabled ? 0.6 : 1,
      }}>
        {/* ── Toolbar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '2px',
          padding: '6px 8px',
          backgroundColor: '#1e293b',
          borderBottom: '1px solid #334155',
          flexWrap: 'wrap',
        }}>
          <ToolbarBtn title="Vet (Ctrl+B)" active={activeFormats.bold} onClick={() => exec('bold')}>
            <strong>B</strong>
          </ToolbarBtn>
          <ToolbarBtn title="Cursief (Ctrl+I)" active={activeFormats.italic} onClick={() => exec('italic')}>
            <em style={{ fontFamily: 'Georgia, serif' }}>I</em>
          </ToolbarBtn>
          <ToolbarBtn title="Onderlijnen (Ctrl+U)" active={activeFormats.underline} onClick={() => exec('underline')}>
            <span style={{ textDecoration: 'underline' }}>U</span>
          </ToolbarBtn>

          <ToolbarDivider />

          <ToolbarBtn title="Genummerde lijst" active={activeFormats.orderedList} onClick={() => exec('insertOrderedList')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <text x="0" y="5"  fontSize="5" fill="currentColor">1.</text>
              <text x="0" y="10" fontSize="5" fill="currentColor">2.</text>
              <line x1="5" y1="3"  x2="13" y2="3"  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="5" y1="8"  x2="13" y2="8"  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="5" y1="13" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </ToolbarBtn>
          <ToolbarBtn title="Opsommingstekens" active={activeFormats.unorderedList} onClick={() => exec('insertUnorderedList')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="2" cy="3"  r="1.5" fill="currentColor"/>
              <circle cx="2" cy="8"  r="1.5" fill="currentColor"/>
              <circle cx="2" cy="13" r="1.5" fill="currentColor"/>
              <line x1="5" y1="3"  x2="13" y2="3"  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="5" y1="8"  x2="13" y2="8"  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="5" y1="13" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </ToolbarBtn>

          <ToolbarDivider />

          <ToolbarBtn title="Hyperlink invoegen" active={false} onClick={handleLinkClick}>
            🔗
          </ToolbarBtn>
        </div>

        {/* ── Bewerkbaar gebied ── */}
        <div style={{ position: 'relative' }}>
          {isEmpty && !isFocused && (
            <div style={{
              position: 'absolute', top: '10px', left: '12px',
              color: '#334155', fontSize: '14px', pointerEvents: 'none',
              lineHeight: 1.6, userSelect: 'none',
            }}>
              {placeholder}
            </div>
          )}
          <div
            ref={editorRef}
            contentEditable={!disabled}
            suppressContentEditableWarning
            onInput={() => { updateFormats(); notifyChange(); }}
            onKeyUp={updateFormats}
            onMouseUp={updateFormats}
            onFocus={() => { setIsFocused(true); updateFormats(); }}
            onBlur={() => setIsFocused(false)}
            onPaste={e => {
              // Plak altijd als plain text om externe opmaak te vermijden
              e.preventDefault();
              const text = e.clipboardData.getData('text/plain');
              document.execCommand('insertText', false, text);
            }}
            style={{
              minHeight,
              padding: '10px 12px',
              color: '#f1f5f9',
              fontSize: '14px',
              lineHeight: '1.7',
              outline: 'none',
              fontFamily: 'system-ui, sans-serif',
              // Lijst-styling
              '--list-color': '#94a3b8',
            }}
          />
        </div>
      </div>

      {/* Inline CSS voor lists en links in de editor */}
      <style>{`
        [contenteditable] ul { list-style: disc; padding-left: 20px; margin: 4px 0; color: #f1f5f9; }
        [contenteditable] ol { list-style: decimal; padding-left: 20px; margin: 4px 0; color: #f1f5f9; }
        [contenteditable] li { margin: 2px 0; }
        [contenteditable] a  { color: #60a5fa; text-decoration: underline; cursor: pointer; }
      `}</style>

      {showLinkModal && (
        <LinkModal
          onConfirm={handleLinkConfirm}
          onClose={() => setShowLinkModal(false)}
        />
      )}
    </>
  );
}

// ─── RichTextViewer ───────────────────────────────────────────────────────────
/**
 * Read-only weergave van de opgeslagen HTML.
 * Gebruik dit in club-info.js in plaats van <p style={{ whiteSpace: 'pre-wrap' }}>.
 *
 * Props:
 *   html  : string  — de opgeslagen HTML uit de editor
 *   style : object  — extra inline stijlen voor de wrapper div
 */
export function RichTextViewer({ html, style = {} }) {
  if (!html) return null;
  return (
    <>
      <div
        dangerouslySetInnerHTML={{ __html: html }}
        style={{
          fontSize: '14px',
          color: '#94a3b8',
          lineHeight: 1.7,
          ...style,
        }}
      />
      <style>{`
        .rte-viewer ul { list-style: disc; padding-left: 20px; margin: 6px 0; }
        .rte-viewer ol { list-style: decimal; padding-left: 20px; margin: 6px 0; }
        .rte-viewer li { margin: 3px 0; }
        .rte-viewer a  { color: #60a5fa; text-decoration: underline; }
        .rte-viewer strong { color: #f1f5f9; }
        .rte-viewer em { font-style: italic; }
      `}</style>
    </>
  );
}
