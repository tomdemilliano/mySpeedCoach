/**
 * hooks/useSkipperSelection.js
 *
 * Centralises all data-fetching for the skipper / group / club selection flow.
 * Previously duplicated across counter.js, ai-counter.js, and live.js.
 *
 * Returns:
 *   bootstrapDone     boolean
 *   memberClubs       Club[]
 *   memberGroups      Group[]           — filtered to groups with skippers
 *   skippers          GroupMember[]     — isSkipper === true for selected group
 *   clubMembers       ClubMember[]      — full profiles for name resolution
 *   selectedClubId    string
 *   selectedGroupId   string
 *   setSelectedClubId (id: string) => void
 *   setSelectedGroupId(id: string) => void
 *   getMember         (memberId: string) => ClubMember | null
 *   resolveSkipper    (groupMember) => Promise<ResolvedSkipper>
 *
 * ResolvedSkipper: { memberId, clubId, firstName, lastName, rtdbUid }
 *
 * Rules followed:
 *   - All Firestore/RTDB access via factories only (CLAUDE.md §1)
 *   - No direct Firebase SDK imports (CLAUDE.md §1)
 */

import { useState, useEffect } from 'react';
import {
  UserFactory, ClubFactory, GroupFactory,
  ClubMemberFactory, UserMemberLinkFactory,
} from '../constants/dbSchema';

// ─── Cookie helper (same pattern as counter.js and ai-counter.js) ─────────────
const COOKIE_KEY = 'msc_uid';
const getCookie = () => {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  return m ? m[1] : null;
};

/**
 * @returns {object} Selection state and helpers — see JSDoc above.
 */
