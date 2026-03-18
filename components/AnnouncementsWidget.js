/**
 * AnnouncementsWidget
 *
 * Compact home-screen widget showing the most recent announcements
 * for a skipper's groups.
 *
 * All data access goes through AnnouncementFactory and GroupFactory
 * from constants/dbSchema.js — no direct Firestore calls.
 *
 * Props:
 *   memberContext: { clubId, memberId } | null
 */

import { useState, useEffect } from 'react';
import { AnnouncementFactory, GroupFactory } from '../constants/dbSchema';
import { Megaphone, Pin, ChevronRight } from 'lucide-react';

const ANNOUNCEMENT_TYPES = {
  info:     { color: '#3b82f6', emoji: 'ℹ️' },
  cancel:   { color: '#ef4444', emoji: '❌' },
  reminder: { color: '#f59e0b', emoji: '🔔' },
  result:   { color: '#22c55e', emoji: '🏆' },
};

// Resolve which groups the member belongs to using GroupFactory
async function resolveGroupIdsForMember(clubId, memberId) {
  return new Promise((resolve) => {
    const gids = [];
    const unsub = GroupFactory.getGroupsByClub(clubId, async (groups) => {
      unsub();
      await Promise.all(groups.map(group =>
        new Promise(res => {
          const u = GroupFactory.getMembersByGroup(clubId, group.id, (members) => {
            u();
            if (members.some(m => (m.memberId || m.id) === memberId)) gids.push(group.id);
            res();
          });
        })
      ));
      resolve(gids);
    });
  });
}

export default function AnnouncementsWidget({ memberContext }) {
  const [announcements, setAnnouncements] = useState([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    if (!memberContext) { setLoading(false); return; }
    const { clubId, memberId } = memberContext;
    let unsub = () => {};

    resolveGroupIdsForMember(clubId, memberId).then(gids => {
      if (gids.length === 0) { setLoading(false); return; }
      // Subscribe via AnnouncementFactory — no direct Firestore call
      unsub = AnnouncementFactory.subscribeForUser(gids, (items) => {
        setAnnouncements(items);
        setLoading(false);
      });
    });

    return () => unsub();
  }, [memberContext]);

  const visible = announcements.slice(0, 3);

  if (loading || !memberContext || announcements.length === 0) return null;

  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ fontSize: '14px', fontWeight: '700', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Megaphone size={14} color="#a78bfa" />
          <span>Aankondigingen</span>
          <span style={{ fontSize: '10px', fontWeight: '800', color: '#a78bfa', backgroundColor: '#a78bfa22', border: '1px solid #a78bfa44', padding: '1px 6px', borderRadius: '8px' }}>
            {announcements.length}
          </span>
        </div>
        <a href="/announcements" style={{ fontSize: '12px', color: '#3b82f6', textDecoration: 'none', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
          Alle <ChevronRight size={12} />
        </a>
      </div>

      {/* Announcement rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {visible.map(ann => {
          const cfg = ANNOUNCEMENT_TYPES[ann.type] || ANNOUNCEMENT_TYPES.info;
          const dateStr = ann.createdAt?.seconds
            ? new Date(ann.createdAt.seconds * 1000).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short' })
            : '';

          return (
            <a key={ann.id} href="/announcements" style={{ textDecoration: 'none' }}>
              <div style={{
                backgroundColor: '#1e293b',
                borderRadius: '10px',
                border: `1px solid ${ann.pinned ? cfg.color + '44' : '#334155'}`,
                padding: '10px 12px',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
              }}>
                {/* Colour stripe */}
                <div style={{ width: '3px', height: '32px', borderRadius: '2px', backgroundColor: cfg.color, flexShrink: 0 }} />
                {/* Emoji */}
                <div style={{ fontSize: '18px', flexShrink: 0 }}>{cfg.emoji}</div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '1px' }}>
                    {ann.pinned && <Pin size={9} color={cfg.color} style={{ flexShrink: 0 }} />}
                    <span style={{ fontWeight: '700', fontSize: '13px', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ann.title}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(ann.body || '').split('\n')[0]}
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
