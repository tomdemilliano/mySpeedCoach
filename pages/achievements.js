import { useState, useEffect } from 'react';
import { BadgeFactory, ClubMemberFactory, UserMemberLinkFactory, UserFactory } from '../constants/dbSchema';
import { useDisciplines } from '../hooks/useDisciplines';
import {
  Trophy, Target, Medal, Award, Check, ChevronDown, ChevronUp,
  Zap, Plus, Trash2, Star, Timer
} from 'lucide-react';
import { db } from '../firebaseConfig';
import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore';

const COOKIE_KEY = 'msc_uid';
const getCookie = () => {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return match ? match[1] : null;
};

const SESSION_TYPES = ['Training', 'Wedstrijd'];

const CATEGORY_CONFIG = {
  speed:       { label: 'Snelheid',     color: '#f97316', emoji: '⚡' },
  milestone:   { label: 'Mijlpalen',    color: '#3b82f6', emoji: '🎯' },
  consistency: { label: 'Consistentie', color: '#22c55e', emoji: '🗓️' },
  skill:       { label: 'Vaardigheden', color: '#a78bfa', emoji: '🌟' },
};

function TabBtn({ active, onClick, icon: Icon, label, color }) {
  return (
    <button onClick={onClick} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '12px 8px', background: 'none', border: 'none', borderBottom: `2px solid ${active ? color : 'transparent'}`, cursor: 'pointer' }}>
      <Icon size={20} color={active ? color : '#475569'} />
      <span style={{ fontSize: '12px', fontWeight: active ? '700' : '500', color: active ? color : '#64748b' }}>{label}</span>
    </button>
  );
}

