import React, { useState, useEffect } from 'react';
import { UserFactory, ClubFactory, GroupFactory, ClubJoinRequestFactory } from '../constants/dbSchema';

import {
  ShieldAlert, UserPlus, Building2, Users,
  Trash2, Search, Edit2, X, Save, ArrowLeft, Plus,
  Heart, HeartOff, PlusCircle, Calendar,
  Bell, CheckCircle2, XCircle, Clock, MessageSquare,
  ChevronDown, ChevronUp, Check, AlertCircle,
} from 'lucide-react';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:  { label: 'In behandeling', color: '#f59e0b', bg: '#f59e0b15' },
  approved: { label: 'Goedgekeurd',    color: '#22c55e', bg: '#22c55e15' },
  rejected: { label: 'Afgewezen',      color: '#ef4444', bg: '#ef444415' },
};

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState('users');
  const [searchTerm, setSearchTerm] = useState('');

  const [users, setUsers] = useState([]);
  const [clubs, setClubs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberCounts, setMemberCounts] = useState({});

  const [selectedClub, setSelectedClub] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editingMemberUid, setEditingMemberUid] = useState(null);

  const [userForm, setUserForm] = useState({ firstName: '', lastName: '', email: '', role: 'user' });
  const [clubForm, setClubForm] = useState({ name: '', logoUrl: '' });
  const [groupForm, setGroupForm] = useState({ name: '', useHRM: true });
  const [memberEditForm, setMemberEditForm] = useState({});
  const [showOnlyActive, setShowOnlyActive] = useState(true);

  // ── Join requests state
  const [joinRequests, setJoinRequests] = useState([]);
  const [requestFilter, setRequestFilter] = useState('pending');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingRequestId, setRejectingRequestId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [rejectSaving, setRejectSaving] = useState(false);

  // ── Real-time data sync
  useEffect(() => {
    const unsubUsers = UserFactory.getAll(setUsers);
    const unsubClubs = ClubFactory.getAll(setClubs);
    const unsubRequests = ClubJoinRequestFactory.getAll((data) => {
      const sorted = [...data].sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      });
      setJoinRequests(sorted);
    });
    return () => { unsubUsers(); unsubClubs(); unsubRequests(); };
  }, []);

  useEffect(() => {
    if (!selectedClub) return;
    const unsubGroups = GroupFactory.getGroupsByClub(selectedClub.id, (groupsData) => {
      setGroups(groupsData);
      groupsData.forEach(group => {
        GroupFactory.getMemberCount(selectedClub.id, group.id, (count) => {
          setMemberCounts(prev => ({ ...prev, [group.id]: count }));
        });
      });
    });
    return () => unsubGroups();
  }, [selectedClub]);

  useEffect(() => {
    if (!selectedGroup || !selectedClub) return;
    const unsubMembers = GroupFactory.getMembersByGroup(selectedClub.id, selectedGroup.id, setMembers);
    return () => unsubMembers();
  }, [selectedGroup, selectedClub]);

  const filteredUsers = users.filter(u =>
    `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredClubs = clubs.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const pendingCount = joinRequests.filter(r => r.status === 'pending').length;
  const filteredRequests = requestFilter === 'all'
    ? joinRequests
    : joinRequests.filter(r => r.status === requestFilter);

  // ── Handlers
  const handleUserSubmit = async (e) => {
    e.preventDefault();
    editingId
      ? await UserFactory.updateProfile(editingId, userForm)
      : await UserFactory.create(Date.now().toString(), userForm);
    setIsUserModalOpen(false);
  };

  const handleClubSubmit = async (e) => {
    e.preventDefault();
    editingId ? await ClubFactory.update(editingId, clubForm) : await ClubFactory.create(clubForm);
    setIsClubModalOpen(false);
  };

  const handleGroupSubmit = async (e) => {
    e.preventDefault();
    editingId
      ? await GroupFactory.update(selectedClub.id, editingId, groupForm)
      : await GroupFactory.create(selectedClub.id, groupForm);
    setIsGroupModalOpen(false);
  };

  const handleDeleteClub = async (clubId) => {
    if (confirm('Club verwijderen? Dit wist ook alle groepen en lidmaatschappen!'))
      await ClubFactory.delete(clubId);
  };

  const handleAddMember = async (user) => {
    await GroupFactory.addMember(selectedClub.id, selectedGroup.id, user.id, {
      isSkipper: true, isCoach: false,
      startMembership: new Date(), endMembership: null,
    });
  };

  const handleUpdateMember = async (uid, data) => {
    await GroupFactory.updateMember(selectedClub.id, selectedGroup.id, uid, data);
    setEditingMemberUid(null);
  };

  const handleRemoveMember = async (uid) => {
    if (confirm('Weet je zeker dat je dit lidmaatschap definitief wilt verwijderen?'))
      await GroupFactory.removeMember(selectedClub.id, selectedGroup.id, uid);
  };

  const handleApproveRequest = async (requestId) => {
    await ClubJoinRequestFactory.approve(requestId);
  };

  const openRejectModal = (requestId) => {
    setRejectingRequestId(requestId);
    setRejectReason('');
    setRejectError('');
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectReason.trim()) { setRejectError('Een reden is verplicht bij afwijzing.'); return; }
    setRejectSaving(true);
    try {
      await ClubJoinRequestFactory.reject(rejectingRequestId, rejectReason.trim());
      setRejectModalOpen(false);
      setRejectingRequestId(null);
      setRejectReason('');
    } catch {
      setRejectError('Er ging iets mis. Probeer opnieuw.');
    } finally {
      setRejectSaving(false);
    }
  };

  const handleDeleteRequest = async (requestId) => {
    if (confirm('Aanvraag permanent verwijderen?'))
      await ClubJoinRequestFactory.delete(requestId);
  };

  // ── Breadcrumb back navigation
  const handleBack = () => {
    if (selectedGroup) { setSelectedGroup(null); setSearchTerm(''); }
    else if (selectedClub) { setSelectedClub(null); setGroups([]); setSearchTerm(''); }
  };

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={s.page}>
      <style>{css}</style>

      {/* ── HEADER ── */}
      <header style={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldAlert size={20} color="#3b82f6" />
          <span style={s.headerTitle}>SuperAdmin</span>
        </div>

        {/* Tab bar */}
        <div style={s.tabBar}>
          {[
            { key: 'users',    label: 'Gebruikers' },
            { key: 'clubs',    label: 'Clubs' },
            { key: 'requests', label: 'Aanvragen', badge: pendingCount },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSelectedClub(null); setSelectedGroup(null); setSearchTerm(''); }}
              style={{ ...s.tab, ...(activeTab === tab.key ? s.tabActive : {}) }}
            >
              {tab.label}
              {tab.badge > 0 && (
                <span style={s.tabBadge}>{tab.badge > 9 ? '9+' : tab.badge}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* ── CONTENT ── */}
      <main style={s.content}>

        {/* ═══ USERS ═══ */}
        {activeTab === 'users' && (
          <div>
            {/* Action bar */}
            <div style={s.actionBar}>
              <div style={s.searchWrap}>
                <Search size={16} style={s.searchIcon} />
                <input
                  placeholder="Zoek gebruiker…"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={s.searchInput}
                />
              </div>
              <button
                style={s.addBtn}
                onClick={() => { setEditingId(null); setUserForm({ firstName: '', lastName: '', email: '', role: 'user' }); setIsUserModalOpen(true); }}
              >
                <UserPlus size={16} />
                <span className="btn-label">Nieuwe gebruiker</span>
              </button>
            </div>

            {/* User cards (mobile) / table (desktop) */}
            <div className="user-list">
              {filteredUsers.map(user => (
                <div key={user.id} style={s.userCard}>
                  <div style={s.userCardAvatar}>
                    {(user.firstName?.[0] || '?')}{user.lastName?.[0] || ''}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.userCardName}>{user.firstName} {user.lastName}</div>
                    <div style={s.userCardEmail}>{user.email}</div>
                    <span style={{ ...s.roleBadge, backgroundColor: getRoleColor(user.role) }}>
                      {user.role}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    <button
                      style={s.iconBtn}
                      onClick={() => { setEditingId(user.id); setUserForm(user); setIsUserModalOpen(true); }}
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      style={{ ...s.iconBtn, color: '#ef4444' }}
                      onClick={() => { if (confirm('Gebruiker wissen?')) UserFactory.delete(user.id); }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <p style={s.emptyText}>Geen gebruikers gevonden.</p>
              )}
            </div>
          </div>
        )}

        {/* ═══ CLUBS & GROUPS ═══ */}
        {activeTab === 'clubs' && (
          <div>
            {/* Breadcrumb */}
            {(selectedClub) && (
              <button style={s.backBtn} onClick={handleBack}>
                <ArrowLeft size={16} />
                {selectedGroup ? `Terug naar ${selectedClub.name}` : 'Terug naar clubs'}
              </button>
            )}

            {/* Club list */}
            {!selectedClub && (
              <>
                <div style={s.actionBar}>
                  <div style={s.searchWrap}>
                    <Search size={16} style={s.searchIcon} />
                    <input
                      placeholder="Zoek club…"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      style={s.searchInput}
                    />
                  </div>
                  <button
                    style={s.addBtn}
                    onClick={() => { setEditingId(null); setClubForm({ name: '', logoUrl: '' }); setIsClubModalOpen(true); }}
                  >
                    <Building2 size={16} />
                    <span className="btn-label">Nieuwe club</span>
                  </button>
                </div>

                <div className="card-grid">
                  {filteredClubs.map(club => (
                    <div key={club.id} style={s.clubCard}>
                      <div style={s.clubCardBody} onClick={() => setSelectedClub(club)}>
                        {club.logoUrl
                          ? <img src={club.logoUrl} style={s.clubLogo} alt={club.name} />
                          : <div style={s.clubLogoPlaceholder}><Building2 size={32} color="#64748b" /></div>
                        }
                        <div style={s.clubCardName}>{club.name}</div>
                      </div>
                      <div style={s.clubCardActions}>
                        <button style={s.iconBtn} onClick={() => { setEditingId(club.id); setClubForm(club); setIsClubModalOpen(true); }}>
                          <Edit2 size={14} />
                        </button>
                        <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={() => handleDeleteClub(club.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {filteredClubs.length === 0 && <p style={s.emptyText}>Geen clubs gevonden.</p>}
                </div>
              </>
            )}

            {/* Group list */}
            {selectedClub && !selectedGroup && (
              <>
                <div style={s.sectionTitle}>
                  <Building2 size={18} color="#a78bfa" />
                  <span>{selectedClub.name} — Groepen</span>
                  <button
                    style={{ ...s.addBtn, marginLeft: 'auto' }}
                    onClick={() => { setEditingId(null); setGroupForm({ name: '', useHRM: true }); setIsGroupModalOpen(true); }}
                  >
                    <Plus size={16} />
                    <span className="btn-label">Groep</span>
                  </button>
                </div>

                <div className="card-grid">
                  {groups.map(group => (
                    <div key={group.id} style={s.groupCard}>
                      <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => setSelectedGroup(group)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                          <Users size={24} color="#3b82f6" />
                          <span style={s.groupCardName}>{group.name}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={s.countBadge}>{memberCounts[group.id] || 0} leden</span>
                          <span style={{ ...s.hrmBadge, backgroundColor: group.useHRM ? '#065f46' : '#334155' }}>
                            {group.useHRM ? <Heart size={10} fill="white" /> : <HeartOff size={10} />}
                            HRM {group.useHRM ? 'AAN' : 'UIT'}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '10px' }}>
                        <button style={s.iconBtn} onClick={() => { setEditingId(group.id); setGroupForm(group); setIsGroupModalOpen(true); }}>
                          <Edit2 size={14} />
                        </button>
                        <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={() => GroupFactory.delete(selectedClub.id, group.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {groups.length === 0 && <p style={s.emptyText}>Geen groepen gevonden.</p>}
                </div>
              </>
            )}

            {/* Members */}
            {selectedClub && selectedGroup && (
              <div>
                <div style={s.sectionTitle}>
                  <Users size={18} color="#3b82f6" />
                  <span>{selectedGroup.name} — Leden ({members.length})</span>
                </div>

                {/* Active filter toggle */}
                <div style={s.filterRow}>
                  <label style={s.filterLabel}>
                    <input
                      type="checkbox"
                      checked={showOnlyActive}
                      onChange={e => setShowOnlyActive(e.target.checked)}
                      style={{ marginRight: '6px' }}
                    />
                    Alleen actieve leden
                  </label>
                </div>

                {/* Member cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {members
                    .filter(m => {
                      if (!showOnlyActive) return true;
                      const nu = new Date();
                      const start = m.startMembership?.toDate ? m.startMembership.toDate() : new Date(m.startMembership);
                      const eind = m.endMembership?.toDate ? m.endMembership.toDate() : (m.endMembership ? new Date(m.endMembership) : null);
                      return start <= nu && (!eind || eind > nu);
                    })
                    .map(m => {
                      const user = users.find(u => u.id === m.id);
                      const isEditing = editingMemberUid === m.id;
                      return (
                        <div key={m.id} style={s.memberCard}>
                          {/* Name row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={s.memberName}>{user ? `${user.firstName} ${user.lastName}` : 'Onbekend'}</div>
                              <div style={s.memberEmail}>{user?.email || '—'}</div>
                            </div>
                            <button style={{ ...s.iconBtn, color: '#ef4444' }} onClick={() => handleRemoveMember(m.id)}>
                              <Trash2 size={16} />
                            </button>
                          </div>

                          {/* Role toggles */}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            <button
                              style={{ ...s.roleToggle, backgroundColor: m.isSkipper ? '#3b82f6' : '#334155' }}
                              onClick={() => handleUpdateMember(m.id, { isSkipper: !m.isSkipper })}
                            >
                              Skipper: {m.isSkipper ? 'JA' : 'NEE'}
                            </button>
                            <button
                              style={{ ...s.roleToggle, backgroundColor: m.isCoach ? '#f59e0b' : '#334155' }}
                              onClick={() => handleUpdateMember(m.id, { isCoach: !m.isCoach })}
                            >
                              Coach: {m.isCoach ? 'JA' : 'NEE'}
                            </button>
                          </div>

                          {/* Dates */}
                          <div style={s.memberDates}>
                            <div style={s.dateRow}>
                              <span style={{ color: '#64748b', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Calendar size={12} /> Start
                              </span>
                              {isEditing ? (
                                <input
                                  type="date"
                                  style={s.dateInput}
                                  defaultValue={m.startMembership?.toDate ? m.startMembership.toDate().toISOString().split('T')[0] : ''}
                                  onChange={e => setMemberEditForm({ ...memberEditForm, startMembership: new Date(e.target.value) })}
                                />
                              ) : (
                                <span style={{ fontSize: '12px', color: '#f1f5f9' }}>
                                  {m.startMembership?.toDate ? m.startMembership.toDate().toLocaleDateString() : '-'}
                                </span>
                              )}
                            </div>
                            <div style={s.dateRow}>
                              <span style={{ color: '#64748b', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Calendar size={12} /> Einde
                              </span>
                              {isEditing ? (
                                <input
                                  type="date"
                                  style={s.dateInput}
                                  defaultValue={m.endMembership?.toDate ? m.endMembership.toDate().toISOString().split('T')[0] : ''}
                                  onChange={e => setMemberEditForm({ ...memberEditForm, endMembership: e.target.value ? new Date(e.target.value) : null })}
                                />
                              ) : (
                                <span style={{ fontSize: '12px', color: '#f1f5f9' }}>
                                  {m.endMembership?.toDate ? m.endMembership.toDate().toLocaleDateString() : 'Geen'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Edit/save button */}
                          <div style={{ marginTop: '10px' }}>
                            {isEditing ? (
                              <button style={s.saveBtn} onClick={() => handleUpdateMember(m.id, memberEditForm)}>
                                <Save size={14} /> Opslaan
                              </button>
                            ) : (
                              <button style={s.editBtn} onClick={() => { setEditingMemberUid(m.id); setMemberEditForm(m); }}>
                                <Edit2 size={14} /> Wijzig lidmaatschap
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {members.length === 0 && <p style={s.emptyText}>Geen leden in deze groep.</p>}
                </div>

                {/* Add member picker */}
                <div style={s.pickerPanel}>
                  <div style={s.pickerTitle}>Lid toevoegen</div>
                  <div style={s.searchWrap}>
                    <Search size={14} style={s.searchIcon} />
                    <input
                      placeholder="Zoek gebruiker…"
                      onChange={e => setSearchTerm(e.target.value)}
                      style={s.searchInput}
                    />
                  </div>
                  <div style={s.pickerList}>
                    {users
                      .filter(u => !members.some(m => m.id === u.id))
                      .filter(u => `${u.firstName} ${u.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map(u => (
                        <div key={u.id} style={s.pickerRow} onClick={() => handleAddMember(u)}>
                          <span style={{ fontSize: '14px' }}>{u.firstName} {u.lastName}</span>
                          <PlusCircle size={18} color="#22c55e" />
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ JOIN REQUESTS ═══ */}
        {activeTab === 'requests' && (
          <div>
            <div style={s.requestsHeader}>
              <div>
                <div style={s.sectionTitleText}>Club Aanvragen</div>
                {pendingCount > 0 && (
                  <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '2px' }}>
                    {pendingCount} openstaande aanvraag/aanvragen
                  </div>
                )}
              </div>
            </div>

            {/* Filter pills */}
            <div style={s.filterPills}>
              {[
                { key: 'pending',  label: 'In behandeling', count: joinRequests.filter(r => r.status === 'pending').length },
                { key: 'approved', label: 'Goedgekeurd',    count: joinRequests.filter(r => r.status === 'approved').length },
                { key: 'rejected', label: 'Afgewezen',      count: joinRequests.filter(r => r.status === 'rejected').length },
                { key: 'all',      label: 'Alle',           count: joinRequests.length },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setRequestFilter(f.key)}
                  style={{
                    ...s.filterPill,
                    ...(requestFilter === f.key ? s.filterPillActive : {}),
                  }}
                >
                  {f.label}
                  {f.count > 0 && (
                    <span style={{
                      ...s.pillCount,
                      backgroundColor: requestFilter === f.key ? '#1e293b' : (f.key === 'pending' ? '#f59e0b' : '#334155'),
                      color: f.key === 'pending' && requestFilter !== f.key ? '#000' : '#94a3b8',
                    }}>
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {filteredRequests.length === 0 ? (
              <div style={s.emptyState}>
                <Bell size={36} color="#334155" />
                <p style={{ color: '#64748b', margin: '12px 0 0', fontSize: '14px' }}>
                  {requestFilter === 'pending' ? 'Geen openstaande aanvragen.' : 'Geen aanvragen gevonden.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredRequests.map(req => {
                  const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                  const initials = `${req.firstName?.[0] || '?'}${req.lastName?.[0] || ''}`.toUpperCase();
                  return (
                    <div key={req.id} style={{
                      ...s.requestCard,
                      borderColor: req.status === 'pending' ? '#f59e0b44' : '#334155',
                    }}>
                      {req.status === 'pending' && (
                        <div style={{ height: '3px', backgroundColor: '#f59e0b', margin: '-16px -16px 14px' }} />
                      )}

                      {/* Top row: avatar + info + delete */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={s.requestAvatar}>{initials}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span style={{ fontWeight: '700', fontSize: '15px', color: '#f1f5f9' }}>
                              {req.firstName} {req.lastName}
                            </span>
                            <span style={{ ...s.statusBadge, backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}>
                              {req.status === 'pending' && <Clock size={10} />}
                              {req.status === 'approved' && <CheckCircle2 size={10} />}
                              {req.status === 'rejected' && <XCircle size={10} />}
                              {cfg.label}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Building2 size={11} /> {req.clubName}
                            </span>
                            {req.email && <span>{req.email}</span>}
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Calendar size={11} />
                              {req.createdAt?.seconds
                                ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' })
                                : '—'}
                            </span>
                          </div>
                        </div>
                        <button style={{ ...s.iconBtn, color: '#64748b', flexShrink: 0 }} onClick={() => handleDeleteRequest(req.id)}>
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {/* Message */}
                      {req.message && (
                        <div style={s.requestMessage}>
                          <MessageSquare size={11} color="#475569" />
                          "{req.message}"
                        </div>
                      )}

                      {/* Rejection reason */}
                      {req.status === 'rejected' && req.rejectionReason && (
                        <div style={s.rejectionReason}>
                          <XCircle size={13} style={{ flexShrink: 0 }} />
                          <div>
                            <strong>Reden:</strong> {req.rejectionReason}
                          </div>
                        </div>
                      )}

                      {/* Resolved date */}
                      {req.resolvedAt?.seconds && req.status !== 'pending' && (
                        <div style={{ fontSize: '11px', color: '#475569', marginTop: '8px' }}>
                          Behandeld op {new Date(req.resolvedAt.seconds * 1000).toLocaleDateString('nl-BE', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      )}

                      {/* Action buttons for pending */}
                      {req.status === 'pending' && (
                        <div style={s.requestActions}>
                          <button style={s.approveBtn} onClick={() => handleApproveRequest(req.id)}>
                            <Check size={15} /> Goedkeuren
                          </button>
                          <button style={s.rejectBtn} onClick={() => openRejectModal(req.id)}>
                            <X size={15} /> Afwijzen
                          </button>
                        </div>
                      )}

                      {/* Approved hint */}
                      {req.status === 'approved' && (
                        <div style={s.approvedHint}>
                          <CheckCircle2 size={13} />
                          Voeg {req.firstName} toe aan een groep via het tabblad{' '}
                          <strong style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => setActiveTab('clubs')}>
                            Clubs
                          </strong>.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ════ REJECT MODAL ════ */}
      {rejectModalOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px' }}>
                <XCircle size={20} /> Aanvraag afwijzen
              </h3>
              <button style={s.iconBtn} onClick={() => setRejectModalOpen(false)}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px', lineHeight: 1.6 }}>
              Geef een duidelijke reden op. De gebruiker zal dit zien in zijn/haar dashboard.
            </p>
            <label style={s.fieldLabel}>Reden <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea
              autoFocus
              style={s.textarea}
              placeholder="bijv. De club accepteert momenteel geen nieuwe leden…"
              value={rejectReason}
              onChange={e => { setRejectReason(e.target.value); setRejectError(''); }}
            />
            {rejectError && (
              <div style={s.errorBanner}><AlertCircle size={13} /> {rejectError}</div>
            )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button style={{ ...s.rejectBtn, flex: 1, justifyContent: 'center', padding: '12px', opacity: rejectSaving ? 0.6 : 1 }} onClick={handleConfirmReject} disabled={rejectSaving}>
                {rejectSaving ? 'Opslaan…' : <><XCircle size={15} /> Bevestigen</>}
              </button>
              <button style={{ ...s.cancelBtn, flex: 1 }} onClick={() => setRejectModalOpen(false)}>
                Annuleren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ USER MODAL ════ */}
      {isUserModalOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Gebruiker {editingId ? 'bewerken' : 'toevoegen'}</h3>
              <button style={s.iconBtn} onClick={() => setIsUserModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleUserSubmit} style={s.form}>
              <label style={s.fieldLabel}>Voornaam</label>
              <input placeholder="Voornaam" required style={s.input} value={userForm.firstName} onChange={e => setUserForm({ ...userForm, firstName: e.target.value })} />
              <label style={s.fieldLabel}>Achternaam</label>
              <input placeholder="Achternaam" required style={s.input} value={userForm.lastName} onChange={e => setUserForm({ ...userForm, lastName: e.target.value })} />
              <label style={s.fieldLabel}>Email</label>
              <input placeholder="Email" style={s.input} value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} />
              <label style={s.fieldLabel}>Rol</label>
              <select style={s.input} value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })}>
                <option value="user">User</option>
                <option value="clubadmin">ClubAdmin</option>
                <option value="superadmin">SuperAdmin</option>
              </select>
              <button type="submit" style={s.saveBtn}><Save size={16} /> Opslaan</button>
            </form>
          </div>
        </div>
      )}

      {/* ════ CLUB MODAL ════ */}
      {isClubModalOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Club {editingId ? 'bewerken' : 'toevoegen'}</h3>
              <button style={s.iconBtn} onClick={() => setIsClubModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleClubSubmit} style={s.form}>
              <label style={s.fieldLabel}>Naam</label>
              <input placeholder="Club naam" required style={s.input} value={clubForm.name} onChange={e => setClubForm({ ...clubForm, name: e.target.value })} />
              <label style={s.fieldLabel}>Logo URL</label>
              <input placeholder="https://…" style={s.input} value={clubForm.logoUrl} onChange={e => setClubForm({ ...clubForm, logoUrl: e.target.value })} />
              <button type="submit" style={s.saveBtn}><Save size={16} /> Opslaan</button>
            </form>
          </div>
        </div>
      )}

      {/* ════ GROUP MODAL ════ */}
      {isGroupModalOpen && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <div style={s.modalHeader}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>Groep {editingId ? 'bewerken' : 'toevoegen'}</h3>
              <button style={s.iconBtn} onClick={() => setIsGroupModalOpen(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleGroupSubmit} style={s.form}>
              <label style={s.fieldLabel}>Naam</label>
              <input placeholder="Groep naam" required style={s.input} value={groupForm.name} onChange={e => setGroupForm({ ...groupForm, name: e.target.value })} />
              <label style={s.fieldLabel}>Hartslagmeters (HRM)</label>
              <div style={s.switchRow} onClick={() => setGroupForm({ ...groupForm, useHRM: !groupForm.useHRM })}>
                <div style={{ ...s.switchHalf, backgroundColor: groupForm.useHRM ? '#059669' : '#334155' }}>AAN</div>
                <div style={{ ...s.switchHalf, backgroundColor: !groupForm.useHRM ? '#ef4444' : '#334155' }}>UIT</div>
              </div>
              <button type="submit" style={s.saveBtn}><Save size={16} /> Opslaan</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Role color ───────────────────────────────────────────────────────────────
const getRoleColor = (role) => {
  if (role === 'superadmin') return '#ef4444';
  if (role === 'clubadmin') return '#f59e0b';
  return '#3b82f6';
};

// ─── Responsive CSS ───────────────────────────────────────────────────────────
const css = `
  * { box-sizing: border-box; }

  .btn-label { display: inline; }

  /* Card grids */
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 14px;
  }

  /* User list: table on desktop, cards on mobile */
  .user-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  @media (max-width: 600px) {
    .btn-label { display: none; }
    .card-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
  }

  @media (max-width: 400px) {
    .card-grid { grid-template-columns: 1fr; }
  }
`;

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  page: {
    backgroundColor: '#0f172a',
    minHeight: '100vh',
    color: 'white',
    fontFamily: 'system-ui, sans-serif',
  },

  // Header
  header: {
    backgroundColor: '#1e293b',
    borderBottom: '1px solid #334155',
    padding: '12px 16px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  headerTitle: {
    fontWeight: '800',
    fontSize: '16px',
    color: '#f1f5f9',
  },
  tabBar: {
    display: 'flex',
    gap: '6px',
    overflowX: 'auto',
  },
  tab: {
    padding: '7px 14px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    position: 'relative',
  },
  tabActive: {
    backgroundColor: '#3b82f6',
    color: 'white',
  },
  tabBadge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    backgroundColor: '#ef4444',
    color: 'white',
    fontSize: '9px',
    fontWeight: 'bold',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Content
  content: {
    padding: '16px',
    maxWidth: '900px',
    margin: '0 auto',
  },

  // Action bar
  actionBar: {
    display: 'flex',
    gap: '10px',
    marginBottom: '16px',
    alignItems: 'center',
  },
  searchWrap: {
    position: 'relative',
    flex: 1,
  },
  searchIcon: {
    position: 'absolute',
    left: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#64748b',
  },
  searchInput: {
    width: '100%',
    padding: '10px 10px 10px 34px',
    borderRadius: '8px',
    border: '1px solid #334155',
    backgroundColor: '#1e293b',
    color: 'white',
    fontSize: '14px',
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 14px',
    backgroundColor: '#3b82f6',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '13px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#60a5fa',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '14px',
    fontWeight: '600',
    padding: '0 0 14px 0',
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    padding: '6px',
    display: 'flex',
    alignItems: 'center',
  },

  // Section titles
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '14px',
    fontSize: '15px',
    fontWeight: '700',
    color: '#f1f5f9',
  },
  sectionTitleText: {
    fontSize: '17px',
    fontWeight: '800',
    color: '#f1f5f9',
  },

  // User cards
  userCard: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  userCardAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    backgroundColor: '#3b82f6',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '14px',
    flexShrink: 0,
  },
  userCardName: {
    fontWeight: '600',
    fontSize: '14px',
    color: '#f1f5f9',
    marginBottom: '2px',
  },
  userCardEmail: {
    fontSize: '12px',
    color: '#64748b',
    marginBottom: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  roleBadge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: '700',
    color: 'white',
  },

  // Club cards
  clubCard: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
    overflow: 'hidden',
    position: 'relative',
  },
  clubCardBody: {
    padding: '16px',
    textAlign: 'center',
    cursor: 'pointer',
  },
  clubLogo: {
    width: '60px',
    height: '60px',
    borderRadius: '10px',
    objectFit: 'cover',
    marginBottom: '10px',
  },
  clubLogoPlaceholder: {
    width: '60px',
    height: '60px',
    borderRadius: '10px',
    backgroundColor: '#0f172a',
    margin: '0 auto 10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clubCardName: {
    fontWeight: '700',
    fontSize: '14px',
    color: '#f1f5f9',
  },
  clubCardActions: {
    display: 'flex',
    justifyContent: 'center',
    gap: '4px',
    padding: '8px',
    borderTop: '1px solid #334155',
  },

  // Group cards
  groupCard: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
  },
  groupCardName: {
    fontWeight: '700',
    fontSize: '14px',
    color: '#f1f5f9',
  },
  countBadge: {
    fontSize: '10px',
    padding: '3px 8px',
    backgroundColor: '#0f172a',
    borderRadius: '4px',
    color: '#94a3b8',
  },
  hrmBadge: {
    fontSize: '10px',
    padding: '3px 8px',
    borderRadius: '4px',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },

  // Members
  filterRow: {
    marginBottom: '14px',
  },
  filterLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    color: '#94a3b8',
    cursor: 'pointer',
  },
  memberCard: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
    padding: '14px',
  },
  memberName: {
    fontWeight: '600',
    fontSize: '14px',
    color: '#f1f5f9',
  },
  memberEmail: {
    fontSize: '12px',
    color: '#64748b',
    marginTop: '2px',
  },
  roleToggle: {
    flex: 1,
    padding: '8px',
    borderRadius: '8px',
    border: 'none',
    color: 'white',
    fontSize: '12px',
    fontWeight: '700',
    cursor: 'pointer',
  },
  memberDates: {
    backgroundColor: '#0f172a',
    borderRadius: '8px',
    padding: '10px',
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  dateRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateInput: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    color: 'white',
    borderRadius: '6px',
    padding: '4px 8px',
    fontSize: '12px',
  },
  editBtn: {
    width: '100%',
    background: 'none',
    border: '1px solid #334155',
    color: '#94a3b8',
    padding: '8px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },
  saveBtn: {
    width: '100%',
    backgroundColor: '#22c55e',
    border: 'none',
    color: 'white',
    padding: '10px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
  },

  // Picker
  pickerPanel: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    border: '1px solid #334155',
    padding: '14px',
  },
  pickerTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#94a3b8',
    marginBottom: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  pickerList: {
    maxHeight: '240px',
    overflowY: 'auto',
    marginTop: '10px',
  },
  pickerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #334155',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#f1f5f9',
  },

  // Requests
  requestsHeader: {
    marginBottom: '14px',
  },
  filterPills: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    marginBottom: '16px',
  },
  filterPill: {
    padding: '6px 12px',
    borderRadius: '20px',
    border: '1px solid #334155',
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  filterPillActive: {
    backgroundColor: '#334155',
    color: '#f1f5f9',
    borderColor: '#475569',
  },
  pillCount: {
    padding: '1px 6px',
    borderRadius: '10px',
    fontSize: '10px',
    fontWeight: 'bold',
  },
  requestCard: {
    backgroundColor: '#1e293b',
    borderRadius: '14px',
    border: '1px solid',
    padding: '16px',
  },
  requestAvatar: {
    width: '42px',
    height: '42px',
    borderRadius: '10px',
    backgroundColor: '#3b82f622',
    border: '1px solid #3b82f644',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '14px',
    color: '#3b82f6',
    flexShrink: 0,
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontWeight: '700',
  },
  requestMessage: {
    marginTop: '10px',
    backgroundColor: '#0f172a',
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '13px',
    color: '#94a3b8',
    fontStyle: 'italic',
    borderLeft: '3px solid #334155',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '6px',
  },
  rejectionReason: {
    marginTop: '10px',
    backgroundColor: '#ef444411',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '13px',
    color: '#ef4444',
    borderLeft: '3px solid #ef4444',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  requestActions: {
    display: 'flex',
    gap: '10px',
    marginTop: '14px',
  },
  approveBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px',
    backgroundColor: '#22c55e',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
  },
  rejectBtn: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '10px',
    backgroundColor: '#ef4444',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
  },
  approvedHint: {
    marginTop: '12px',
    backgroundColor: '#22c55e11',
    border: '1px solid #22c55e33',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '12px',
    color: '#22c55e',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  // Empty state
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '60px 0',
  },
  emptyText: {
    color: '#475569',
    fontSize: '14px',
    textAlign: 'center',
    padding: '20px 0',
  },

  // Modals
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 500,
  },
  modal: {
    backgroundColor: '#1e293b',
    borderRadius: '20px 20px 0 0',
    padding: '24px',
    width: '100%',
    maxWidth: '560px',
    border: '1px solid #334155',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '18px',
    color: '#f1f5f9',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  fieldLabel: {
    display: 'block',
    fontSize: '12px',
    color: '#64748b',
    marginBottom: '4px',
    fontWeight: '600',
  },
  input: {
    width: '100%',
    padding: '11px 12px',
    borderRadius: '8px',
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: 'white',
    fontSize: '15px',
  },
  textarea: {
    width: '100%',
    minHeight: '100px',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: 'white',
    fontSize: '14px',
    resize: 'vertical',
    lineHeight: 1.5,
    boxSizing: 'border-box',
  },
  switchRow: {
    display: 'flex',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '1px solid #334155',
    cursor: 'pointer',
  },
  switchHalf: {
    flex: 1,
    padding: '10px',
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: '700',
    color: 'white',
  },
  cancelBtn: {
    padding: '12px',
    backgroundColor: '#475569',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontWeight: '600',
    cursor: 'pointer',
    fontSize: '13px',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: '#ef444422',
    color: '#ef4444',
    fontSize: '13px',
    padding: '10px 12px',
    borderRadius: '8px',
    marginTop: '10px',
    border: '1px solid #ef444433',
  },
};
