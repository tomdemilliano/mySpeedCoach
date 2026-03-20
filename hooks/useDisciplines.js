// hooks/useDisciplines.js
//
// Provides the full list of active disciplines from Firestore,
// plus convenience helpers that replace the old hardcoded constants:
//
//   DISCIPLINE_DURATION   →  getDuration(discipline.id)
//   DISC_LABELS           →  discipline.name   (or getLabel(id))
//   DISCIPLINES           →  disciplines (array of discipline objects)
//
// Usage:
//   const { disciplines, getDuration, getLabel, loading } = useDisciplines();
//
// The hook caches the result in module scope so multiple components
// on the same page don't each fire a separate Firestore subscription.

import { useState, useEffect } from 'react';
import { DisciplineFactory } from '../constants/dbSchema';

// ── Module-level cache ────────────────────────────────────────────────────────
let _cache       = null;   // array of discipline objects once loaded
let _subscribers = [];     // components waiting for the first load
let _unsubFirestore = null;

function notifySubscribers(data) {
  _cache = data;
  _subscribers.forEach(fn => fn(data));
}

function startFirestoreSubscription() {
  if (_unsubFirestore) return; // already listening
  _unsubFirestore = DisciplineFactory.getActive((data) => {
    notifySubscribers(data);
  });
}

// ── Fallback so the UI never completely breaks before DB is loaded ─────────────
export const FALLBACK_DISCIPLINES = [
  { id: 'sr_sprint',    name: 'Speed Sprint',    ropeType: 'SR', durationSeconds: 30,  teamSize: 1, isIndividual: true,  specialRule: null,          skippersCount: 1, isActive: true, sortOrder: 1 },
  { id: 'sr_end2',      name: 'Endurance 2 min', ropeType: 'SR', durationSeconds: 120, teamSize: 1, isIndividual: true,  specialRule: null,          skippersCount: 1, isActive: true, sortOrder: 2 },
  { id: 'sr_end3',      name: 'Endurance 3 min', ropeType: 'SR', durationSeconds: 180, teamSize: 1, isIndividual: true,  specialRule: null,          skippersCount: 1, isActive: true, sortOrder: 3 },
];

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useDisciplines() {
  const [disciplines, setDisciplines] = useState(_cache || []);
  const [loading, setLoading]         = useState(!_cache);

  useEffect(() => {
    if (_cache) {
      setDisciplines(_cache);
      setLoading(false);
    }

    // Register as a subscriber so we get updates when Firestore fires
    const handler = (data) => {
      setDisciplines(data);
      setLoading(false);
    };
    _subscribers.push(handler);
    startFirestoreSubscription();

    return () => {
      _subscribers = _subscribers.filter(fn => fn !== handler);
    };
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────
  /**
   * Returns durationSeconds for a discipline (by id or name).
   * null means untimed.
   */
  const getDuration = (idOrName) => {
    const disc = disciplines.find(d => d.id === idOrName || d.name === idOrName);
    return disc ? disc.durationSeconds : null;
  };

  /**
   * Returns the display name for a discipline id.
   */
  const getLabel = (idOrName) => {
    const disc = disciplines.find(d => d.id === idOrName || d.name === idOrName);
    return disc ? disc.name : idOrName;
  };

  /**
   * Returns the discipline object for an id or name.
   */
  const getDisc = (idOrName) =>
    disciplines.find(d => d.id === idOrName || d.name === idOrName) || null;

  /**
   * Returns only individual disciplines.
   */
  const individualDisciplines = disciplines.filter(d => d.isIndividual);

  /**
   * Returns only team disciplines.
   */
  const teamDisciplines = disciplines.filter(d => !d.isIndividual);

  return {
    disciplines,
    individualDisciplines,
    teamDisciplines,
    loading,
    getDuration,
    getLabel,
    getDisc,
  };
}
