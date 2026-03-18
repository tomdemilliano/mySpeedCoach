/**
 * AnnouncementsWidget
 *
 * A compact home-screen widget that shows the most recent announcements
 * for a skipper's groups. Used on pages/index.js.
 *
 * Props:
 *   memberContext: { clubId, memberId } | null
 */

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Megaphone, Pin, ChevronRight, Bell } from 'lucide-react';

const ANNOUNCEMENT_TYPES = {
  info:     { label: 'Info',        color: '#3b82f6', bg: '#3b82f618', emoji: 'ℹ️' },
  cancel:   { label: 'Geannuleerd', color: '#ef4444', bg: '#ef444418', emoji: '❌' },
  reminder: { label: 'Herinnering', color: '#f59e0b', bg: '#f59e0b18', emoji: '🔔' },
  result:   { label: 'Resultaat',   color: '#22c55e', bg: '#22c55e18', emoji: '🏆' },
};

export default function AnnouncementsWidget({ memberContext }) {
  const [announcements, setAnnouncements] = useState([]);
  const [groupIds,      setGroupIds]      = useState([]);
  const [loading,       setLoading]       = useState(true);

  // Resolve member's group ids
  useEffect(() => {
    if (!memberContext) { setLoading(false); return; }
    const { clubId, memberId } = memberContext;

    const load = async () => {
      try {
        const groupsSnap = await getDocs(collection(db, `clubs/${clubId}/groups`));
        const gids = [];
        await Promise.all(groupsSnap.docs.map(async gDoc => {
          const memSnap = await getDocs(collection(db, `clubs/${clubId}/groups/${gDoc.id}/members`));
          const isMember = memSnap.docs.some(m => (m.data().memberId || m.id) === memberId);
          if (isMember) gids.push(gDoc.id);
        }));
        setGroupIds(gids);
      } catch (e) {
        console.error('AnnouncementsWidget group load error:', e);
        setLoading(false);
      }
    };

    load();
  }, [memberContext]);

  // Subscribe to announcements for all groups
  useEffect(() => {
    if (!memberContext || groupIds.length === 0) {
      setLoading(false);
      return;
    }
    const { clubId } = memberContext;
    const allItems = {};
    let loadedCount = 0;
    const unsubs = groupIds.map(gid =>
      onSnapshot(
        query(
          collection(db, `clubs/${clubId}/groups/${gid}/announcements`),
          orderBy('createdAt', 'desc')
        ),
        (snap) => {
          allItems[gid] = snap.docs.map(d => ({ id: d.id, groupId: gid, ...d.data() }));
          const merged = Object.values(allItems).flat().sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
          });
          setAnnouncements(merged);
          loadedCount++;
          if (loadedCount >= groupIds.length) setLoading(false);
        },
        () => { setLoading(false); }
      )
    );
    return () => unsubs.forEach(u => u());
  }, [memberContext, groupIds]);

  // Show only the 3 most recent (pinned first)
  const visible = announcements.slice(0, 3);

  if (loading || !memberContext) return null;
  if (announcements.length === 0) return null;

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Megaphone size={14} color="#a78bfa" />
          <span>Aankondigingen</span>
          {announcements.length > 0 && (
            <span style={{ fontSize: '10px', fontWeight: '800', color: '#a78bfa', backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44', padding: '1px 6px', borderRadius: '8px' }}>
              {announcements.length}
            </span>
          )}
        </div>
        <a href="/announcements" style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
          Alle <ChevronRight size={12} />
        </a>
      </div>

      {/* Announcement items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {visible.map(ann => {
          const cfg = ANNOUNCEMENT_TYPES[ann.type] || ANNOUNCEMENT_TYPES.info;
          const dateStr = ann.createdAt?.seconds
            ? new Date(ann.createdAt.seconds * 1000).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' })
            : '';

          return (
            <a
              key={ann.id}
              href="/announcements"
              style={{ textDecoration: 'none' }}
            >
              <div style={{
                backgroundColor: '#1e293b',
                borderRadius: '10px',
                border: `1px solid ${ann.isPinned ? cfg.color + '44' : '#334155'}`,
                padding: '10px 12px',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
                transition: 'border-color 0.15s',
              }}>
                {/* Left stripe */}
                <div style={{
                  width: '3px', height: '32px', borderRadius: '2px',
                  backgroundColor: cfg.color,
                  flexShrink: 0,
                }} />

                {/* Emoji */}
                <div style={{ fontSize: '18px', flexShrink: 0 }}>{cfg.emoji}</div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '1px' }}>
                    {ann.isPinned && <Pin size={9} color={cfg.color} style={{ flexShrink: 0 }} />}
                    <span style={{ fontWeight: '700', fontSize: '13px', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ann.title}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ann.body?.split('\n')[0] || ''}
                  </div>
                </div>

                {/* Date */}
                <div style={{ fontSize: '10px', color: '#475569', flexShrink: 0 }}>{dateStr}</div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