function BadgeItem({ badge, earned, earnedDate, awardedByName, note }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const catColor = CATEGORY_CONFIG[badge.badgeCategory || badge.category]?.color || '#334155';
  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer' }} onClick={() => setShowTooltip(v => !v)}>
      <div style={{ width: '64px', height: '64px', borderRadius: '50%', backgroundColor: earned ? '#1e293b' : '#0f172a', border: earned ? `2px solid ${catColor}` : '2px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', opacity: earned ? 1 : 0.3, filter: earned ? 'none' : 'grayscale(100%)', overflow: 'hidden' }}>
        {badge.badgeImageUrl || badge.imageUrl ? (
          <img src={badge.badgeImageUrl || badge.imageUrl} alt={badge.badgeName || badge.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        ) : (
          <span>{badge.badgeEmoji || badge.emoji || '🏅'}</span>
        )}
      </div>
      <div style={{ fontSize: '10px', color: earned ? '#94a3b8' : '#334155', textAlign: 'center', maxWidth: '64px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{badge.badgeName || badge.name}</div>
      {showTooltip && (
        <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '10px 12px', zIndex: 100, minWidth: '160px', maxWidth: '200px', marginBottom: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          <div style={{ fontWeight: '700', fontSize: '13px', color: '#f1f5f9', marginBottom: '4px' }}>{badge.badgeName || badge.name}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px', lineHeight: 1.5 }}>{badge.badgeDescription || badge.description || ''}</div>
          {earned ? <div style={{ fontSize: '10px', color: '#22c55e' }}>✓ Verdiend {earnedDate ? `op ${earnedDate}` : ''}</div> : <div style={{ fontSize: '10px', color: '#475569' }}>Nog niet verdiend</div>}
        </div>
      )}
    </div>
  );
}

// ─── Badges tab ───────────────────────────────────────────────────────────────
function BadgesTab({ memberContext }) {
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [allBadges, setAllBadges] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');

  useEffect(() => {
    if (!memberContext) return;
    const { clubId, memberId } = memberContext;
    const u1 = BadgeFactory.getEarned(clubId, memberId, setEarnedBadges);
    const u2 = BadgeFactory.getGlobal(setAllBadges);
    return () => { u1(); u2(); };
  }, [memberContext]);

  const categories = ['all', ...Object.keys(CATEGORY_CONFIG)];
  const filtered = activeCategory === 'all' ? allBadges : allBadges.filter(b => b.category === activeCategory);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
        <div style={css.statCard}><div style={{ fontSize: '28px', fontWeight: '900', color: '#f59e0b', lineHeight: 1 }}>{earnedBadges.length}</div><div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Verdiend</div></div>
        <div style={css.statCard}><div style={{ fontSize: '28px', fontWeight: '900', color: '#475569', lineHeight: 1 }}>{allBadges.length - earnedBadges.length}</div><div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Te verdienen</div></div>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)} style={{ padding: '4px 10px', borderRadius: '14px', border: '1px solid', fontSize: '11px', fontWeight: '600', cursor: 'pointer', backgroundColor: activeCategory === cat ? (CATEGORY_CONFIG[cat]?.color || '#3b82f6') + '22' : 'transparent', borderColor: activeCategory === cat ? (CATEGORY_CONFIG[cat]?.color || '#3b82f6') : '#334155', color: activeCategory === cat ? (CATEGORY_CONFIG[cat]?.color || '#3b82f6') : '#64748b' }}>
            {cat === 'all' ? 'Alle' : `${CATEGORY_CONFIG[cat]?.emoji} ${CATEGORY_CONFIG[cat]?.label}`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#475569', fontSize: '13px' }}>Geen badges in deze categorie.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          {filtered.map(badge => {
            const earned = earnedBadges.find(e => e.badgeId === badge.id);
            return <BadgeItem key={badge.id} badge={badge} earned={!!earned} earnedDate={earned?.earnedAt?.seconds ? new Date(earned.earnedAt.seconds * 1000).toLocaleDateString('nl-BE') : null} awardedByName={earned?.awardedByName} note={earned?.note} />;
          })}
        </div>
      )}

      {earnedBadges.length > 0 && (
        <div style={{ marginTop: '24px', borderTop: '1px solid #1e293b', paddingTop: '16px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Recent verdiend</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {earnedBadges.slice(0, 5).map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#1e293b', borderRadius: '10px', padding: '10px 14px', border: '1px solid #334155' }}>
                <div style={{ fontSize: '24px', width: '32px', textAlign: 'center', flexShrink: 0 }}>
                  {b.badgeImageUrl ? <img src={b.badgeImageUrl} alt={b.badgeName} style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} /> : b.badgeEmoji || '🏅'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', fontSize: '13px', color: '#f1f5f9' }}>{b.badgeName}</div>
                  <div style={{ fontSize: '10px', color: '#475569' }}>
                    {b.awardedByName && b.awardedByName !== 'Systeem' ? `Door: ${b.awardedByName}` : 'Automatisch'}
                    {b.earnedAt?.seconds ? ` · ${new Date(b.earnedAt.seconds * 1000).toLocaleDateString('nl-BE')}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Records tab ──────────────────────────────────────────────────────────────
function RecordsTab({ memberContext }) {
  const [records, setRecords] = useState([]);
  const { disciplines } = useDisciplines();

  useEffect(() => {
    if (!memberContext || disciplines.length === 0) return;
    const { clubId, memberId } = memberContext;
    const unsubs = [];

    disciplines.forEach(disc => SESSION_TYPES.forEach(st => {
      const u = ClubMemberFactory.subscribeToRecords(clubId, memberId, disc.id, st, (rec) => {
        if (rec) {
          setRecords(prev => {
            const filtered = prev.filter(r => !(r.discipline === disc.id && r.sessionType === st));
            return [...filtered, { ...rec, discipline: disc.id, disciplineName: disc.name, sessionType: st }];
          });
        } else {
          setRecords(prev => prev.filter(r => !(r.discipline === disc.id && r.sessionType === st)));
        }
      });
      unsubs.push(u);
    }));

    return () => unsubs.forEach(u => u && u());
  }, [memberContext, disciplines]);

  const bestOverall = records.reduce((max, r) => r.score > (max?.score || 0) ? r : max, null);

  return (
    <div>
      {bestOverall && (
        <div style={{ backgroundColor: '#1e293b', borderRadius: '14px', padding: '20px', border: '1px solid #facc1533', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', backgroundColor: '#facc1522', border: '1px solid #facc1544', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Trophy size={24} color="#facc15" />
          </div>
          <div>
            <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Beste persoonlijk record</div>
            <div style={{ fontSize: '32px', fontWeight: '900', color: '#facc15', lineHeight: 1 }}>{bestOverall.score}<span style={{ fontSize: '14px', color: '#94a3b8', fontWeight: '400', marginLeft: '6px' }}>stappen</span></div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{bestOverall.disciplineName || bestOverall.discipline} · {bestOverall.sessionType}</div>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <div style={css.emptyState}><Trophy size={36} color="#334155" /><p style={{ color: '#475569', fontSize: '14px', margin: '12px 0 0' }}>Nog geen records</p></div>
      ) : (
        <div>
          {disciplines.map(disc => {
            const discRecords = records.filter(r => r.discipline === disc.id);
            if (discRecords.length === 0) return null;
            return (
              <div key={disc.id} style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ padding: '1px 5px', borderRadius: '3px', fontSize: '9px', backgroundColor: disc.ropeType === 'SR' ? '#3b82f622' : '#a78bfa22', color: disc.ropeType === 'SR' ? '#60a5fa' : '#a78bfa', border: `1px solid ${disc.ropeType === 'SR' ? '#3b82f644' : '#a78bfa44'}` }}>{disc.ropeType}</span>
                  {disc.name}
                  {disc.durationSeconds && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: '#475569' }}>
                      <Timer size={9} />
                      {disc.durationSeconds < 60 ? `${disc.durationSeconds}s` : `${disc.durationSeconds / 60}min`}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {discRecords.map(rec => (
                    <div key={rec.id} style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '12px 14px', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', backgroundColor: rec.sessionType === 'Wedstrijd' ? '#ef444422' : '#3b82f622', color: rec.sessionType === 'Wedstrijd' ? '#ef4444' : '#60a5fa', border: `1px solid ${rec.sessionType === 'Wedstrijd' ? '#ef444440' : '#3b82f640'}` }}>{rec.sessionType}</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}><span style={{ fontSize: '22px', fontWeight: '900', color: '#facc15' }}>{rec.score}</span><span style={{ fontSize: '11px', color: '#64748b' }}>stappen</span></div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Goals tab ────────────────────────────────────────────────────────────────
function GoalsTab({ memberContext }) {
  const [goals, setGoals] = useState([]);
  const [records, setRecords] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ disciplineId: '', targetScore: '', targetDate: '' });
  const { disciplines } = useDisciplines();

  useEffect(() => {
    if (!memberContext || disciplines.length === 0) return;
    const { clubId, memberId } = memberContext;
    const unsub = ClubMemberFactory.getGoals(clubId, memberId, setGoals);
    const unsubs2 = [];
    disciplines.forEach(disc => SESSION_TYPES.forEach(st => {
      const u = ClubMemberFactory.subscribeToRecords(clubId, memberId, disc.id, st, (rec) => {
        if (rec) {
          setRecords(prev => {
            const f = prev.filter(r => !(r.discipline === disc.id && r.sessionType === st));
            return [...f, { ...rec, discipline: disc.id, sessionType: st }];
          });
        }
      });
      unsubs2.push(u);
    }));
    return () => { unsub(); unsubs2.forEach(u => u && u()); };
  }, [memberContext, disciplines]);

  // Set default discipline when loaded
  useEffect(() => {
    if (disciplines.length > 0 && !form.disciplineId) {
      setForm(f => ({ ...f, disciplineId: disciplines[0].id }));
    }
  }, [disciplines]);

  const handleAdd = async () => {
    if (!form.targetScore || !memberContext || !form.disciplineId) return;
    const { clubId, memberId } = memberContext;
    await addDoc(collection(db, `clubs/${clubId}/members/${memberId}/goals`), {
      discipline: form.disciplineId,
      targetScore: parseInt(form.targetScore),
      targetDate: form.targetDate ? new Date(form.targetDate) : null,
      achievedAt: null,
    });
    setForm({ disciplineId: disciplines[0]?.id || '', targetScore: '', targetDate: '' });
    setShowModal(false);
  };

  const handleDelete = async (goalId) => {
    if (!window.confirm('Doel verwijderen?') || !memberContext) return;
    const { clubId, memberId } = memberContext;
    await deleteDoc(doc(db, `clubs/${clubId}/members/${memberId}/goals`, goalId));
  };

  const getBestRecord = (disciplineId) =>
    records.filter(r => r.discipline === disciplineId).reduce((best, r) => r.score > (best?.score || 0) ? r : best, null);

  const getDiscName = (disciplineId) => {
    const disc = disciplines.find(d => d.id === disciplineId);
    return disc?.name || disciplineId;
  };

  const activeGoals   = goals.filter(g => !g.achievedAt);
  const achievedGoals = goals.filter(g => !!g.achievedAt);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', color: '#64748b' }}>{activeGoals.length} actief · {achievedGoals.length} bereikt</div>
        <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: '#22c55e22', border: '1px solid #22c55e44', borderRadius: '8px', color: '#22c55e', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          <Plus size={14} /> Nieuw doel
        </button>
      </div>

      {goals.length === 0 ? (
        <div style={css.emptyState}><Target size={36} color="#334155" /><p style={{ color: '#475569', fontSize: '14px', margin: '12px 0 0' }}>Geen doelen</p></div>
      ) : (
        <div>
          {activeGoals.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Actief</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {activeGoals.map(g => {
                  const best = getBestRecord(g.discipline);
                  const progress = best ? Math.min(100, Math.round((best.score / g.targetScore) * 100)) : 0;
                  return (
                    <div key={g.id} style={{ backgroundColor: '#1e293b', borderRadius: '12px', padding: '14px', border: '1px solid #334155' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9' }}>{getDiscName(g.discipline)} — {g.targetScore} stappen</div>
                          {g.targetDate && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Deadline: {new Date(g.targetDate?.seconds ? g.targetDate.seconds * 1000 : g.targetDate).toLocaleDateString('nl-BE')}</div>}
                        </div>
                        <button onClick={() => handleDelete(g.id)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '4px' }}><Trash2 size={14} /></button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ flex: 1, height: '6px', backgroundColor: '#0f172a', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${progress}%`, backgroundColor: progress >= 100 ? '#22c55e' : '#3b82f6', borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: progress >= 100 ? '#22c55e' : '#64748b', minWidth: '36px', textAlign: 'right' }}>{progress}%</span>
                      </div>
                      {best && <div style={{ fontSize: '11px', color: '#475569', marginTop: '6px' }}>Huidig beste: <strong style={{ color: '#94a3b8' }}>{best.score}</strong> stappen</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {achievedGoals.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Bereikt 🎉</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {achievedGoals.map(g => (
                  <div key={g.id} style={{ backgroundColor: '#1e293b', borderRadius: '10px', padding: '12px 14px', border: '1px solid #22c55e33', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#22c55e22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Check size={14} color="#22c55e" /></div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#22c55e' }}>{getDiscName(g.discipline)} — {g.targetScore} stappen</div>
                      {g.achievedAt?.seconds && <div style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>Bereikt op {new Date(g.achievedAt.seconds * 1000).toLocaleDateString('nl-BE')}</div>}
                    </div>
                    <button onClick={() => handleDelete(g.id)} style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', padding: '4px' }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div style={css.modalOverlay}>
          <div style={css.modal}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '16px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}><Target size={18} color="#22c55e" /> Doel toevoegen</h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>✕</button>
            </div>
            <label style={css.label}>Onderdeel</label>
            <select style={css.select} value={form.disciplineId} onChange={e => setForm({ ...form, disciplineId: e.target.value })}>
              {disciplines.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <label style={{ ...css.label, marginTop: '14px' }}>Doelstelling (stappen)</label>
            <input style={css.input} type="number" placeholder="bijv. 150" value={form.targetScore} onChange={e => setForm({ ...form, targetScore: e.target.value })} />
            <label style={{ ...css.label, marginTop: '14px' }}>Deadline (optioneel)</label>
            <input style={css.input} type="date" value={form.targetDate} onChange={e => setForm({ ...form, targetDate: e.target.value })} />
            <button onClick={handleAdd} style={{ width: '100%', padding: '13px', backgroundColor: '#22c55e', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '700', fontSize: '15px', cursor: 'pointer', marginTop: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Plus size={16} /> Doel toevoegen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════
export default function AchievementsPage() {
  const [activeTab, setActiveTab] = useState('badges');
  const [memberContext, setMemberContext] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = getCookie();
    if (!uid) { setLoading(false); return; }
    const unsub = UserMemberLinkFactory.getForUser(uid, (profiles) => {
      const selfProfile = profiles.find(p => p.link.relationship === 'self');
      setMemberContext(selfProfile ? { clubId: selfProfile.member.clubId, memberId: selfProfile.member.id } : null);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '36px', height: '36px', border: '3px solid #1e293b', borderTop: '3px solid #f59e0b', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!memberContext) {
    return (
      <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
        <Medal size={40} color="#334155" />
        <p style={{ color: '#64748b', fontSize: '14px' }}>Log in en word lid van een club om je prestaties te bekijken.</p>
        <a href="/" style={{ padding: '10px 20px', backgroundColor: '#3b82f6', color: 'white', borderRadius: '8px', textDecoration: 'none', fontWeight: '600', fontSize: '14px' }}>Naar profiel</a>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' }}>
      <style>{pageCSS}</style>

      <header style={{ padding: '12px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          <div style={{ fontWeight: '800', fontSize: '16px', color: '#f1f5f9' }}>Prestaties</div>
          <div style={{ fontSize: '11px', color: '#475569' }}>Badges · Records · Doelen</div>
        </div>
      </header>

      <div style={{ backgroundColor: '#1e293b', borderBottom: '1px solid #334155', position: 'sticky', top: '52px', zIndex: 40 }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex' }}>
          <TabBtn active={activeTab === 'badges'} onClick={() => setActiveTab('badges')} icon={Medal}  label="Badges"  color="#f59e0b" />
          <TabBtn active={activeTab === 'records'} onClick={() => setActiveTab('records')} icon={Trophy} label="Records" color="#facc15" />
          <TabBtn active={activeTab === 'goals'} onClick={() => setActiveTab('goals')} icon={Target} label="Doelen"  color="#22c55e" />
        </div>
      </div>

      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '20px 16px 40px' }}>
        {activeTab === 'badges'  && <BadgesTab  memberContext={memberContext} />}
        {activeTab === 'records' && <RecordsTab memberContext={memberContext} />}
        {activeTab === 'goals'   && <GoalsTab   memberContext={memberContext} />}
      </div>
    </div>
  );
}

const pageCSS = `* { box-sizing: border-box; } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;

const css = {
  statCard: { backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px', border: '1px solid #334155', textAlign: 'center' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', textAlign: 'center' },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 },
  modal: { backgroundColor: '#1e293b', borderRadius: '20px 20px 0 0', padding: '24px', width: '100%', maxWidth: '480px', border: '1px solid #334155', maxHeight: '90vh', overflowY: 'auto' },
  label: { display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '6px', fontWeight: '600' },
  input: { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px', boxSizing: 'border-box' },
  select: { width: '100%', padding: '11px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#0f172a', color: 'white', fontSize: '16px' },
};