export function useSkipperSelection() {
  // ── Auth / role ────────────────────────────────────────────────────────────
  const [bootstrapDone, setBootstrapDone] = useState(false);
  const isSuperAdminRef = { current: false };
  const isClubAdminRef  = { current: false };
  // We track these in state so derived effects re-run when they change
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isClubAdmin,  setIsClubAdmin]  = useState(false);

  // ── Clubs ──────────────────────────────────────────────────────────────────
  const [memberClubs,      setMemberClubs]      = useState([]);
  const [selectedClubId,   setSelectedClubId]   = useState('');

  // ── Groups ─────────────────────────────────────────────────────────────────
  const [memberGroups,     setMemberGroups]     = useState([]);
  const [selectedGroupId,  setSelectedGroupId]  = useState('');

  // ── Skippers + profiles ────────────────────────────────────────────────────
  const [skippers,    setSkippers]    = useState([]);
  const [clubMembers, setClubMembers] = useState([]);

  // ── Bootstrap: resolve uid → role → clubs ─────────────────────────────────
  useEffect(() => {
    const uid = getCookie();
    if (!uid) { setBootstrapDone(true); return; }

    let cancelled = false;
    const unsubRefs = [];

    const go = async () => {
      let snap;
      try { snap = await UserFactory.get(uid); }
      catch { setBootstrapDone(true); return; }

      if (!snap.exists() || cancelled) { setBootstrapDone(true); return; }

      const role = snap.data().role || 'user';

      if (role === 'superadmin') {
        setIsSuperAdmin(true);
        const unsub = ClubFactory.getAll((clubs) => {
          if (cancelled) return;
          setMemberClubs(clubs);
          setBootstrapDone(true);
        });
        unsubRefs.push(unsub);
        return;
      }

      if (role === 'clubadmin') {
        setIsClubAdmin(true);
        const unsub = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
          if (cancelled) return;
          if (profiles.length === 0) { setBootstrapDone(true); return; }
          const clubIdSet = new Set(profiles.map(p => p.member.clubId));
          const snaps = await Promise.all([...clubIdSet].map(id => ClubFactory.getById(id)));
          if (!cancelled) {
            setMemberClubs(snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() })));
            setBootstrapDone(true);
          }
        });
        unsubRefs.push(unsub);
        return;
      }

      // Regular user — clubs via UserMemberLink
      const unsub = UserMemberLinkFactory.getForUser(uid, async (profiles) => {
        if (cancelled) return;
        if (profiles.length === 0) { setBootstrapDone(true); return; }
        const clubIdSet = new Set(profiles.map(p => p.member.clubId));
        const snaps = await Promise.all([...clubIdSet].map(id => ClubFactory.getById(id)));
        if (!cancelled) {
          setMemberClubs(snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() })));
          setBootstrapDone(true);
        }
      });
      unsubRefs.push(unsub);
    };

    go();
    return () => {
      cancelled = true;
      unsubRefs.forEach(u => u && u());
    };
  }, []);

  // Auto-select when there is only one club
  useEffect(() => {
    if (memberClubs.length === 1) setSelectedClubId(memberClubs[0].id);
  }, [memberClubs]);

  // ── Load groups when club changes ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedClubId) return;

    // Reset downstream state
    setSelectedGroupId('');
    setMemberGroups([]);
    setSkippers([]);
    setClubMembers([]);

    const uid = getCookie();
    if (!uid) return;

    let cancelled = false;

    const load = async () => {
      try {
        const allGroups = await GroupFactory.getGroupsByClubOnce(selectedClubId);

        // Cache members per group for filtering
        const memberCache = {};
        await Promise.all(allGroups.map(async g => {
          memberCache[g.id] = await GroupFactory.getMembersByGroupOnce(selectedClubId, g.id);
        }));

        if (cancelled) return;

        // SuperAdmin and ClubAdmin see all groups that contain at least one skipper
        if (isSuperAdmin || isClubAdmin) {
          const filtered = allGroups.filter(g =>
            memberCache[g.id]?.some(m => m.isSkipper === true)
          );
          setMemberGroups(filtered);
          if (filtered.length === 1) setSelectedGroupId(filtered[0].id);
          return;
        }

        // Regular user / coach: only groups they belong to that have skippers
        const links = await UserMemberLinkFactory.getForUserInClub(uid, selectedClubId);
        if (cancelled) return;

        const myMemberIds = new Set(links.map(l => l.memberId).filter(Boolean));
        const myGroupIds  = new Set();
        allGroups.forEach(g => {
          if (memberCache[g.id]?.some(d => myMemberIds.has(d.memberId || d.id))) {
            myGroupIds.add(g.id);
          }
        });

        const filtered = allGroups.filter(g =>
          myGroupIds.has(g.id) &&
          memberCache[g.id]?.some(m => m.isSkipper === true)
        );

        if (!cancelled) {
          setMemberGroups(filtered);
          if (filtered.length === 1) setSelectedGroupId(filtered[0].id);
        }
      } catch (e) {
        console.error('[useSkipperSelection] group load error:', e);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [selectedClubId, isSuperAdmin, isClubAdmin]);

  // ── Load skippers + club members when group changes ───────────────────────
  useEffect(() => {
    if (!selectedClubId || !selectedGroupId) return;

    const u1 = GroupFactory.getSkippersByGroup(selectedClubId, selectedGroupId, setSkippers);
    const u2 = ClubMemberFactory.getAll(selectedClubId, setClubMembers);

    return () => { u1(); u2(); };
  }, [selectedClubId, selectedGroupId]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Returns the full ClubMember profile for a given memberId, or null. */
  const getMember = (memberId) =>
    clubMembers.find(m => m.id === memberId) || null;

  /**
   * Resolves a group member doc into a full skipper object with rtdbUid.
   * Async because it queries UserMemberLinks to find the Firebase Auth uid.
   *
   * @param {object} groupMember  — doc from getSkippersByGroup (has .memberId or .id)
   * @returns {Promise<{ memberId, clubId, firstName, lastName, rtdbUid }>}
   */
  const resolveSkipper = async (groupMember) => {
    const memberId = groupMember.memberId || groupMember.id;
    const profile  = getMember(memberId);
    const rtdbUid  = await UserMemberLinkFactory.getUidForMember(selectedClubId, memberId);
    return {
      memberId,
      clubId:    selectedClubId,
      firstName: profile?.firstName || '?',
      lastName:  profile?.lastName  || '',
      rtdbUid:   rtdbUid || '',
    };
  };

  return {
    bootstrapDone,
    memberClubs,
    memberGroups,
    skippers,
    clubMembers,
    selectedClubId,
    selectedGroupId,
    setSelectedClubId,
    setSelectedGroupId,
    getMember,
    resolveSkipper,
  };
}
