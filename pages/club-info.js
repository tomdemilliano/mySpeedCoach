/**
 * pages/club-info.js
 *
 * "Mijn Club" — ledeninfopagina die clubgegevens bundelt.
 * Toont webshop-link, noodprocedure en clubdocumenten.
 *
 * Data komt uit clubs/{clubId}.clubInfo (beheerd via clubadmin.js → Algemeen tab).
 * Alleen items waarvoor showOnInfoPage = true worden getoond.
 *
 * Rules:
 *   - All DB via factories (CLAUDE.md §1)
 *   - No <form> elements (CLAUDE.md §4)
 *   - Inline CSS only (CLAUDE.md §9)
 *   - Dutch UI (CLAUDE.md §9)
 */

import { useState, useEffect } from 'react';
import {
  ClubFactory, UserMemberLinkFactory,
} from '../constants/dbSchema';
import { useAuth } from '../contexts/AuthContext';
import { RichTextViewer } from '../components/RichTextEditor';
import {
  ShoppingBag, AlertTriangle, FileText,
  ExternalLink, ChevronRight, Building2,
  Phone, Shield, BookOpen, Download,
  ChevronDown, ChevronUp, Info,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOCUMENT_ICONS = {
  reglement:  BookOpen,
  privacy:    Shield,
  other:      FileText,
};

function getDocIcon(type) {
  return DOCUMENT_ICONS[type] || FileText;
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, color, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      marginBottom: '12px',
    }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '9px',
        backgroundColor: `${color}22`, border: `1px solid ${color}44`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={15} color={color} />
      </div>
      <span style={{
        fontSize: '13px', fontWeight: '800', color: '#f1f5f9',
        textTransform: 'uppercase', letterSpacing: '0.6px',
      }}>
        {label}
      </span>
    </div>
  );
}

