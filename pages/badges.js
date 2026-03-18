import { useState, useEffect } from 'react';
import { BadgeFactory, ClubFactory, GroupFactory, ClubMemberFactory } from '../constants/dbSchema';
import { Medal, Building2, Users, ChevronDown, ChevronUp } from 'lucide-react';

const CATEGORY_CONFIG = {
  speed:       { label: 'Snelheid',     color: '#f97316', emoji: '⚡' },
  milestone:   { label: 'Mijlpalen',    color: '#3b82f6', emoji: '🎯' },
  consistency: { label: 'Consistentie', color: '#22c55e', emoji: '🗓️' },
  skill:       { label: 'Vaardigheden', color: '#a78bfa', emoji: '🌟' },
};

// ─── Badge display component ──────────────────────────────────────────────────
function BadgeItem({ badge, earned, earnedDate, awardedByName, note, size = 'normal' }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const isSmall = size === 'small';
  const catColor = CATEGORY_CONFIG[badge.badgeCategory || badge.category]?.color || '#334155';

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}
      onClick={() => setShowTooltip(v => !v)}
    >
      <div style={{
        width: isSmall ? '48px' : '64px',
        height: isSmall ? '48px' : '64px',
        borderRadius: '50%',
        backgroundColor: earned ? '#1e293b' : '#0f172a',
        border: earned ? `2px solid ${catColor}` : '2px solid #1e293b',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: isSmall ? '22px' : '28px',
        opacity: earned ? 1 : 0.3,
        cursor: 'pointer',
        filter: earned ? 'none' : 'grayscale(100%)',
        overflow: 'hidden',
      }}>
        {badge.badgeImageUrl || badge.imageUrl ? (
          <img
            src={badge.badgeImageUrl || badge.imageUrl}
            alt={badge.badgeName || badge.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
          />
        ) : (
          <span>{badge.badgeEmoji || badge.emoji || '🏅'}</span>
        )}
      </div>
      {!isSmall && (
        <div style={{
          fontSize: '10px', color: earned ? '#94a3b8' : '#334155',
          textAlign: 'center', maxWidth: '64px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {badge.badgeName || badge.name}
        </div>
      )}

      {showTooltip && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '10px',
          padding: '10px 12px', zIndex: 100, minWidth: '160px', maxWidth: '200px',
          marginBottom: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontWeight: '700', fontSize: '13px', color: '#f1f5f9', marginBottom: '4px' }}>
            {badge.badgeName || badge.name}
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px', lineHeight: 1.5 }}>
            {badge.badgeDescription || badge.description || ''}
          </div>
          {earned ? (
            <>
              <div style={{ fontSize: '10px', color: '#22c55e', marginBottom: '2px' }}>
                ✓ Verdiend {earnedDate ? `op ${earnedDate}` : ''}
              </div>
              {awardedByName && awardedByName !== 'Systeem' && (
                <div style={{ fontSize: '10px', color: '#a78bfa' }}>Uitgereikt door: {awardedByName}</div>
              )}
              {note && (
                <div style={{ fontSize: '10px', color: '#64748b', fontStyle: 'italic', marginTop: '4px' }}>
                  "{note}"
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: '10px', color: '#475569' }}>Nog niet verdiend</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Club Badge Leaderboard Page ──────────────────────────────────────────────
export default function BadgesPage() {
  const [clubs,        setClubs]        = useState([]);
  const [groups,       setGroups]       = useState([]);
  const [selectedClub,  setSelectedClub]  = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  // Feature 8.3/8.4: group members are ClubMember-keyed docs { memberId, isSkipper, … }
  const [groupMembers,       setGroupMembers]       = useState([]);
  // ClubMember profiles for name resolution
  const [clubMemberProfiles, setClubMemberProfiles] = useState([]);
  // Feature 8.4: earnedBadges keyed by memberId
  const [memberBadges, setMemberBadges] = useState({});
  const [allBadges,    setAllBadges]    = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [expandedMember, setExpandedMember] = useState(null);

  useEffect(() => {
    const u1 = ClubFactory.getAll(setClubs);
    const u2 = BadgeFactory.getGlobal(setAllBadges);
    return () => { u1(); u2(); };
  }, []);

  useEffect(() => {
    if (!selectedClub) return;
    const u = GroupFactory.getGroupsByClub(selectedClub.id, setGroups);
    return () => u();
  }, [selectedClub]);

  // Feature 8.4: load group members + ClubMember profiles for name resolution
  useEffect(() => {
    if (!selectedClub || !selectedGroup) return;
    const u1 = GroupFactory.getMembersByGroup(selectedClub.id, selectedGroup.id, setGroupMembers);
    const u2 = ClubMemberFactory.getAll(selectedClub.id, setClubMemberProfiles);
    return () => { u1(); u2(); };
  }, [selectedClub, selectedGroup]);

  // Feature 8.4: load badges via getEarnedForMembers (clubId + memberId pairs)
  useEffect(() => {
    if (!selectedClub || groupMembers.length === 0) return;
    setLoading(true);
    const memberPairs = groupMembers.map(m => ({
      clubId:   selectedClub.id,
      memberId: m.memberId || m.id,
    }));
    BadgeFactory.getEarnedForMembers(memberPairs).then(results => {
      setMemberBadges(results);
      setLoading(false);
    });
  }, [selectedClub, groupMembers]);

  // Resolve ClubMember profile by memberId
  const getMemberProfile = (memberId) =>
    clubMemberProfiles.find(p => p.id === memberId) || null;

  // Sort group members by badge count descending
  const rankedMembers = [...groupMembers]
    .map(m => {
      const memberId = m.memberId || m.id;
      return { ...m, memberId, badgeCount: (memberBadges[memberId] || []).length };
    })
    .sort((a, b) => b.badgeCount - a.badgeCount);

  const RANK_COLORS = ['#facc15', '#94a3b8', '#f97316'];
  const RANK_LABELS = ['🥇', '🥈', '🥉'];

  return (
    <div style={css.page}>
      <style>{pageCSS}</style>

      <header style={css.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '9px', backgroundColor: '#f59e0b22', border: '1px solid #f59e0b44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Medal size={17} color="#f59e0b" />
          </div>
          <div>
            <div style={{ fontWeight: '800', fontSize: '15px', color: '#f1f5f9' }}>Badge Leaderboard</div>
            <div style={{ fontSize: '10px', color: '#475569' }}>Club klassement</div>
          </div>
        </div>
      </header>

      <div style={css.content}>
        {/* Club selector */}
        <div style={css.field}>
          <label style={css.label}><Building2 size={13} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Club</label>
          <select style={css.select} value={selectedClub?.id || ''} onChange={e => {
            const club = clubs.find(c => c.id === e.target.value);
            setSelectedClub(club || null);
            setSelectedGroup(null);
            setGroupMembers([]);
            setClubMemberProfiles([]);
            setMemberBadges({});
          }}>
            <option value="">-- Kies een club --</option>
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {selectedClub && (
          <div style={css.field}>
            <label style={css.label}><Users size={13} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Groep</label>
            <select style={css.select} value={selectedGroup?.id || ''} onChange={e => {
              const group = groups.find(g => g.id === e.target.value);
              setSelectedGroup(group || null);
              setGroupMembers([]);
              setClubMemberProfiles([]);
              setMemberBadges({});
            }}>
              <option value="">-- Kies een groep --</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}

        {/* Leaderboard */}
        {selectedGroup && (
          <>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {selectedClub?.name} · {selectedGroup?.name} · {rankedMembers.length} skippers
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <div style={css.spinner} />
                <p style={{ marginTop: '12px', fontSize: '13px' }}>Laden…</p>
              </div>
            ) : rankedMembers.length === 0 ? (
              <p style={{ color: '#475569', textAlign: 'center', padding: '40px 0', fontSize: '14px' }}>
                Geen skippers gevonden in deze groep.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {rankedMembers.map(({ memberId, badgeCount }, idx) => {
                  const profile   = getMemberProfile(memberId);
                  const earned    = memberBadges[memberId] || [];
                  const isExpanded = expandedMember === memberId;
                  const rankColor  = RANK_COLORS[idx] || '#334155';
                  const firstName  = profile?.firstName || '?';
                  const lastName   = profile?.lastName  || '';
                  const initials   = `${firstName[0] || '?'}${lastName[0] || ''}`.toUpperCase();

                  return (
                    <div
                      key={memberId}
                      style={{
                        ...css.memberRow,
                        borderColor: idx < 3 ? rankColor + '44' : '#334155',
                        backgroundColor: '#1e293b',
                      }}
                    >
                      {/* Collapsed row */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                        onClick={() => setExpandedMember(isExpanded ? null : memberId)}
                      >
                        {/* Rank */}
                        <div style={{ width: '32px', textAlign: 'center', fontSize: idx < 3 ? '20px' : '14px', fontWeight: '800', color: rankColor, flexShrink: 0 }}>
                          {idx < 3 ? RANK_LABELS[idx] : `#${idx + 1}`}
                        </div>

                        {/* Avatar */}
                        <div style={{ width: '38px', height: '38px', borderRadius: '50%', backgroundColor: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px', flexShrink: 0 }}>
                          {initials}
                        </div>

                        {/* Name */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: '700', fontSize: '14px', color: '#f1f5f9' }}>
                            {firstName} {lastName}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {badgeCount} badge{badgeCount !== 1 ? 's' : ''}
                          </div>
                        </div>

                        {/* Badge previews */}
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center' }}>
                          {earned.slice(0, 4).map(b => (
                            <div key={b.id} style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#0f172a', border: '1px solid #334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', overflow: 'hidden' }}>
                              {b.badgeImageUrl
                                ? <img src={b.badgeImageUrl} alt={b.badgeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : b.badgeEmoji || '🏅'
                              }
                            </div>
                          ))}
                          {earned.length > 4 && (
                            <div style={{ fontSize: '11px', color: '#64748b', marginLeft: '2px' }}>+{earned.length - 4}</div>
                          )}
                        </div>

                        {earned.length > 0 && (
                          isExpanded
                            ? <ChevronUp size={16} color="#475569" style={{ flexShrink: 0 }} />
                            : <ChevronDown size={16} color="#475569" style={{ flexShrink: 0 }} />
                        )}
                      </div>

                      {/* Expanded badges */}
                      {isExpanded && earned.length > 0 && (
                        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #334155' }}>
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                            Alle verdiende badges
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                            {earned.map(b => (
                              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#0f172a', borderRadius: '8px', padding: '8px 10px', border: '1px solid #1e293b' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', overflow: 'hidden', backgroundColor: '#1e293b', flexShrink: 0 }}>
                                  {b.badgeImageUrl
                                    ? <img src={b.badgeImageUrl} alt={b.badgeName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    : b.badgeEmoji || '🏅'
                                  }
                                </div>
                                <div>
                                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#f1f5f9' }}>{b.badgeName}</div>
                                  <div style={{ fontSize: '10px', color: '#475569' }}>
                                    {b.earnedAt?.seconds ? new Date(b.earnedAt.seconds * 1000).toLocaleDateString('nl-BE') : ''}
                                    {b.awardedByName && b.awardedByName !== 'Systeem' ? ` · ${b.awardedByName}` : ''}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!selectedGroup && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <Medal size={48} color="#334155" style={{ marginBottom: '16px' }} />
            <p style={{ color: '#475569', fontSize: '14px' }}>
              Selecteer een club en groep om het badge leaderboard te bekijken.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const pageCSS = `
  * { box-sizing: border-box; }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

const css = {
  page: { backgroundColor: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'system-ui, sans-serif' },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 16px', backgroundColor: '#1e293b', borderBottom: '1px solid #334155',
    position: 'sticky', top: 0, zIndex: 50,
  },
  content: { maxWidth: '760px', margin: '0 auto', padding: '20px 16px 40px' },
  field:   { marginBottom: '16px' },
  label:   { display: 'block', color: '#64748b', fontSize: '12px', fontWeight: '600', marginBottom: '6px' },
  select:  { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #334155', backgroundColor: '#1e293b', color: 'white', fontSize: '14px' },
  memberRow: { backgroundColor: '#1e293b', borderRadius: '12px', border: '1px solid', padding: '12px 14px' },
  spinner: { width: '28px', height: '28px', border: '3px solid #1e293b', borderTop: '3px solid #f59e0b', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' },
};