// ─── Webshop card ─────────────────────────────────────────────────────────────
function WebshopCard({ url, description }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '14px',
        border: '1px solid #3b82f633',
        padding: '18px 20px',
        display: 'flex', alignItems: 'center', gap: '16px',
        transition: 'border-color 0.15s',
        cursor: 'pointer',
      }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '13px',
          backgroundColor: '#3b82f622', border: '1px solid #3b82f644',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <ShoppingBag size={22} color="#60a5fa" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9', marginBottom: '3px' }}>
            Clubwebshop
          </div>
          <div style={{
            fontSize: '12px', color: '#64748b',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {description || url}
          </div>
        </div>
        <div style={{
          width: '32px', height: '32px', borderRadius: '8px',
          backgroundColor: '#3b82f611',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <ExternalLink size={14} color="#60a5fa" />
        </div>
      </div>
    </a>
  );
}

// ─── Accident card ────────────────────────────────────────────────────────────
function AccidentCard({ instructions }) {
  const [expanded, setExpanded] = useState(false);
  if (!instructions) return null;
 
  const stripTags = (html) => html.replace(/<[^>]*>/g, '');
  const plainLength = stripTags(instructions).length;
  const hasMore = plainLength > 200;
 
  return (
    <div style={{ backgroundColor: '#1e293b', borderRadius: '14px', border: '1px solid #ef444433', overflow: 'hidden' }}>
      <div style={{ backgroundColor: '#ef444411', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #ef444422' }}>
        <AlertTriangle size={16} color="#ef4444" />
        <span style={{ fontSize: '13px', fontWeight: '800', color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bij een ongeval</span>
      </div>
      <div style={{ padding: '14px 18px' }}>
        <div style={{ maxHeight: expanded || !hasMore ? 'none' : '120px', overflow: 'hidden', position: 'relative' }}>
          <RichTextViewer html={instructions} />
          {!expanded && hasMore && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40px', background: 'linear-gradient(transparent, #1e293b)' }} />
          )}
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '12px', fontWeight: '700', padding: 0, fontFamily: 'inherit' }}
          >
            {expanded ? <><ChevronUp size={13} /> Minder tonen</> : <><ChevronDown size={13} /> Volledig tonen</>}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Document card ────────────────────────────────────────────────────────────
function DocumentCard({ doc }) {
  const Icon = getDocIcon(doc.type);
  const isLink = doc.url && (doc.url.startsWith('http') || doc.url.startsWith('/'));

  const content = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '14px',
      padding: '14px 16px',
      backgroundColor: '#1e293b',
      borderRadius: '12px',
      border: '1px solid #334155',
      cursor: isLink ? 'pointer' : 'default',
      transition: 'border-color 0.15s',
    }}>
      <div style={{
        width: '40px', height: '40px', borderRadius: '10px',
        backgroundColor: '#a78bfa22', border: '1px solid #a78bfa33',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={18} color="#a78bfa" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '14px', fontWeight: '600', color: '#f1f5f9',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          marginBottom: '2px',
        }}>
          {doc.title}
        </div>
        {doc.description && (
          <div style={{
            fontSize: '11px', color: '#64748b',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {doc.description}
          </div>
        )}
      </div>
      {isLink && (
        <div style={{
          width: '28px', height: '28px', borderRadius: '7px',
          backgroundColor: '#a78bfa11',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {doc.url?.includes('download') || doc.url?.endsWith('.pdf')
            ? <Download size={13} color="#a78bfa" />
            : <ExternalLink size={13} color="#a78bfa" />
          }
        </div>
      )}
    </div>
  );

  if (isLink) {
    return (
      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ textDecoration: 'none', display: 'block' }}
      >
        {content}
      </a>
    );
  }
  return content;
}

// ─── Contact card ─────────────────────────────────────────────────────────────
function ContactCard({ club }) {
  const lines = [
    club.contactEmail && { icon: '✉️', label: 'E-mail', value: club.contactEmail, href: `mailto:${club.contactEmail}` },
    club.contactPhone && { icon: '📞', label: 'Telefoon', value: club.contactPhone, href: `tel:${club.contactPhone}` },
    (club.street || club.city) && { icon: '📍', label: 'Adres', value: [club.street, club.postalCode, club.city].filter(Boolean).join(', '), href: null },
  ].filter(Boolean);

  if (lines.length === 0) return null;

  return (
    <div style={{
      backgroundColor: '#1e293b', borderRadius: '14px',
      border: '1px solid #334155', overflow: 'hidden',
    }}>
      {lines.map((line, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'center', gap: '14px',
            padding: '13px 16px',
            borderBottom: i < lines.length - 1 ? '1px solid #0f172a' : 'none',
          }}
        >
          <span style={{ fontSize: '18px', flexShrink: 0 }}>{line.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '10px', color: '#475569', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '1px' }}>
              {line.label}
            </div>
            {line.href ? (
              <a href={line.href} style={{ fontSize: '13px', color: '#60a5fa', textDecoration: 'none', fontWeight: '500' }}>
                {line.value}
              </a>
            ) : (
              <div style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '500' }}>{line.value}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function ClubInfoPage() {
  const { uid } = useAuth();
  const [club,    setClub]    = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Resolve club via UserMemberLink ────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    const unsub = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
      const self = profiles.find(p => p.link.relationship === 'self');
      if (!self || cancelled) { setLoading(false); return; }

      const snap = await ClubFactory.getById(self.member.clubId);
      if (!cancelled) {
        setClub(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      }
    });

    return () => { cancelled = true; unsub(); };
  }, [uid]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const info      = club?.clubInfo || {};
  const shopUrl   = info.showWebshop   && info.webshopUrl   ? info.webshopUrl   : null;
  const accident  = info.showAccident  && info.accidentText ? info.accidentText : null;
  const documents = (info.documents || []).filter(d => d.showOnInfoPage && d.title);
  const hasContact = club && (club.contactEmail || club.contactPhone || club.street || club.city);

  const hasAnyContent = shopUrl || accident || documents.length > 0 || hasContact;

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={s.page}>
      <style>{css}</style>
      <div style={s.loadingWrap}>
        <div style={s.spinner} />
      </div>
    </div>
  );

  if (!club) return (
    <div style={s.page}>
      <style>{css}</style>
      <div style={s.emptyWrap}>
        <Building2 size={44} color="#334155" style={{ marginBottom: '14px' }} />
        <p style={{ color: '#64748b', fontSize: '14px', margin: 0, textAlign: 'center', maxWidth: '260px' }}>
          Je bent nog niet gekoppeld aan een club.
        </p>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      <style>{css}</style>

      {/* ── Hero header ── */}
      <div style={s.hero}>
        {club.logoUrl ? (
          <img
            src={club.logoUrl}
            alt={club.name}
            style={s.heroLogo}
          />
        ) : (
          <div style={s.heroLogoFallback}>
            <Building2 size={28} color="#3b82f6" />
          </div>
        )}
        <div>
          <h1 style={s.heroTitle}>{club.name}</h1>
          <p style={s.heroSub}>Clubinformatie</p>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={s.content}>

        {!hasAnyContent && (
          <div style={s.emptyCard}>
            <Info size={20} color="#475569" style={{ marginBottom: '10px' }} />
            <p style={{ color: '#64748b', fontSize: '13px', margin: 0, textAlign: 'center' }}>
              De clubbeheerder heeft nog geen informatie toegevoegd.
            </p>
          </div>
        )}

        {/* Webshop */}
        {shopUrl && (
          <section style={s.section}>
            <SectionHeader icon={ShoppingBag} color="#3b82f6" label="Webshop" />
            <WebshopCard url={shopUrl} description={info.webshopDescription} />
          </section>
        )}

        {/* Bij een ongeval */}
        {accident && (
          <section style={s.section}>
            <SectionHeader icon={AlertTriangle} color="#ef4444" label="Noodprocedure" />
            <AccidentCard instructions={accident} />
          </section>
        )}

        {/* Documenten */}
        {documents.length > 0 && (
          <section style={s.section}>
            <SectionHeader icon={FileText} color="#a78bfa" label="Documenten" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {documents.map((doc, i) => (
                <DocumentCard key={doc.id || i} doc={doc} />
              ))}
            </div>
          </section>
        )}

        {/* Contact */}
        {hasContact && (
          <section style={s.section}>
            <SectionHeader icon={Phone} color="#22c55e" label="Contact" />
            <ContactCard club={club} />
          </section>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = `
  * { box-sizing: border-box; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

const s = {
  page: {
    backgroundColor: '#0f172a',
    minHeight: '100vh',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
    paddingBottom: '40px',
  },
  loadingWrap: {
    minHeight: '60vh',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  spinner: {
    width: '36px', height: '36px',
    border: '3px solid #1e293b', borderTop: '3px solid #3b82f6',
    borderRadius: '50%', animation: 'spin 0.8s linear infinite',
  },
  emptyWrap: {
    minHeight: '60vh',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '24px',
  },
  emptyCard: {
    backgroundColor: '#1e293b',
    borderRadius: '14px',
    border: '1px solid #334155',
    padding: '32px 20px',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: '16px',
  },
  hero: {
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
    padding: '24px 20px',
    display: 'flex', alignItems: 'center', gap: '16px',
  },
  heroLogo: {
    width: '56px', height: '56px', borderRadius: '14px',
    objectFit: 'contain', flexShrink: 0,
    backgroundColor: '#0f172a', border: '1px solid #334155',
    padding: '4px',
  },
  heroLogoFallback: {
    width: '56px', height: '56px', borderRadius: '14px',
    backgroundColor: '#3b82f611', border: '1px solid #3b82f633',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  heroTitle: {
    margin: '0 0 3px', fontSize: '20px', fontWeight: '800', color: '#f1f5f9',
  },
  heroSub: {
    margin: 0, fontSize: '12px', color: '#475569', fontWeight: '500',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  content: {
    maxWidth: '680px',
    margin: '0 auto',
    padding: '24px 16px',
    animation: 'fadeUp 0.35s ease-out',
  },
  section: {
    marginBottom: '28px',
  },
};
